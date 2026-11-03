// Mig 108 — giảm giá bill: vá TẠI CHỖ 8 RPC sống bằng pg_temp.mevo_patch (trừ giảm giá lúc thu tiền
// + trả giảm giá cho POS, in, A04, Mini App).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/108_bill_discount_patch_rpcs.sql', import.meta.url)

// core.autocrlf: bản checkout trên Windows có thể là CRLF; helper SQL cũng đổi CRLF → LF trước khi so.
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
// Bản prod-defs giữ NGUYÊN dòng như pg_get_functiondef (2 hàm trên prod lẫn CRLF trong thân):
// helper chỉ chuẩn hoá chuỗi neo, KHÔNG chuẩn hoá định nghĩa → test phải so y như vậy.
const loadRaw = async (url) => readFile(url, 'utf8')

// Chữ ký lấy từ prod (pg_proc.oid::regprocedure / pg_get_function_identity_arguments), không theo file cũ.
const SIG = {
  close: 'public.close_table_session(uuid,text,text)',
  recompute: 'public.recompute_order_total(uuid)',
  merge: 'public.merge_session_into_tray(uuid,uuid)',
  list: 'public.list_open_table_sessions(uuid)',
  bill: 'public.get_sessions_bill(uuid[])',
  report: 'public.get_bills_report(uuid,date)',
  tableBill: 'public.get_table_session_bill(uuid,text,text)',
  state: 'public.get_table_session_state(uuid,text,text)',
}
const FILE = {
  close: 'close_table_session.sql',
  recompute: 'recompute_order_total.sql',
  merge: 'merge_session_into_tray.sql',
  list: 'list_open_table_sessions.sql',
  bill: 'get_sessions_bill.sql',
  report: 'get_bills_report.sql',
  tableBill: 'get_table_session_bill.sql',
  state: 'get_table_session_state.sql',
}

