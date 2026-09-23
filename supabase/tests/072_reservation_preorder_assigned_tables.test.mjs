import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('queue preorder ưu tiên bàn phiên, rồi dùng bàn đã phân bổ khi khách chưa đến', async () => {
  const sql = await readFile(new URL('../migrations/072_reservation_preorder_assigned_tables.sql', import.meta.url), 'utf8')
  assert.match(sql, /reservation_tables rt/)
  assert.match(sql, /session_tables st/)
  assert.match(sql, /reservation_preorder_table_numbers\(o\)/)
  assert.doesNotMatch(sql, /UPDATE public\.orders SET table_id/)
})
