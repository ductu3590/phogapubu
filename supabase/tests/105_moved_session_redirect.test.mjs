// Mig 105 — không sinh "bill ma" sau khi chuyển bàn: vá TẠI CHỖ 3 RPC sống bằng pg_temp.mevo_patch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/105_moved_session_redirect.sql', import.meta.url)

// core.autocrlf: bản checkout trên Windows có thể là CRLF; helper SQL cũng đổi CRLF → LF trước khi so.
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

// Chữ ký lấy từ prod (pg_proc.oid::regprocedure), không theo file migration cũ.
const SIG_STATE = 'public.get_table_session_state(uuid,text,text)'
const SIG_BATCH = 'public.create_table_order_batch(uuid,uuid,jsonb,text,uuid,text,text,text,text,uuid)'
const SIG_ORDER = 'public.create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)'

// Mọi lời gọi mevo_patch cho một chữ ký: [{from, to}] (chuỗi neo/thay thế nằm giữa $a$…$a$ / $b$…$b$).
function patches(sql, sig) {
  const out = []
  const re = /pg_temp\.mevo_patch\(\s*'([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\s*\)/g
  for (const m of sql.matchAll(re)) if (m[1] === sig) out.push({ from: m[2], to: m[3] })
  return out
}

const all105 = (ps) => ps.map((p) => p.to).join('\n')

test('mig 105 vá đúng 3 chữ ký prod bằng pg_temp.mevo_patch, không CREATE OR REPLACE RPC sống', async () => {
  const sql = await load(migration)
  assert.match(sql, /CREATE OR REPLACE FUNCTION pg_temp\.mevo_patch\(p_sig text, p_from text, p_to text\)/)
  assert.match(sql, /mig 105: % không còn chuỗi cần vá/)
  for (const sig of [SIG_STATE, SIG_BATCH, SIG_ORDER]) {
    assert.ok(patches(sql, sig).length > 0, `thiếu mevo_patch cho ${sig}`)
  }
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.create_order/)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.create_table_order_batch/)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.get_table_session_state/)
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/)
})

test('helper vá: chuỗi neo phải xuất hiện ĐÚNG MỘT lần (không vá nhầm chỗ thứ hai)', async () => {
  const sql = await load(migration)
  assert.match(sql, /mig 105: % có hơn một chỗ khớp chuỗi cần vá/)
})

test('chuỗi neo khớp nguyên văn định nghĩa prod đã lưu (prod-defs)', async () => {
  const sql = await load(migration)
  const defs = new URL('./prod-defs/', import.meta.url)
  for (const [sig, file] of [
    [SIG_STATE, 'get_table_session_state.sql'],
    [SIG_BATCH, 'create_table_order_batch.sql'],
    [SIG_ORDER, 'create_order.sql'],
  ]) {
    let def
    def = await load(new URL(file, defs)) // bản chụp prod lúc viết mig (supabase/tests/prod-defs) — thiếu file là FAIL
    // Áp tuần tự như migration: neo sau có thể nằm trong phần neo trước vừa thay.
    for (const { from, to } of patches(sql, sig)) {
      const n = def.split(from).length - 1
      assert.equal(n, 1, `${sig}: chuỗi neo phải khớp đúng 1 lần, đang khớp ${n}:\n${from}`)
      def = def.replace(from, () => to)
    }
    if (sig === SIG_ORDER) {
      // Thân hàm SAU khi vá: tra lần đầu → khoá bàn → tra lại → mở phiên
      const i1 = def.indexOf('FROM moved_session_for_caller(p_table_id, p_zalo_user_id, p_device_id) m;')
      const iLock = def.indexOf('PERFORM lock_table_for_session(p_table_id);')
      const iRe = def.indexOf('moved_session_for_caller(v_orig_table_id')
      const iRaise = def.indexOf("'Bàn vừa được chuyển, vui lòng thử lại'")
      const iIns = def.indexOf('INSERT INTO table_sessions')
      assert.ok(i1 > 0 && i1 < iLock && iLock < iRe && iRe < iRaise && iRaise < iIns,
        `create_order đã vá sai thứ tự: ${[i1, iLock, iRe, iRaise, iIns]}`)
    }
  }
})

test('get_table_session_state trả state moved TRƯỚC nhánh reserved và trước tra phiên của bàn', async () => {
  const sql = await load(migration)
  const ps = patches(sql, SIG_STATE)
  const all = ps.map((p) => p.to).join('\n')
  assert.ok(all.includes("'moved'"), "thiếu state 'moved'")
  assert.ok(all.includes('moved_session_for_caller(p_table_id'), 'thiếu gọi moved_session_for_caller')
  assert.ok(all.includes("'table_number'"), 'biến thể moved phải trả table_number')

  const hook = ps.find((p) => p.to.includes("'moved'"))
  // Neo của chỗ chèn chứa dòng reserved → khối moved phải đứng TRƯỚC dòng đó trong bản thay.
  const iMoved = hook.to.indexOf("'moved'")
  const iReserved = hook.to.indexOf('table_has_current_reservation_hold(p_table_id,now())')
  assert.ok(iReserved > 0, 'neo phải là dòng kiểm reserved')
  assert.ok(iMoved < iReserved, 'moved phải kiểm trước reserved')
  assert.ok(hook.to.indexOf('expire_stale_table_sessions') < iMoved, 'moved kiểm SAU khi dọn phiên hết hạn')
  // Phiên đang giữ lại chính bàn này (thêm lại vào mâm) → không chuyển hướng
  assert.match(hook.to, /session_tables/)
})

