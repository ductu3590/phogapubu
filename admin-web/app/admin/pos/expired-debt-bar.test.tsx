import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { ExpiredDebtBar, expiredDebtSummary } from './expired-sessions'

// Tab Sơ đồ: Việc cần xử lý chỉ là ngăn kéo, nên phiên hết hạn còn nợ phải có dải đỏ riêng trên lưới.
const session = (over: Partial<OpenTableSession>): OpenTableSession => ({
  session_id: 's', table_id: 't', table_number: 'Bàn 1', tables: [], is_open_ordering: false,
  status: 'open', close_reason: null, opened_at: '2026-11-11T10:00:00Z', opened_by: 'customer',
  last_activity_at: '2026-11-11T10:00:00Z', has_host: false, needs_review: false, order_count: 1,
  total: 100_000, unpaid_total: 100_000, cooking_count: 0, idle_timeout_minutes: 360, orders: [],
  ...over,
} as OpenTableSession)

const expired = (id: string, unpaid: number) =>
  session({ session_id: id, status: 'closed', close_reason: 'expired', needs_review: true, unpaid_total: unpaid })

describe('ExpiredDebtBar — dải đỏ "bàn hết hạn còn tiền chưa thu"', () => {
  it('không có phiên hết hạn còn nợ → không vẽ gì (không tốn chiều cao lưới)', () => {
    expect(expiredDebtSummary([session({}), expired('paid', 0)])).toBeNull()
    expect(renderToStaticMarkup(<ExpiredDebtBar sessions={[session({}), expired('paid', 0)]} onOpen={vi.fn()} />)).toBe('')
  })

  it('đếm + cộng tổng cùng bộ chọn với khối trong Việc cần xử lý', () => {
    const list = [session({}), expired('a', 150_000), expired('b', 250_000), expired('paid', 0)]
    expect(expiredDebtSummary(list)).toEqual({ count: 2, total: 400_000 })
    const html = renderToStaticMarkup(<ExpiredDebtBar sessions={list} onOpen={vi.fn()} />)
    expect(html).toContain('2 bàn hết hạn còn tiền chưa thu')
    expect(html).toContain('400.000')
    expect(html).toContain('Xem &amp; thu')
    expect(html).toContain('role="alert"')
  })
})
