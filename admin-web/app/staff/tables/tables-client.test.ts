import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import TablesClient from './tables-client'
import type { OpenTableSession } from '@/lib/actions/table-session'

vi.stubGlobal('React', React)
vi.mock('@/lib/actions/table-session', () => ({}))
vi.mock('@/lib/actions/service-requests', () => ({}))

const session: OpenTableSession = {
  session_id: 'session1', table_id: 't1', table_number: 'Bàn 1', tables: [{ id: 't1', table_number: 'Bàn 1' }],
  is_open_ordering: false, status: 'closed', close_reason: 'timeout', opened_at: '2026-09-14T01:00:00Z',
  opened_by: 'staff', last_activity_at: '2026-09-14T01:00:00Z', has_host: false, needs_review: true,
  order_count: 0, total: 20000, unpaid_total: 20000, cooking_count: 0, idle_timeout_minutes: 420, orders: [],
}
const render = (canClose: boolean, minutes: number | null = 420) => renderToStaticMarkup(React.createElement(TablesClient, {
  storeId: 's1', canClose, paymentTiming: 'postpay', allTables: [],
  initialSessions: [{ ...session, idle_timeout_minutes: minutes }], initialError: null,
  initialRequests: [], initialRequestError: null,
}))

describe('staff tables permissions and timeout UI', () => {
  it('staff còn xem bill/ghép mâm/queue nhưng không có thu tiền hay chọn bulk', () => {
    const html = render(false)
    expect(html).toContain('20.000đ')
    expect(html).toContain('Ghép mâm')
    expect(html).toContain('Gọi nhân viên')
    expect(html).not.toContain('Thu tiền')
    expect(html).not.toContain('Bỏ bàn')
    expect(html).not.toContain('type="checkbox"')
  })
  it('owner vẫn có nút thu tiền và chọn gộp bill', () => {
    const html = render(true)
    expect(html).toContain('Thu tiền &amp; đóng bàn')
    expect(html).toContain('type="checkbox"')
  })
  it('timeout theo quán và câu chung khi thiếu cấu hình', () => {
    expect(render(false)).toContain('7 giờ không hoạt động')
    expect(render(false, 360)).toContain('6 giờ không hoạt động')
    expect(render(false, null)).toContain('Phiên đã hết hạn do không hoạt động')
    expect(render(false, null)).not.toContain('6 giờ')
  })
})