test('create_table_order_batch: chuyển hướng SAU khối replay, nhận expected NULL hoặc = phiên đã chuyển, lưu bàn gốc', async () => {
  const sql = await load(migration)
  const ps = patches(sql, SIG_BATCH)
  const all = ps.map((p) => p.to).join('\n')
  assert.ok(all.includes('moved_session_for_caller(p_table_id'), 'thiếu gọi moved_session_for_caller')

  const hook = ps.find((p) => p.to.includes('moved_session_for_caller('))
  // Neo nằm ngay sau RETURN của khối replay
  assert.ok(hook.from.includes('RETURN to_jsonb(v_order);\n  END IF;'), 'phải chèn ngay sau khối replay')
  assert.ok(hook.to.indexOf('RETURN to_jsonb(v_order);') < hook.to.indexOf('moved_session_for_caller('))
  assert.match(hook.to, /p_table_id := v_moved_table/)

  // Bản ghi chống gửi trùng vẫn lưu bàn GỐC (replay so table_id gốc) và expected gốc
  const ins = ps.find((p) => p.from.includes('INSERT INTO public.table_order_batch_requests') || p.from.includes('p_store_id, p_client_request_id, p_table_id, v_order.id'))
  assert.ok(ins, 'phải vá INSERT table_order_batch_requests để lưu bàn gốc')
  assert.match(ins.to, /p_store_id, p_client_request_id, v_request_table_id, v_order\.id, p_expected_session_id/)
  assert.match(all, /v_request_table_id uuid := p_table_id/)

  // Hai câu kiểm phiên dùng expected đã quy đổi
  const chk = ps.find((p) => p.from.includes('IS DISTINCT FROM v_current_session_id'))
  assert.ok(chk, 'phải vá 2 câu kiểm expected_session_id')
  assert.doesNotMatch(chk.to, /p_expected_session_id/)
  assert.match(chk.to, /v_expected_session_id/)
})

test('create_order: chuyển hướng trước lock_table_for_session trong KHỐI PHIÊN BÀN + ghi device_id', async () => {
  const sql = await load(migration)
  const ps = patches(sql, SIG_ORDER)
  const hook = ps.find((p) => p.to.includes('moved_session_for_caller('))
  assert.ok(hook, 'thiếu gọi moved_session_for_caller')
  assert.ok(hook.to.indexOf('moved_session_for_caller(') < hook.to.indexOf('PERFORM lock_table_for_session(p_table_id);'),
    'phải chuyển hướng TRƯỚC khi khoá bàn')
  assert.match(hook.to, /p_table_id := v_moved_table/)

  // Bàn gốc app gửi lên được nhớ TRƯỚC khi chuyển hướng (để tra lại sau khi giữ khoá)
  assert.ok(hook.to.indexOf('v_orig_table_id := p_table_id;') >= 0 &&
    hook.to.indexOf('v_orig_table_id := p_table_id;') < hook.to.indexOf('p_table_id := v_moved_table'),
    'phải nhớ v_orig_table_id trước khi đổi p_table_id')

  // Chốt chặn race: tra lại SAU khi giữ khoá bàn, ngay trước khi mở phiên mới
  const guard = ps.find((p) => p.from.includes('INSERT INTO table_sessions'))
  assert.ok(guard, 'phải vá nhánh mở phiên mới (INSERT INTO table_sessions)')
  assert.ok(guard.from.includes('IF v_session_id IS NULL THEN'), 'neo phải là nhánh v_session_id IS NULL')
  const iRaise = guard.to.indexOf("RAISE EXCEPTION 'Bàn vừa được chuyển, vui lòng thử lại'")
  assert.ok(iRaise > 0, 'thiếu lỗi thử lại bằng tiếng Việt')
  assert.ok(guard.to.indexOf('moved_session_for_caller(v_orig_table_id') >= 0 &&
    guard.to.indexOf('moved_session_for_caller(v_orig_table_id') < iRaise, 'phải tra lại bàn gốc')
  assert.ok(guard.to.indexOf('moved_session_for_caller(p_table_id') >= 0 &&
    guard.to.indexOf('moved_session_for_caller(p_table_id') < iRaise, 'phải tra lại bàn đang định mở')
  assert.ok(iRaise < guard.to.indexOf('INSERT INTO table_sessions'), 'tra lại phải đứng TRƯỚC khi mở phiên')
  // ...và phiên hook (tra lần đầu) đứng trước lock, phiên tra lại đứng sau lock trong thân hàm đã vá
  const iLock = sql.indexOf('PERFORM lock_table_for_session(p_table_id);$b$')
  assert.ok(iLock > 0 && iLock < sql.indexOf("Bàn vừa được chuyển, vui lòng thử lại'"),
    'chốt tra lại phải được vá sau khối khoá bàn')
  assert.match(all105(ps), /v_moved_session uuid; v_moved_table uuid; v_orig_table_id uuid;/)

  // Neo là phần cột + VALUES của câu INSERT INTO orders (prod-defs: câu INSERT duy nhất vào orders)
  const ins = ps.find((p) => p.from.includes('delivery_address, session_id)'))
  assert.ok(ins, 'phải vá câu INSERT orders')
  assert.match(ins.to, /delivery_address, session_id, device_id\)/)
  assert.match(ins.to, /v_session_id, NULLIF\(btrim\(p_device_id\), ''\)\)/)
})
