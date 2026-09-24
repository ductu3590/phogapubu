// BL-3 Task 8 — QR không được tự mở bill trên bàn đang được giữ cho booking.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/073_reservation_table_ordering.sql', import.meta.url)

test('Task 8 cung cấp chốt server cho bàn đặt trước và batch QR idempotent', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /FUNCTION public\.table_has_current_reservation_hold\(\s*p_table_id uuid,\s*p_now timestamptz/)
  assert.match(sql, /state',\s*'reserved'/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.table_order_batch_requests/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_table_order_batch\(/)
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_store_id::text \|\| ':' \|\| p_client_request_id::text, 0\)\)/)
})

test('reservation hold chỉ chặn trong khoảng được phân bổ, không khóa booking ngày mai', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /rt\.hold_starts_at <= p_now/)
  assert.match(sql, /rt\.hold_ends_at > p_now/)
  assert.match(sql, /r\.status = 'confirmed'/)
  assert.match(sql, /r\.session_id IS NULL/)
})

test('replay batch QR xác thực cùng ngữ cảnh, không cấp capability cho máy khác', async () => {
  const sql = await readFile(migration, 'utf8')

  assert.match(sql, /batch request không thuộc ngữ cảnh thiết bị này/)
  assert.match(sql, /v_request\.device_id IS DISTINCT FROM p_device_id/)
  assert.match(sql, /v_request\.zalo_user_id IS DISTINCT FROM p_zalo_user_id/)
})