// Mọi lời gọi mevo_patch cho một chữ ký: [{from, to}] (chuỗi neo/thay thế nằm giữa $a$…$a$ / $b$…$b$).
function patches(sql, sig) {
  const out = []
  const re = /pg_temp\.mevo_patch\(\s*'([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\s*\)/g
  for (const m of sql.matchAll(re)) if (m[1] === sig) out.push({ from: m[2], to: m[3] })
  return out
}
const allTo = (ps) => ps.map((p) => p.to).join('\n')

test('mig 108 vá đúng 8 chữ ký prod bằng pg_temp.mevo_patch, không CREATE OR REPLACE RPC sống', async () => {
  const sql = await load(migration)
  assert.match(sql, /CREATE OR REPLACE FUNCTION pg_temp\.mevo_patch\(p_sig text, p_from text, p_to text\)/)
  assert.match(sql, /mig 108: % không còn chuỗi cần vá/)
  assert.match(sql, /mig 108: % có hơn một chỗ khớp chuỗi cần vá/)
  assert.match(sql, /replace\(p_from, E'\\r\\n', E'\\n'\)/)
  for (const sig of Object.values(SIG)) {
    assert.ok(patches(sql, sig).length > 0, `thiếu mevo_patch cho ${sig}`)
  }
  // Không gọi mevo_patch cho chữ ký nào khác
  const sigs = new Set([...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1]))
  assert.deepEqual([...sigs].sort(), Object.values(SIG).sort())
  for (const name of ['close_table_session', 'recompute_order_total', 'merge_session_into_tray',
    'list_open_table_sessions', 'get_sessions_bill', 'get_bills_report', 'get_table_session_bill',
    'get_table_session_state', 'close_table_sessions_bulk']) {
    assert.doesNotMatch(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`))
  }
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/)
})

test('điều kiện trước: thiếu đối tượng mig 107 thì dừng', async () => {
  const sql = await load(migration)
  const pre = sql.slice(sql.indexOf('DO $pre$'), sql.indexOf('$pre$;'))
  assert.ok(pre.length > 0, 'thiếu khối DO $pre$')
  assert.match(pre, /public\.bill_discount_amount\(bigint,text,integer\)'::regprocedure/)
  assert.match(pre, /public\.session_unpaid_subtotal\(uuid\)'::regprocedure/)
  assert.match(pre, /table_session_discount_changes/)
  assert.match(pre, /bill_discount_type/)
  assert.match(pre, /bill_discount_value/)
  assert.match(pre, /'orders'[\s\S]*bill_discount_amount|bill_discount_amount[\s\S]*'orders'/)
  assert.match(pre, /mig 108: thiếu/)
  // Khối điều kiện đứng trước mọi lời vá
  assert.ok(sql.indexOf('DO $pre$') < sql.indexOf("pg_temp.mevo_patch('public."))
})

test('chuỗi neo khớp nguyên văn định nghĩa prod đã lưu (prod-defs/108), áp tuần tự', async () => {
  const sql = await load(migration)
  const defs = new URL('../../.superpowers/sdd/2026-11-02-chuyen-ban-giam-gia-bill/prod-defs/108/', import.meta.url)
  for (const key of Object.keys(SIG)) {
    let def
    try { def = await loadRaw(new URL(FILE[key], defs)) } catch { continue } // bản lưu chỉ có trong worktree làm việc
    for (const { from, to } of patches(sql, SIG[key])) {
      const n = def.split(from).length - 1
      assert.equal(n, 1, `${SIG[key]}: chuỗi neo phải khớp đúng 1 lần, đang khớp ${n}:\n${from}`)
      def = def.replace(from, () => to)
    }
  }
})

test('close_table_session(paid): kiểm giảm giá > tiền hàng, bỏ qua phiên hết hạn, chia rồi trừ TRƯỚC khi ghi nhận tiền', async () => {
  const sql = await load(migration)
  const ps = patches(sql, SIG.close)
  const all = allTo(ps)
  assert.ok(all.includes("RAISE EXCEPTION 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá'"), 'thiếu lỗi giảm giá')
  assert.ok(all.includes("'expired'"), "thiếu nhánh bỏ qua phiên 'expired'")
  assert.match(all, /public\.session_unpaid_subtotal\(p_session_id\)/)
  assert.match(all, /public\.bill_discount_amount\(/)
  // Gọi helper luôn có schema (cột orders.bill_discount_amount trùng tên hàm)
  assert.doesNotMatch(all.replace(/public\.bill_discount_amount\(/g, ''), /(?<![.\w])bill_discount_amount\(/)
  // Chia theo total_amount, hoà → id nhỏ nhất theo chuỗi; trừ cả total_amount lẫn payment_amount
  assert.match(all, /ORDER BY [\s\S]*DESC, [\s\S]*id::text COLLATE "C"/)
  assert.match(all, /div\(/)
  // Phần dư lấp lần lượt, mỗi đơn không nhận quá total_amount của nó (không còn "dồn hết vào đơn thắng")
  assert.match(all, /LEAST\(GREATEST\(rk\.amt - rk\.share, 0\), rk\.rem - rk\.room_before\)/)
  assert.doesNotMatch(all, /CASE WHEN sh\.id = w\.id/)
  assert.match(all, /bill_discount_amount = o\.bill_discount_amount \+/)
  assert.match(all, /total_amount = o\.total_amount -/)
  assert.match(all, /payment_amount = o\.total_amount -/)

  const hook = ps.find((p) => p.to.includes('Giảm giá lớn hơn tiền hàng'))
  // Khối giảm giá nằm trong nhánh paid, SAU kiểm phương tiện, TRƯỚC UPDATE ghi payment_received_*
  assert.ok(hook.from.includes("Phương tiện thanh toán không hợp lệ"), 'neo phải là khối kiểm phương tiện (chỉ có ở nhánh paid)')
  assert.ok(hook.to.indexOf('Phương tiện thanh toán không hợp lệ') < hook.to.indexOf('Giảm giá lớn hơn tiền hàng'))
  const defs = new URL('../../.superpowers/sdd/2026-11-02-chuyen-ban-giam-gia-bill/prod-defs/108/', import.meta.url)
  let def
  try { def = await loadRaw(new URL(FILE.close, defs)) } catch { return }
  for (const { from, to } of ps) def = def.replace(from, () => to)
  const iDisc = def.indexOf('Giảm giá lớn hơn tiền hàng')
  const iPaid = def.indexOf('SET payment_received_at = now()')
  const iStaff = def.indexOf("SET status = 'cancelled'")
  assert.ok(iDisc > 0 && iDisc < iPaid, 'giảm giá phải chia TRƯỚC khi ghi payment_received_*')
  assert.ok(iDisc < iStaff, 'khối giảm giá không được nằm ở nhánh staff_reset')
  assert.match(def, /v_session\.close_reason IS DISTINCT FROM 'expired'/)
})

test('recompute_order_total trừ bill_discount_amount ở total_amount, payment_amount và giá trị trả về', async () => {
  const sql = await load(migration)
  const ps = patches(sql, SIG.recompute)
  // Thân hàm trên prod là CRLF: mọi neo phải nằm trên MỘT dòng
  for (const p of ps) assert.ok(!p.from.includes('\n'), `neo recompute_order_total phải 1 dòng: ${p.from}`)
  const all = allTo(ps)
  assert.match(all, /total_amount = v_total - bill_discount_amount/)
  assert.match(all, /payment_amount = v_total - bill_discount_amount/)
  assert.match(all, /RETURNING total_amount INTO v_total/)
})

test('merge_session_into_tray: bỏ ý định giảm giá của phiên nguồn + ghi nhật ký new_type NULL', async () => {
  const sql = await load(migration)
  const all = allTo(patches(sql, SIG.merge))
  // Hàm gốc viết thường (insert/if/is not null) → so không phân biệt hoa thường
  assert.match(all, /INSERT INTO public\.table_session_discount_changes/i)
  assert.match(all, /v_src\.bill_discount_type, v_src\.bill_discount_value, NULL, NULL/)
  assert.match(all, /bill_discount_type = NULL/)
  assert.match(all, /bill_discount_value = NULL/)
  assert.match(all, /v_src\.bill_discount_type IS NOT NULL/i)
  // Nhật ký ghi TRƯỚC khi xoá ý định trên phiên nguồn
  const ps = patches(sql, SIG.merge)
  const hook = ps.find((p) => /table_session_discount_changes/i.test(p.to))
  assert.ok(hook.to.search(/insert into/i) < hook.to.indexOf('bill_discount_type = NULL'))
})

test('đọc: POS, in bill, A04, Mini App nhận trường giảm giá mới', async () => {
  const sql = await load(migration)
  const list = allTo(patches(sql, SIG.list))
  // Phiên hết hạn còn nợ cũng được liệt kê nhưng server bỏ qua giảm giá → chỉ phiên open mới trả ý định
  assert.match(list, /CASE WHEN s\.status = 'open' THEN s\.bill_discount_type END AS bill_discount_type/)
  assert.match(list, /CASE WHEN s\.status = 'open' THEN s\.bill_discount_value END AS bill_discount_value/)

  const bill = patches(sql, SIG.bill)
  for (const p of bill) assert.ok(!p.from.includes('\n'), `neo get_sessions_bill phải 1 dòng (prod CRLF): ${p.from}`)
  const billTo = allTo(bill)
  assert.match(billTo, /AS discount,/)
  assert.match(billTo, /AS discount_label/)
  assert.match(billTo, /'grand_discount'/)
  assert.match(billTo, /s\.status = 'open'/)
  assert.match(billTo, /public\.session_unpaid_subtotal\(s\.id\)/)
  assert.match(billTo, /SUM\(o\.bill_discount_amount\)/)
  assert.match(billTo, /'%'/)

  const report = allTo(patches(sql, SIG.report))
  assert.match(report, /o\.bill_discount_amount AS bill_disc/)
  assert.match(report, /COALESCE\(o\.discount_amount, 0\) \+ o\.bill_discount_amount AS discount_amount/)
  assert.match(report, /'bill_discount', b\.bill_discount/)

  const tb = allTo(patches(sql, SIG.tableBill))
  assert.match(tb, /'bill_discount', public\.bill_discount_amount\(public\.session_unpaid_subtotal\(v_session\.id\)/)
  const st = allTo(patches(sql, SIG.state))
  assert.match(st, /'bill_discount',public\.bill_discount_amount\(public\.session_unpaid_subtotal\(v_s\.id\)/)
  // state chỉ thêm ở nhánh owner
  assert.ok(patches(sql, SIG.state).every((p) => p.from.includes("'state','owner'") || !p.to.includes('bill_discount')))
})
