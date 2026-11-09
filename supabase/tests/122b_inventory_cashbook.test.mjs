// Mig 122b — phiếu nhập kho "đã trả" tự sinh phiếu chi "Nhập hàng" trong CÙNG giao dịch; huỷ phiếu nhập huỷ luôn phiếu chi.
import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openCashShiftDb } from './helpers/cash-shift-db.mjs'
import { openCollectDb } from './helpers/collect-bill-db.mjs'

const migration = new URL('../migrations/122b_inventory_cashbook.sql', import.meta.url)
const load = async (u) => (await readFile(u, 'utf8')).replace(/\r\n/g, '\n')

// Phiếu nhập cũ (trước 122b) cho test backfill — dựng ở DB riêng trong khối backfill.
const legacy = { paidBank: randomUUID(), paidCash: randomUUID(), unpaid: randomUUID(), voided: randomUUID(), zero: randomUUID() }
const h = await openCashShiftDb({ through: '122b' })
const { db, ids, one, count, as, setShiftRequired, insertShift } = h
after(async () => db.close())

let beer
async function freshItem() {
  await db.exec('RESET ROLE')
  return (await one(`INSERT INTO inventory_items(store_id, name, unit, kind) VALUES ($1, $2, 'thùng', 'goods') RETURNING id`,
    [ids.store, `Bia ${randomUUID().slice(0, 8)}`])).id
}
beforeEach(async () => {
  await h.reset()
  beer = await freshItem()
})

const systemCategory = async (storeId) =>
  (await one("SELECT id FROM cash_book_categories WHERE store_id = $1 AND is_system AND report_group = 'inventory_purchase'", [storeId])).id

async function post(kind, doc, lines, requestId = randomUUID(), uid = ids.manager) {
  return (await as(uid, 'SELECT inventory_post_document($1, $2::jsonb, $3::jsonb, $4) AS r',
    [kind, JSON.stringify({ store_id: ids.store, ...doc }), JSON.stringify(lines), requestId])).rows[0].r
}
async function postReceipt({ paid, lines, requestId, supplier = 'NCC Bia' }) {
  const doc = paid ? { paid_status: 'paid', paid_method: paid } : { paid_status: 'unpaid' }
  const r = await post('receipt', { ...doc, supplier_name: supplier },
    lines.map(([item, qty, cost]) => ({ inventory_item_id: item, qty, unit_cost: cost })), requestId)
  return r.id
}
const voidDoc = (id, reason, uid = ids.manager) =>
  as(uid, 'SELECT inventory_void_document($1, $2) AS r', [id, reason]).then((r) => r.rows[0].r)
const entryOf = (docId) => one('SELECT * FROM cash_book_entries WHERE source_ref = $1', [docId])
const docRow = (id) => one('SELECT * FROM inventory_documents WHERE id = $1', [id])

