import { describe, expect, it } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { expiredUnpaidSessions } from './expired-sessions'

const session = (over: Partial<OpenTableSession>): OpenTableSession => ({
  session_id: 's', table_id: 't', table_number: 'Bàn 1', tables: [], is_open_ordering: false,
  status: 'open', close_reason: null, opened_at: '2026-11-11T10:00:00Z', opened_by: 'customer',
  last_activity_at: '2026-11-11T10:00:00Z', has_host: false, needs_review: false, order_count: 1,
  total: 100_000, unpaid_total: 100_000, cooking_count: 0, idle_timeout_minutes: 360, orders: [],
  ...over,
} as OpenTableSession)

describe('expiredUnpaidSessions — lối vào thu tiền cho phiên hết hạn còn nợ', () => {
  it('chỉ lấy phiên đã đóng do hết hạn mà còn tiền chưa thu', () => {
    const rows = expiredUnpaidSessions([
      session({ session_id: 'open' }),
      session({ session_id: 'expired', status: 'closed', close_reason: 'expired', needs_review: true }),
      session({ session_id: 'expired-paid', status: 'closed', close_reason: 'expired', needs_review: true, unpaid_total: 0 }),
      session({ session_id: 'closed-paid', status: 'closed', close_reason: 'paid', needs_review: false, unpaid_total: 0 }),
    ])
    expect(rows.map((s) => s.session_id)).toEqual(['expired'])
  })

  it('phiên mở trước đứng trước', () => {
    const rows = expiredUnpaidSessions([
      session({ session_id: 'b', status: 'closed', needs_review: true, opened_at: '2026-11-11T12:00:00Z' }),
      session({ session_id: 'a', status: 'closed', needs_review: true, opened_at: '2026-11-11T09:00:00Z' }),
    ])
    expect(rows.map((s) => s.session_id)).toEqual(['a', 'b'])
  })
})
