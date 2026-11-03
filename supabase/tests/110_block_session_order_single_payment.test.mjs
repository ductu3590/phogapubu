// Mig 110 — bàn trả sau thu CẢ BÀN một lần: chặn thu lẻ từng lượt của phiên bàn (vá tại chỗ 2 RPC ghi
// payment_received_at cho một đơn) + REVOKE 2 hàm nội bộ tính tiền đơn khỏi anon/authenticated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/110_block_session_order_single_payment.sql', import.meta.url)
const defs = new URL('../../.superpowers/sdd/2026-11-02-chuyen-ban-giam-gia-bill/prod-defs/110/', import.meta.url)

// core.autocrlf: bản checkout trên Windows có thể là CRLF; helper SQL cũng đổi CRLF → LF trước khi so.
const load = async (url) => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')
// Bản prod-defs giữ NGUYÊN như pg_get_functiondef (helper không chuẩn hoá định nghĩa).
const loadRaw = async (url) => readFile(url, 'utf8')

const SIG = {
  owner: 'public.confirm_manual_payment(uuid)',
  kitchen: 'public.kitchen_confirm_payment(uuid)',
}
const FILE = { owner: 'confirm_manual_payment.sql', kitchen: 'kitchen_confirm_payment.sql' }
const MSG = "raise exception 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)'"

function patches(sql, sig) {
  const out = []
  const re = /pg_temp\.mevo_patch\(\s*'([^']+)',\s*\$a\$([\s\S]*?)\$a\$,\s*\$b\$([\s\S]*?)\$b\$\s*\)/g
  for (const m of sql.matchAll(re)) if (m[1] === sig) out.push({ from: m[2], to: m[3] })
  return out
}

test('mig 110 vá đúng 2 RPC thu lẻ bằng pg_temp.mevo_patch, không đụng close_table_session(s)', async () => {
  const sql = await load(migration)
  assert.match(sql, /CREATE OR REPLACE FUNCTION pg_temp\.mevo_patch\(p_sig text, p_from text, p_to text\)/)
  assert.match(sql, /mig 110: % không còn chuỗi cần vá/)
  assert.match(sql, /mig 110: % có hơn một chỗ khớp chuỗi cần vá/)
  assert.match(sql, /replace\(p_from, E'\\r\\n', E'\\n'\)/)
  const sigs = new Set([...sql.matchAll(/pg_temp\.mevo_patch\(\s*'([^']+)'/g)].map((m) => m[1]))
  assert.deepEqual([...sigs].sort(), Object.values(SIG).sort())
  for (const name of ['confirm_manual_payment', 'kitchen_confirm_payment', 'close_table_session',
    'close_table_sessions_bulk', 'recompute_order_total', 'add_order_line']) {
    assert.doesNotMatch(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b`))
  }
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.match(sql, /NOTIFY pgrst, 'reload schema';\s*$/)
})

test('chuỗi neo khớp nguyên văn định nghĩa prod đã lưu (prod-defs/110), đúng 1 lần', async () => {
  const sql = await load(migration)
  for (const key of Object.keys(SIG)) {
    let def
    try { def = await loadRaw(new URL(FILE[key], defs)) } catch { continue } // bản lưu chỉ có trong worktree làm việc
    const ps = patches(sql, SIG[key])
    assert.equal(ps.length, 1, `${SIG[key]}: cần đúng 1 lời vá`)
    for (const { from, to } of ps) {
      const n = def.split(from).length - 1
      assert.equal(n, 1, `${SIG[key]}: chuỗi neo phải khớp đúng 1 lần, đang khớp ${n}:\n${from}`)
      def = def.replace(from, () => to)
    }
    // Chặn đặt SAU nhánh "đã thu → already" (gọi lặp vẫn idempotent) và TRƯỚC câu UPDATE ghi tiền
    const iAlready = def.indexOf("'already', true")
    const iGuard = def.indexOf('Bàn trả sau thu cả bàn một lần')
    const iUpdate = def.indexOf('set payment_received_at = now()')
    assert.ok(iAlready > 0 && iAlready < iGuard, `${SIG[key]}: chặn phải nằm sau nhánh already`)
    assert.ok(iGuard < iUpdate, `${SIG[key]}: chặn phải nằm trước UPDATE`)
  }
})

test('chặn: đơn thuộc phiên đang mở hoặc hết hạn còn nợ → lỗi tiếng Việt', async () => {
  const sql = await load(migration)
  for (const sig of Object.values(SIG)) {
    const [p] = patches(sql, sig)
    assert.ok(p.to.includes(MSG), `${sig}: thiếu thông báo lỗi`)
    assert.match(p.to, /v_order\.session_id is not null/)
    assert.match(p.to, /from public\.table_sessions s/)
    assert.match(p.to, /s\.status = 'open' or s\.close_reason = 'expired'/)
    // Neo là câu UPDATE gốc — giữ nguyên ở cuối bản thay
    assert.ok(p.to.endsWith(p.from), `${sig}: phải giữ nguyên câu UPDATE gốc ở cuối`)
  }
})

test('REVOKE 2 hàm nội bộ khỏi PUBLIC, anon, authenticated + kiểm hàm gọi phải SECURITY DEFINER trước', async () => {
  const sql = await load(migration)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.recompute_order_total\(uuid\) FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.add_order_line\(uuid, uuid, jsonb\) FROM PUBLIC, anon, authenticated;/)
  assert.doesNotMatch(sql, /GRANT /i)
  const pre = sql.slice(sql.indexOf('DO $pre$'), sql.indexOf('$pre$;'))
  assert.ok(pre.length > 0, 'thiếu khối DO $pre$')
  assert.match(pre, /NOT p\.prosecdef/)
  assert.match(pre, /recompute_order_total/)
  assert.match(pre, /add_order_line/)
  assert.match(pre, /RAISE EXCEPTION 'mig 110:/)
  assert.ok(sql.indexOf('DO $pre$') < sql.indexOf('REVOKE ALL'))
})