describe('122b nối phiếu nhập ↔ phiếu chi', () => {
  test('phiếu nhập đã trả CK 1.200.000: một phiếu chi Nhập hàng, source inventory_receipt, source_ref = phiếu, cash_shift_id NULL', async () => {
    const doc = await postReceipt({ paid: 'bank', lines: [[beer, 24, 50000]] })
    const e = await entryOf(doc)
    assert.deepEqual([e.kind, e.method, Number(e.amount), e.source, e.cash_shift_id], ['payment', 'bank', 1200000, 'inventory_receipt', null])
    assert.equal(e.category_id, await systemCategory(ids.store))
    assert.equal(e.client_request_id, doc)
    assert.equal(e.created_by, ids.manager)
    assert.equal(e.counterparty, 'NCC Bia')
    const d = await docRow(doc)
    assert.equal(e.note, `Phiếu nhập ${d.doc_no}`)
    assert.equal(d.cash_book_entry_id, e.id)
  })

  test('đã trả TM khi bật ca có ca: phiếu chi gắn ca, két giảm đúng', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift({ openingCash: 2000000 })
    const doc = await postReceipt({ paid: 'cash', lines: [[beer, 10, 30000]] })
    const e = await entryOf(doc)
    assert.deepEqual([e.method, Number(e.amount), e.cash_shift_id], ['cash', 300000, shift])
    const t = (await one('SELECT cash_shift_totals($1) AS t', [shift])).t
    assert.deepEqual([t.cash_payments, t.expected_cash], [300000, 1700000])
  })

  test('đã trả TM khi bật ca không có ca: lỗi Chưa mở ca, KHÔNG có phiếu nhập, không có phiếu chi', async () => {
    await setShiftRequired(ids.store, true)
    await assert.rejects(postReceipt({ paid: 'cash', lines: [[beer, 1, 30000]] }), /Chưa mở ca/)
    assert.equal(await count("inventory_documents WHERE kind = 'receipt'"), 0)
    assert.equal(await count('inventory_document_lines'), 0)
    assert.equal(await count('cash_book_entries'), 0)
    // Chuyển khoản thì không cần ca.
    await postReceipt({ paid: 'bank', lines: [[beer, 1, 30000]] })
    assert.equal(await count('cash_book_entries'), 1)
  })

  test('chưa trả: không có phiếu chi; phiếu kiểm và phiếu xuất huỷ: không có phiếu chi', async () => {
    const unpaid = await postReceipt({ paid: null, lines: [[beer, 5, 10000]] })
    assert.equal((await docRow(unpaid)).cash_book_entry_id, null)
    await post('count', {}, [{ inventory_item_id: beer, counted_qty: 3 }])
    await post('writeoff', { note: 'vỡ' }, [{ inventory_item_id: beer, qty: 1 }])
    assert.equal(await count('cash_book_entries'), 0)
    assert.equal(await count('inventory_documents'), 3)
  })

  test('phiếu nhập đã trả 0đ: không có phiếu chi', async () => {
    const doc = await postReceipt({ paid: 'bank', lines: [[beer, 5, 0]] })
    assert.equal((await docRow(doc)).cash_book_entry_id, null)
    assert.equal(await count('cash_book_entries'), 0)
  })

  test('gửi lại cùng client_request_id: một phiếu nhập, một phiếu chi', async () => {
    const requestId = randomUUID()
    const a = await postReceipt({ paid: 'bank', lines: [[beer, 2, 50000]], requestId })
    const b = await postReceipt({ paid: 'bank', lines: [[beer, 2, 50000]], requestId })
    assert.equal(a, b)
    assert.equal(await count("inventory_documents WHERE kind = 'receipt'"), 1)
    assert.equal(await count('cash_book_entries'), 1)
    // Gọi lại hàm nội bộ cũng không nhân đôi (client_request_id = id phiếu).
    assert.equal((await one('SELECT inventory_receipt_cash_book($1) AS id', [a])).id, (await entryOf(a)).id)
    assert.equal(await count('cash_book_entries'), 1)
  })

  test('huỷ phiếu nhập đã trả: phiếu chi bị huỷ cùng, lý do có số phiếu nhập', async () => {
    const doc = await postReceipt({ paid: 'bank', lines: [[beer, 2, 50000]] })
    const r = await voidDoc(doc, '  nhập nhầm hàng  ')
    assert.equal(r.already, false)
    const e = await entryOf(doc)
    assert.ok(e.voided_at)
    assert.equal(e.voided_by, ids.manager)
    assert.equal(e.void_reason, `Huỷ phiếu nhập ${(await docRow(doc)).doc_no}: nhập nhầm hàng`)
    // Huỷ lần hai: already, không lỗi.
    assert.equal((await voidDoc(doc, 'lần hai')).already, true)
    // Lý do rất dài: phiếu chi vẫn huỷ được (cắt còn 500 ký tự).
    const doc2 = await postReceipt({ paid: 'bank', lines: [[beer, 1, 1000]] })
    await voidDoc(doc2, 'x'.repeat(500))
    assert.equal((await entryOf(doc2)).void_reason.length, 500)
    // Huỷ phiếu chưa trả: không có phiếu chi, không lỗi.
    const unpaid = await postReceipt({ paid: null, lines: [[beer, 1, 1000]] })
    assert.equal((await voidDoc(unpaid, 'nhầm')).already, false)
  })

  test('huỷ phiếu nhập TM sau khi ca đã kết: lỗi, phiếu nhập vẫn posted, phiếu chi còn hiệu lực', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const doc = await postReceipt({ paid: 'cash', lines: [[beer, 1, 30000]] })
    await as(ids.cashier, 'SELECT close_cash_shift($1, 0, NULL)', [shift]).catch(() => {})
    await db.query("UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $1, counted_cash = 0, expected_cash = 0, difference = 0 WHERE id = $2 AND status = 'open'", [ids.cashier, shift])
    await assert.rejects(voidDoc(doc, 'nhầm'), /Ca của phiếu này đã kết, không huỷ được/)
    assert.equal((await docRow(doc)).status, 'posted')
    assert.equal((await entryOf(doc)).voided_at, null)
  })

  test('huỷ phiếu nhập trả CHUYỂN KHOẢN sau khi ca đã kết: vẫn huỷ được (phiếu CK không gắn ca)', async () => {
    await setShiftRequired(ids.store, true)
    const shift = await insertShift()
    const doc = await postReceipt({ paid: 'bank', lines: [[beer, 1, 30000]] })
    assert.equal((await entryOf(doc)).cash_shift_id, null)
    await db.query("UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = $1, counted_cash = 0, expected_cash = 0, difference = 0 WHERE id = $2", [ids.cashier, shift])
    assert.equal((await voidDoc(doc, 'nhầm')).already, false)
    assert.equal((await docRow(doc)).status, 'voided')
    assert.ok((await entryOf(doc)).voided_at)
  })

  test('cash_book_void trực tiếp phiếu chi nguồn kho: bị chặn (Task 3), phiếu nhập không đổi', async () => {
    const doc = await postReceipt({ paid: 'bank', lines: [[beer, 1, 30000]] })
    const e = await entryOf(doc)
    await assert.rejects(as(ids.owner, 'SELECT cash_book_void($1, $2)', [e.id, 'xoá']), /Phiếu chi của phiếu nhập kho, huỷ ở trang Kho/)
    assert.equal((await entryOf(doc)).voided_at, null)
    assert.equal((await docRow(doc)).status, 'posted')
  })

  test('JSON phiếu (danh sách / chi tiết kho) có cash_book_entry_id để hộp huỷ báo "phiếu chi sẽ huỷ cùng"', async () => {
    const doc = await postReceipt({ paid: 'bank', lines: [[beer, 1, 30000]] })
    const j = (await one('SELECT inventory_document_json($1) AS j', [doc])).j
    assert.equal(j.cash_book_entry_id, (await entryOf(doc)).id)
    const unpaid = await postReceipt({ paid: null, lines: [[beer, 1, 30000]] })
    const ju = (await one('SELECT inventory_document_json($1) AS j', [unpaid])).j
    assert.ok('cash_book_entry_id' in ju)
    assert.equal(ju.cash_book_entry_id, null)
  })

  test('FK cash_book_entry_id → cash_book_entries', async () => {
    const doc = await postReceipt({ paid: null, lines: [[beer, 1, 30000]] })
    await assert.rejects(db.query('UPDATE inventory_documents SET cash_book_entry_id = $1 WHERE id = $2', [randomUUID(), doc]), /foreign key/)
  })

  test('hai hàm nội bộ: authenticated không EXECUTE được', async () => {
    for (const fn of ['inventory_receipt_cash_book(uuid)', 'inventory_receipt_cash_book_void(uuid,text)']) {
      for (const role of ['anon', 'authenticated', 'public']) {
        assert.equal((await one(`SELECT has_function_privilege($1, 'public.${fn}', 'EXECUTE') AS v`, [role])).v, false, `${role} ${fn}`)
      }
    }
  })
})

