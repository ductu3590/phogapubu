// Mig 104 — chuyển bàn: nhật ký, orders.device_id, helper nhận diện người gọi, RPC pos_move_session_table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/104_table_session_moves.sql', import.meta.url)

// Cắt riêng thân một hàm để assert không "ăn may" từ hàm khác trong cùng file.
function body(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`)
  assert.ok(start >= 0, `thiếu hàm ${name}`)
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2)
  return sql.slice(start, end)
}

test('mig 104 dựng bảng nhật ký + cột device_id trên đơn', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.table_session_moves/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS device_id text/)
  assert.match(sql, /is_store_scoped_operator\(store_id\)/)
  assert.match(sql, /REVOKE ALL ON public\.table_session_moves FROM anon/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.table_session_moves FROM authenticated/)
})

test('pos_move_session_table đổi tại chỗ, kiểm quyền, chặn bàn bận và bàn đang giữ đặt', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /FUNCTION public\.pos_move_session_table\(\s*p_session_id uuid,\s*p_from_table_id uuid,\s*p_to_table_id uuid/)

  const fn = body(sql, 'pos_move_session_table')
  assert.match(fn, /is_store_pos_operator\(/)
  assert.match(fn, /table_has_current_reservation_hold\(p_to_table_id, now\(\)\)/)
  assert.match(fn, /UPDATE public\.session_tables\s+SET table_id = p_to_table_id/)
  assert.match(fn, /UPDATE public\.orders\s+SET table_id = p_to_table_id/)
  assert.match(fn, /UPDATE public\.service_requests/)
  assert.match(fn, /INSERT INTO public\.table_session_moves/)
  assert.match(fn, /lock_table_for_session\(least\(p_from_table_id, p_to_table_id\)\)/)
  assert.match(fn, /lock_table_for_session\(greatest\(p_from_table_id, p_to_table_id\)\)/)
  for (const msg of [
    'đang có khách',
    'đang giữ cho khách đặt trước',
    'Bàn nguồn không thuộc phiên này',
    'Không thể chuyển sang chính bàn đó',
    'Phiên đã đóng',
    'Không có quyền',
  ]) assert.ok(fn.includes(msg), `thiếu thông báo: ${msg}`)
})

test('moved_session_for_caller là helper nội bộ: không cấp quyền cho anon/authenticated', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /FUNCTION public\.moved_session_for_caller\(\s*p_table_id uuid,\s*p_zalo_user_id text,\s*p_device_id text/)
  assert.match(sql, /RETURNS TABLE\(\s*session_id uuid,\s*table_id uuid\s*\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.moved_session_for_caller\(uuid, text, text\) FROM PUBLIC, anon, authenticated;/)
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.moved_session_for_caller/)

  const fn = body(sql, 'moved_session_for_caller')
  assert.match(fn, /host_zalo_user_id/)
  assert.match(fn, /host_device_id/)
  assert.match(fn, /o\.device_id/)
})

test('file migration không ghi "rerun-safe"', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.doesNotMatch(sql, /rerun-safe/i)
})
