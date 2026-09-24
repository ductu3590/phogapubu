import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import BillPanel from './bill-panel'
import NewOrdersFeed from './new-orders-feed'
import RejectOrderSheet from './reject-order-sheet'

const session: OpenTableSession = {
  session_id: 'session-1',
  table_id: 'table-1',
  table_number: 'Bàn 9',
  tables: [{ id: 'table-1', table_number: 'Bàn 9' }],
  is_open_ordering: true,
  status: 'open',
  close_reason: null,
  opened_at: new Date().toISOString(),
  opened_by: 'customer',
  last_activity_at: new Date().toISOString(),
  has_host: true,
  needs_review: false,
  order_count: 1,
  total: 139000,
  unpaid_total: 139000,
  cooking_count: 0,
  idle_timeout_minutes: 360,
  orders: [{
    id: 'order-1',
    status: 'pending',
    created_at: new Date().toISOString(),
    total_amount: 139000,
    order_source: 'customer',
    confirmed_at: null,
    payment_received_at: null,
    items: [{
      id: 'item-1', name: 'Chân gà nướng', quantity: 1, price: 139000,
      toppings: [], void_type: null, void_reason: null, voided_at: null, is_gift: false,
    }],
  }],
}

describe('nút từ chối đơn chờ xác nhận', () => {
  it('hiện cạnh xác nhận ở danh sách Đơn mới', () => {
    const html = renderToStaticMarkup(
      <NewOrdersFeed sessions={[session]} busy={false} onSelectSession={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()} />,
    )
    expect(html).toContain('Xác nhận &amp; in')
    expect(html).toContain('Từ chối')
  })

  it('hiện trong đơn chờ xác nhận của bill bàn', () => {
    const html = renderToStaticMarkup(
      <BillPanel selected={session} picked={[]} freeTables={[]} otherSessions={[]} pickedFreeTables={0} busy={false}
        onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onCreateTray={vi.fn()} onAddTable={vi.fn()}
        onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
        onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onRestoreOrderItem={vi.fn()} onClearPick={vi.fn()} />,
    )
    expect(html).toContain('Từ chối')
  })

  it('sheet có đủ lý do chọn nhanh và ô nhập cho lý do khác', () => {
    const html = renderToStaticMarkup(
      <RejectOrderSheet orderId="order-1" busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    )
    for (const label of ['Hết đồ', 'Bếp quá tải', 'Đơn trùng', 'Khách yêu cầu huỷ', 'Lý do khác']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Xác nhận từ chối')
  })
})