describe('122b backfill + neo', () => {
  test('backfill: phiếu nhập đã trả có từ trước 122b được tạo phiếu chi theo doc_date, cash_shift_id NULL; phiếu đã huỷ và chưa trả bỏ qua; chạy hai lần không nhân đôi', async () => {
    // Test này dùng DB riêng: beforeEach của khối trên xoá phiếu cũ.
    const fresh = await openCashShiftDb({
      through: '122b',
      before122b: async ({ db: d, ids: i }) => {
        const ins = (id, no, paid, method, status, total) => d.query(`INSERT INTO inventory_documents(id, store_id, kind, doc_no, doc_date,
            effective_at, supplier_name, total_amount, paid_status, paid_method, status, client_request_id, created_by, created_at,
            voided_at, voided_by, void_reason)
          VALUES ($1, $2, 'receipt', $3, '2026-11-01', '2026-11-01T10:00:00Z', 'NCC Bia', $4, $5, $6, $7, $1, $8, '2026-11-01T10:00:00Z',
            CASE WHEN $7 = 'voided' THEN now() END, CASE WHEN $7 = 'voided' THEN $8::uuid END, CASE WHEN $7 = 'voided' THEN 'x' END)`,
        [id, i.store, no, total, paid, method, status, i.manager])
        await ins(legacy.paidBank, 'NK-CU1', 'paid', 'bank', 'posted', 900000)
        await ins(legacy.paidCash, 'NK-CU2', 'paid', 'cash', 'posted', 50000)
        await ins(legacy.unpaid, 'NK-CU3', 'unpaid', null, 'posted', 70000)
        await ins(legacy.voided, 'NK-CU4', 'paid', 'cash', 'voided', 80000)
        await ins(legacy.zero, 'NK-CU5', 'paid', 'bank', 'posted', 0)
      },
    })
    try {
      const q = (sql, p = []) => fresh.db.query(sql, p).then((r) => r.rows)
      const rows = await q('SELECT * FROM cash_book_entries ORDER BY amount DESC')
      assert.equal(rows.length, 2)
      const bank = rows[0]
      assert.deepEqual([Number(bank.amount), bank.method, bank.kind, bank.source, bank.source_ref, bank.cash_shift_id, bank.client_request_id],
        [900000, 'bank', 'payment', 'inventory_receipt', legacy.paidBank, null, legacy.paidBank])
      assert.equal(bank.business_date.toISOString?.().slice(0, 10) ?? String(bank.business_date), '2026-11-01')
      assert.equal(bank.created_by, fresh.ids.manager)
      assert.equal(new Date(bank.created_at).toISOString(), '2026-11-01T10:00:00.000Z')
      assert.equal(bank.note, 'Phiếu nhập NK-CU1')
      assert.equal(rows[1].method, 'cash')
      assert.equal(rows[1].cash_shift_id, null)
      const docs = await q('SELECT id, cash_book_entry_id FROM inventory_documents ORDER BY doc_no')
      const linked = Object.fromEntries(docs.map((d) => [d.id, d.cash_book_entry_id]))
      assert.equal(linked[legacy.paidBank], bank.id)
      assert.equal(linked[legacy.unpaid], null)
      assert.equal(linked[legacy.voided], null)
      assert.equal(linked[legacy.zero], null)
      // Chạy lại đúng đoạn backfill: không nhân đôi.
      const sql = await load(migration)
      const start = sql.indexOf('-- backfill-start')
      const end = sql.indexOf('-- backfill-end')
      assert.ok(start > 0 && end > start)
      await fresh.db.exec(sql.slice(start, end))
      assert.equal((await q('SELECT count(*)::int AS n FROM cash_book_entries'))[0].n, 2)
    } finally {
      await fresh.db.close()
    }
  })

  test('hai neo khớp đúng 1 lần trong pg_get_functiondef sau mig 118', async () => {
    // DB chỉ tới 118 (chưa 122b): dựng helper thu tiền + 118 bằng openCashShiftDb nhưng đọc định nghĩa TRƯỚC 122b qua hook.
    let defs
    const pre = await openCashShiftDb({
      through: '122b',
      before122b: async ({ db: d }) => {
        defs = {
          post: (await d.query("SELECT pg_get_functiondef('public.inventory_post_document(text,jsonb,jsonb,uuid)'::regprocedure) AS d")).rows[0].d,
          void: (await d.query("SELECT pg_get_functiondef('public.inventory_void_document(uuid,text)'::regprocedure) AS d")).rows[0].d,
        }
      },
    })
    try {
      const countOf = (text, needle) => text.replace(/\r\n/g, '\n').split(needle).length - 1
      assert.equal(countOf(defs.post, '\n  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)\n'), 1)
      assert.equal(countOf(defs.void, '\n  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)\n'), 1)
      // Sau 122b: mỗi neo theo sau đúng một lời gọi.
      const after = async (sig) => (await pre.db.query(`SELECT pg_get_functiondef('public.${sig}'::regprocedure) AS d`)).rows[0].d
      assert.equal(countOf(await after('inventory_post_document(text,jsonb,jsonb,uuid)'),
        '  -- mevo-anchor:122b inventory_post_document.cash_book(v_doc_id)\n  PERFORM public.inventory_receipt_cash_book(v_doc_id);'), 1)
      assert.equal(countOf(await after('inventory_void_document(uuid,text)'),
        '  -- mevo-anchor:122b inventory_void_document.cash_book(v_doc_id)\n  PERFORM public.inventory_receipt_cash_book_void(v_doc_id, p_reason);'), 1)
    } finally {
      await pre.db.close()
    }
  })

  test('$pre$: thiếu 118 thì dừng', async () => {
    const base = await openCollectDb({ lock: true })
    try {
      await assert.rejects(base.db.exec(await load(migration)), /mig 122b/)
    } finally {
      await base.db.close()
    }
  })
})
