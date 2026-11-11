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
const OPEN: Partial<OpenTableSession> = { status: 'open', close_reason: null, needs_review: false }
const render = (canReset: boolean, minutes: number | null = 420, patch: Partial<OpenTableSession> = {}) =>
  renderToStaticMarkup(React.createElement(TablesClient, {
    storeId: 's1', canReset, paymentTiming: 'postpay', allTables: [],
    initialSessions: [{ ...session, idle_timeout_minutes: minutes, ...patch }], initialError: null,
    areas: [],
  }))

// Quyết định "Chỉ thu tiền ở POS": màn nhân viên không còn nút thu, sheet chọn phương tiện hay gộp bill
// cho BẤT KỲ vai nào. Bàn trả sau chỉ thu ở POS → Thanh toán.
const COLLECT_UI = ['Thu tiền &amp; đóng bàn', 'Khách trả bằng gì', 'Tiền mặt', 'Chuyển khoản', 'Gộp ', 'gộp bill', 'type="checkbox"']
const POS_HINT = 'Thu tiền ở POS (Thanh toán)'

describe('staff tables permissions and timeout UI', () => {
  it('nhân viên: xem bill, ghép mâm, in bill; không thu tiền, không bỏ bàn; được nhắc thu ở POS', () => {
    const html = render(false)
    expect(html).toContain('20.000đ')
    expect(html).toContain('Ghép mâm')
    expect(html).toContain('In bill')
    // Phiên hết hạn còn nợ gom xuống mục riêng cuối danh sách (2026-10-09).
    expect(html).toContain('Phiên hết hạn chưa thu (1)')
    expect(html).toContain('Báo thu ngân / chủ quán xử lý trên máy POS.')
    expect(html).toContain(POS_HINT)
    for (const text of COLLECT_UI) expect(html).not.toContain(text)
    expect(html).not.toContain('Bỏ bàn')
  })
  it('chủ quán / quản lý / thu ngân: cũng không còn nút thu tiền hay gộp bill, chỉ nhắc thu ở POS', () => {
    for (const html of [render(true), render(true, 420, OPEN)]) {
      for (const text of COLLECT_UI) expect(html).not.toContain(text)
      expect(html).toContain(POS_HINT)
      expect(html).toContain('In bill')
      expect(html).toContain('Thao tác khác')
    }
    // Phiên hết hạn còn nợ: vai quầy được nhắc thu ở POS hoặc bỏ bàn (nút Bỏ bàn nằm trong "Thao tác khác").
    expect(render(true)).toContain('Thu nốt tiền ở POS (Thanh toán) hoặc bỏ bàn để dọn khỏi danh sách.')
    expect(render(true, 420, OPEN)).not.toContain('Phiên hết hạn chưa thu')
  })
  it('timeout theo quán và câu chung khi thiếu cấu hình', () => {
    expect(render(false)).toContain('7 giờ không hoạt động')
    expect(render(false, 360)).toContain('6 giờ không hoạt động')
    expect(render(false, null)).toContain('Phiên đã hết hạn do không hoạt động')
    expect(render(false, null)).not.toContain('6 giờ')
  })
})
