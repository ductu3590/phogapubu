// BL-3 Task 9 — tác vụ gọi khách phải tồn tại bền vững, không phụ thuộc cron hay Zalo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/074_reservation_customer_call_tasks.sql', import.meta.url)

test('Task 9 tạo task gọi nhắc gắn duy nhất một reservation và due trước 60 phút', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.reservation_customer_call_tasks/)
  assert.match(sql, /UNIQUE \(reservation_id, scheduled_arrival_at\)/)
  assert.match(sql, /arrival_at - interval '60 minutes'/)
  assert.match(sql, /GREATEST\(.*now\(\)/s)
})

test('đổi lịch hoặc kết thúc booking retire task cũ; resolve idempotent và audit', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_reservation_customer_call_task\(/)
  assert.match(sql, /NEW\.status = 'confirmed'/)
  assert.match(sql, /NEW\.status IN \('arrived', 'cancelled_by_customer', 'cancelled_by_store', 'no_show'/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.resolve_reservation_customer_call\(/)
  assert.match(sql, /p_outcome NOT IN \('called', 'unreachable'\)/)
  assert.match(sql, /reservation_customer_call_resolved/)
})

test('chỉ owner quán mình xem và xử lý task; anon/staff không có quyền RPC', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.list_reservation_customer_calls\(\s*p_store_id uuid/)
  assert.match(sql, /reservation_operator_actor_kind\(p_store_id\)/)
  assert.match(sql, /is_store_owner_of\(v_task\.store_id\)/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.list_reservation_customer_calls/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.resolve_reservation_customer_call\(uuid, text\)\s+TO authenticated/)
})
