// Mig 107 — giảm giá bill: ý định trên phiên, cột orders.bill_discount_amount, nhật ký, 2 helper, 2 RPC đặt giảm giá.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/107_bill_discount.sql', import.meta.url)

// Cắt riêng thân một hàm để assert không "ăn may" từ hàm khác trong cùng file.
function body(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`)
  assert.ok(start >= 0, `thiếu hàm ${name}`)
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2)
  return sql.slice(start, end)
}

test('mig 107 thêm cột giảm giá trên table_sessions + orders và ràng buộc', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /ALTER TABLE public\.table_sessions[\s\S]*?ADD COLUMN IF NOT EXISTS bill_discount_type text/)
  assert.match(sql, /bill_discount_type IN \('amount', 'percent'\)/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS bill_discount_value integer/)
  assert.match(sql, /bill_discount_value >= 0/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS bill_discount_set_by uuid/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS bill_discount_set_at timestamptz/)
  // type và value cùng NULL hoặc cùng có; percent <= 100
  assert.match(sql, /\(bill_discount_type IS NULL\) = \(bill_discount_value IS NULL\)/)
  assert.match(sql, /bill_discount_type IS DISTINCT FROM 'percent' OR bill_discount_value <= 100/)

  assert.match(sql, /ALTER TABLE public\.orders[\s\S]*?ADD COLUMN IF NOT EXISTS bill_discount_amount integer NOT NULL DEFAULT 0/)
  assert.match(sql, /bill_discount_amount >= 0/)
})

test('mig 107 dựng bảng nhật ký table_session_discount_changes với RLS như table_session_moves', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.table_session_discount_changes/)
  for (const col of ['store_id', 'session_id', 'old_type', 'old_value', 'new_type', 'new_value', 'changed_by', 'changed_at'])
    assert.ok(sql.includes(col), `thiếu cột nhật ký ${col}`)
  assert.match(sql, /changed_by\s+uuid NOT NULL/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON public\.table_session_discount_changes FROM anon/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.table_session_discount_changes FROM authenticated/)
  assert.match(sql, /GRANT SELECT ON public\.table_session_discount_changes TO authenticated/)
  assert.match(sql, /FOR SELECT TO authenticated USING \(public\.is_store_scoped_operator\(store_id\)\)/)
})

test('bill_discount_amount + session_unpaid_subtotal là helper nội bộ, đúng chữ ký, không cấp quyền', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /FUNCTION public\.bill_discount_amount\(\s*p_subtotal bigint,\s*p_type text,\s*p_value integer\s*\) RETURNS bigint/)
  assert.match(sql, /IMMUTABLE/)
  const calc = body(sql, 'bill_discount_amount')
  assert.match(calc, /round\(p_subtotal::numeric \* p_value::numeric \/ 100\)/)
  assert.ok(calc.includes('Loại giảm giá không hợp lệ'))

  assert.match(sql, /FUNCTION public\.session_unpaid_subtotal\(\s*p_session_id uuid\s*\) RETURNS bigint/)
  const sub = body(sql, 'session_unpaid_subtotal')
  assert.match(sub, /status <> 'cancelled'/)
  assert.match(sub, /payment_received_at IS NULL/)

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.bill_discount_amount\(bigint, text, integer\) FROM PUBLIC, anon, authenticated;/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.session_unpaid_subtotal\(uuid\) FROM PUBLIC, anon, authenticated;/)
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.(bill_discount_amount|session_unpaid_subtotal)/)
})

test('pos_set_session_discount: quyền trước khoá, phiên open, kiểm giá trị, nhật ký', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /FUNCTION public\.pos_set_session_discount\(\s*p_session_id uuid,\s*p_type text,\s*p_value integer\s*\) RETURNS jsonb/)

  const fn = body(sql, 'pos_set_session_discount')
  assert.match(fn, /is_store_pos_operator\(/)
  assert.ok(fn.indexOf('is_store_pos_operator(') < fn.indexOf('FOR UPDATE'), 'phải kiểm quyền trước khi khoá')
  assert.match(fn, /v_s\.status <> 'open'/)
  assert.match(fn, /session_unpaid_subtotal\(/)
  assert.match(fn, /INSERT INTO public\.table_session_discount_changes/)
  assert.match(fn, /clock_timestamp\(\)/)
  for (const msg of [
    'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá',
    'Giảm giá phải là số nguyên không âm',
    'Phần trăm phải từ 0 đến 100',
    'Loại giảm giá không hợp lệ',
    'Không có quyền',
    'Phiên đã đóng',
  ]) assert.ok(fn.includes(msg), `thiếu thông báo: ${msg}`)

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_set_session_discount\(uuid, text, integer\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_set_session_discount\(uuid, text, integer\) TO authenticated;/)
})

test('pos_set_sessions_discount: khoá id tăng dần, chia dư vào phiên lớn nhất (hoà → id nhỏ nhất, so chuỗi COLLATE "C")', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /FUNCTION public\.pos_set_sessions_discount\(\s*p_session_ids uuid\[\],\s*p_type text,\s*p_value integer\s*\) RETURNS jsonb/)

  const fn = body(sql, 'pos_set_sessions_discount')
  assert.match(fn, /is_store_pos_operator\(/)
  assert.ok(fn.indexOf('is_store_pos_operator(') < fn.indexOf('FOR UPDATE'), 'phải kiểm quyền trước khi khoá')
  assert.match(fn, /ORDER BY id\s+FOR UPDATE/)
  assert.match(fn, /id::text COLLATE "C"/)
  // chia nguyên bằng div() trên numeric, không dùng phép chia làm tròn
  assert.match(fn, /div\(p_value::numeric \* /)
  // phần dư lấp lần lượt theo tiền giảm dần, mỗi phiên không nhận quá tiền hàng của nó
  assert.match(fn, /LEAST\(GREATEST\(rk\.amt - rk\.share, 0\), rk\.rem - rk\.room_before\)/)
  assert.doesNotMatch(fn, /CASE WHEN sh\.id = w\.id/)
  assert.match(fn, /INSERT INTO public\.table_session_discount_changes/)
  assert.match(fn, /clock_timestamp\(\)/)
  // loại có + giá trị NULL cho ra NULL: phải coalesce để không lọt qua bước kiểm giá trị
  assert.match(fn, /v_clear boolean := coalesce\(p_type IS NULL OR p_value = 0, false\)/)
  for (const msg of [
    'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá',
    'Các phiên không cùng một quán',
    'Chưa chọn phiên nào',
    'Phiên đã đóng',
    'Không có quyền',
    'Loại giảm giá không hợp lệ',
  ]) assert.ok(fn.includes(msg), `thiếu thông báo: ${msg}`)

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_set_sessions_discount\(uuid\[\], text, integer\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_set_sessions_discount\(uuid\[\], text, integer\) TO authenticated;/)
})

test('mig 107 chỉ tạo đối tượng MỚI: không CREATE OR REPLACE hàm sống, không ghi "rerun-safe"', async () => {
  const sql = await readFile(migration, 'utf8')
  const replaced = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map((m) => m[1]).sort()
  assert.deepEqual(replaced, [
    'bill_discount_amount',
    'pos_set_session_discount',
    'pos_set_sessions_discount',
    'session_unpaid_subtotal',
  ])
  assert.doesNotMatch(sql, /rerun-safe/i)
})
