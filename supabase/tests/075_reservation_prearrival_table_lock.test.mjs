// Regression: bàn đã được xác nhận phải ngăn khách mới vào từ 60 phút trước giờ đến.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/075_reservation_prearrival_table_lock.sql', import.meta.url)

test('giữ bàn vận hành bắt đầu 60 phút trước giờ đến và backfill booking đã xác nhận', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /v_hold_starts_at timestamptz := p_arrival_at - interval '60 minutes'/)
  assert.match(sql, /rt\.hold_starts_at < v_hold_ends_at/)
  assert.match(sql, /rt\.hold_ends_at > v_hold_starts_at/)
  assert.match(sql, /SET hold_starts_at = r\.arrival_at - interval '60 minutes'/)
})

test('POS nhận được danh sách bàn đang khóa cùng mốc một giờ trước giờ đến', async () => {
  const sql = await readFile(migration, 'utf8')
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.list_prearrival_reserved_table_ids/)
  assert.match(sql, /r\.arrival_at - interval '60 minutes' <= now\(\)/)
})
