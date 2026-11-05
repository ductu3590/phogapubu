// Mig 103b — baseline để DB dựng mới khớp prod. Test tĩnh: chốt chặn prod + giữ nguyên byte bản chụp.
// Chứng minh chạy được thật là replay toàn bộ supabase/migrations/* trên Postgres (xem CLAUDE.md §10).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = new URL('../migrations/103b_baseline_prod_drift.sql', import.meta.url)
const defs = new URL('./prod-defs/', import.meta.url)
const attributes = new URL('../../.gitattributes', import.meta.url)

const SNAPSHOTS = [
  'create_order.sql', 'create_table_order_batch.sql', 'get_table_session_state.sql',
  '108/close_table_session.sql', '108/get_bills_report.sql', '108/get_sessions_bill.sql',
  '108/get_table_session_bill.sql', '108/list_open_table_sessions.sql',
  '108/merge_session_into_tray.sql', '108/recompute_order_total.sql',
  '110/confirm_manual_payment.sql', '110/kitchen_confirm_payment.sql',
]

test('chốt chặn chạy TRƯỚC mọi CREATE, trong một transaction', async () => {
  const sql = await readFile(migration, 'utf8')
  const begin = sql.search(/^BEGIN;$/m)
  const guard = sql.indexOf("to_regclass('public.table_session_moves') IS NOT NULL")
  const firstCreate = sql.search(/^CREATE OR REPLACE FUNCTION/m)
  assert.ok(begin >= 0 && begin < guard && guard < firstCreate)
  assert.match(sql, /RAISE EXCEPTION 'mig 103b: DB này đã qua mig 104/)
  assert.match(sql, /COMMIT;\s*$/)
})

test('đúng 36 hàm, mỗi hàm một lần, không hàm mới của mig 104+', async () => {
  const sql = await readFile(migration, 'utf8')
  const names = [...sql.matchAll(/^CREATE OR REPLACE FUNCTION public\.(\w+)\(/gm)].map((m) => m[1])
  assert.equal(names.length, 36)
  assert.equal(new Set(names).size, 36)
  for (const name of ['moved_session_for_caller', 'pos_move_session_table', 'pos_move_session_to_table',
    'bill_discount_amount', 'session_unpaid_subtotal']) {
    assert.ok(!names.includes(name), name)
  }
})

test('12 bản chụp prod nằm nguyên byte trong file, kể cả CRLF', async () => {
  const sql = await readFile(migration)
  for (const file of SNAPSHOTS) {
    const def = await readFile(new URL(file, defs))
    const body = def.subarray(0, def.lastIndexOf('$function$') + '$function$'.length)
    assert.ok(sql.includes(body), file)
  }
  assert.ok(sql.includes('\r\n'), 'get_sessions_bill/recompute_order_total phải còn CRLF')
})

test('.gitattributes giữ nguyên byte cho file baseline', async () => {
  const text = await readFile(attributes, 'utf8')
  assert.match(text, /^supabase\/migrations\/103b_baseline_prod_drift\.sql -text\r?$/m)
})
