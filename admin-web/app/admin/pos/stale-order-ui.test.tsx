import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { buildWorkQueue } from '@/lib/pos-work-queue'
import PosBillPanel from './bill-panel'
import WorkQueue from './work-queue'

const now = Date.parse('2026-11-18T13:00:00Z')

function sessionAt(createdAt: string): OpenTableSession {
  return {
    session_id: 'session-1',
    table_id: 'table-1',
    table_number: 'Bàn 9',
    tables: [{ id: 'table-1', table_number: 'Bàn 9' }],
    is_open_ordering: true,
    status: 'open',
    close_reason: null,
    opened_at: createdAt,
    opened_by: 'customer',
    last_activity_at: createdAt,
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
      created_at: createdAt,
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
}

function renderQueue(createdAt: string): string {
  const session = sessionAt(createdAt)
  const items = buildWorkQueue({ sessions: [session], requests: [], reservations: [], reservationBars: new Map(), customerCalls: [], now })
  return renderToStaticMarkup(
    <WorkQueue items={items} filter="all" onFilter={vi.fn()} now={now} reservationsEnabled={false}
      sessionsById={new Map([[session.session_id, session]])} requestsById={new Map()} reservationsById={new Map()}
      customerCallsById={new Map()} trayColors={new Map()} reminderIds={new Set()} busy={false} requestBusyId={null}
      requestError={null}
      handlers={{ onOpenSession: vi.fn(), onOpenReservation: vi.fn(), onConfirmOrder: vi.fn(), onRejectOrder: vi.fn(),
        onResolveRequest: vi.fn(), onConfirmReservation: vi.fn(), onArriveReservation: vi.fn(), onSnoozeReservation: vi.fn(),
        onResolveCustomerCall: vi.fn() }} />,
  )
}

// Render tĩnh luôn ở tab 'bill' mặc định: nhãn hiện trong hộp "Có N lượt món đang chờ duyệt!".
function renderBill(createdAt: string): string {
  return renderToStaticMarkup(
    <PosBillPanel loadDebtCustomers={async () => ({ ok: true, customers: [] })} selected={sessionAt(createdAt)} picked={[]} freeTables={[]} moveTargets={[]} moveAreas={[]} onMoveTable={vi.fn()} onMoveTray={vi.fn()} otherSessions={[]} trayColors={new Map()} busy={false}
      now={now}
      onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onAddTable={vi.fn()}
      onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
      onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true} onRestoreOrderItem={vi.fn()} onSetDiscount={async () => true} onClearPick={vi.fn()}
      onDismiss={vi.fn()} preorders={[]} onPrintPreorder={async () => ({ ok: true })} />,
  )
}

describe('nhãn lượt món chờ duyệt lâu', () => {
  it('Việc cần xử lý: lượt chờ 20 phút hiện nhãn gọi lúc', () => {
    expect(renderQueue('2026-11-18T12:40:00Z')).toContain('Gọi lúc 19:40 · đã chờ 20 phút')
  })
  it('Việc cần xử lý: lượt chờ 5 phút giữ nhãn cũ', () => {
    const html = renderQueue('2026-11-18T12:55:00Z')
    expect(html).not.toContain('Gọi lúc')
    expect(html).toContain('19:55 · 5 phút')
  })
  it('Bảng bill: lượt chờ 20 phút hiện nhãn gọi lúc', () => {
    expect(renderBill('2026-11-18T12:40:00Z')).toContain('Gọi lúc 19:40 · đã chờ 20 phút')
  })
  it('Bảng bill: lượt chờ 5 phút không có nhãn', () => {
    expect(renderBill('2026-11-18T12:55:00Z')).not.toContain('Gọi lúc')
  })
})
