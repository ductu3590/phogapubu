import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { buildWorkQueue } from '@/lib/pos-work-queue'
import PosBillPanel from './bill-panel'
import RejectOrderSheet from './reject-order-sheet'
import WorkQueue from './work-queue'

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
  it('hiện cạnh Duyệt & in bếp ở thẻ lượt món trong Việc cần xử lý', () => {
    const now = Date.now()
    const items = buildWorkQueue({ sessions: [session], requests: [], reservations: [], reservationBars: new Map(), customerCalls: [], now })
    const html = renderToStaticMarkup(
      <WorkQueue items={items} filter="all" onFilter={vi.fn()} now={now} reservationsEnabled={false}
        sessionsById={new Map([[session.session_id, session]])} requestsById={new Map()} reservationsById={new Map()}
        customerCallsById={new Map()} trayColors={new Map()} reminderIds={new Set()} busy={false} requestBusyId={null}
        requestError={null}
        handlers={{ onOpenSession: vi.fn(), onOpenReservation: vi.fn(), onConfirmOrder: vi.fn(), onRejectOrder: vi.fn(),
          onResolveRequest: vi.fn(), onConfirmReservation: vi.fn(), onArriveReservation: vi.fn(), onSnoozeReservation: vi.fn(),
          onResolveCustomerCall: vi.fn() }} />,
    )
    expect(html).toContain('Duyệt &amp; in bếp')
    expect(html).toContain('Từ chối')
  })

  it('bill bàn có lượt chờ duyệt: báo Duyệt ngay và khoá Thanh toán', () => {
    const html = renderToStaticMarkup(
      <PosBillPanel selected={session} picked={[]} freeTables={[]} otherSessions={[]} pickedFreeTables={0} trayColors={new Map()} busy={false}
        onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onCreateTray={vi.fn()} onAddTable={vi.fn()}
        onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
        onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true} onRestoreOrderItem={vi.fn()} onClearPick={vi.fn()}
        onDismiss={vi.fn()} preorders={[]} onPrintPreorder={async () => ({ ok: true })} />,
    )
    expect(html).toContain('Duyệt ngay')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Khoá thanh toán \(còn 1 lượt chờ duyệt\)/)
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
