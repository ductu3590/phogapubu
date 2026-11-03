// Mig 106 — chuyển cả mâm (phiên chiếm N bàn) sang MỘT bàn trống: pos_move_session_to_table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/106_move_tray_to_one_table.sql', import.meta.url)

// Cắt riêng thân hàm để assert không "ăn may" từ phần khác trong file.
function body(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`)
  assert.ok(start >= 0, `thiếu hàm ${name}`)
  const end = sql.indexOf('$$;', sql.indexOf('$$', start) + 2)
  return sql.slice(start, end)
}

test('pos_move_session_to_table: chữ ký, quyền, khoá, kiểm bàn đích', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /FUNCTION public\.pos_move_session_to_table\(\s*p_session_id uuid,\s*p_to_table_id uuid/)
  assert.match(sql, /RETURNS jsonb/)

  const fn = body(sql, 'pos_move_session_to_table')
  assert.match(fn, /is_store_pos_operator\(/)
  assert.match(fn, /lock_table_for_session\(/)
  assert.match(fn, /FOR UPDATE/)
  assert.match(fn, /table_has_current_reservation_hold\(p_to_table_id, now\(\)\)/)
  assert.match(fn, /open_session_id_for_table\(p_to_table_id\)/)
  for (const msg of [
    'đang có khách',
    'đang giữ cho khách đặt trước',
    'Phiên đã đóng',
    'Không có quyền',
    'Không tìm thấy phiên',
  ]) assert.ok(fn.includes(msg), `thiếu thông báo: ${msg}`)
  // Quyền phải kiểm TRƯỚC khi khoá bàn
  assert.ok(fn.indexOf('is_store_pos_operator(') < fn.indexOf('lock_table_for_session('), 'phải kiểm quyền trước khi khoá')
})

test('pos_move_session_to_table: gộp session_tables về một dòng, đổi đơn, dồn yêu cầu gọi NV, ghi nhật ký từng bàn cũ', async () => {
  const sql = await readFile(migration, 'utf8')
  const fn = body(sql, 'pos_move_session_to_table')
  assert.match(fn, /DELETE FROM public\.session_tables/)
  assert.match(fn, /UPDATE public\.session_tables\s+SET table_id = p_to_table_id/)
  assert.match(fn, /UPDATE public\.table_sessions\s+SET table_id = p_to_table_id/)
  assert.match(fn, /UPDATE public\.orders\s+SET table_id = p_to_table_id/)
  assert.match(fn, /UPDATE public\.service_requests/)
  assert.match(fn, /resolved_at = now\(\)/)
  assert.match(fn, /INSERT INTO public\.table_session_moves/)
  // is_open_ordering giữ nguyên: hàm không được đụng tới cột này
  assert.doesNotMatch(fn, /is_open_ordering\s*=/)
})

test('pos_move_session_to_table: chỉ authenticated gọi được', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_move_session_to_table\(uuid, uuid\) FROM PUBLIC, anon;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.pos_move_session_to_table\(uuid, uuid\) TO authenticated;/)
})

test('mig 106 chỉ thêm hàm mới: không "rerun-safe", không đè create_order', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.doesNotMatch(sql, /rerun-safe/i)
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.create_order/)
})
