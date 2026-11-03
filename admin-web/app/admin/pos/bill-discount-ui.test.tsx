import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import PosBillPanel from './bill-panel'
import DiscountDialog from './discount-dialog'

const session = (over: Partial<OpenTableSession>): OpenTableSession => ({
  session_id: 's1',
  table_id: 't5',
  table_number: 'Bàn 5',
  tables: [{ id: 't5', table_number: 'Bàn 5' }],
  is_open_ordering: false,
  status: 'open',
  close_reason: null,
  opened_at: new Date().toISOString(),
  opened_by: 'staff',
  last_activity_at: new Date().toISOString(),
  has_host: false,
  needs_review: false,
  order_count: 1,
  total: 155_000,
  unpaid_total: 155_000,
  cooking_count: 0,
  idle_timeout_minutes: 360,
  orders: [],
  ...over,
})

function panel(s: OpenTableSession) {
  return renderToStaticMarkup(
    <PosBillPanel selected={s} picked={[]} freeTables={[]} moveTargets={[]} moveAreas={[]}
      onMoveTable={vi.fn()} onMoveTray={vi.fn()} otherSessions={[]} pickedFreeTables={0} trayColors={new Map()} busy={false}
      onPay={vi.fn()} onPrint={vi.fn()} onReset={vi.fn()} onCreateTray={vi.fn()} onAddTable={vi.fn()}
      onMergeInto={vi.fn()} onReleaseHost={vi.fn()} onConfirmOrder={vi.fn()} onRejectOrder={vi.fn()}
      onPrintOrder={vi.fn()} onOpenManualOrder={vi.fn()} onVoidOrderItem={vi.fn()} onSetItemQuantity={async () => true}
      onRestoreOrderItem={vi.fn()} onSetDiscount={async () => true} onClearPick={vi.fn()}
      onDismiss={vi.fn()} preorders={[]} onPrintPreorder={async () => ({ ok: true })} />,
  )
}

describe('bill có giảm giá', () => {
  it('10% → dòng giảm giá kèm "10%" và nút Thanh toán theo số sau giảm', () => {
    const html = panel(session({ bill_discount_type: 'percent', bill_discount_value: 10 }))
    expect(html).toContain('Giảm giá (10%)')
    expect(html).toContain('15.500đ')
    expect(html).toContain('Thanh toán · 139.500đ')
  })

  it('không giảm giá → không có dòng giảm giá', () => {
    const html = panel(session({}))
    expect(html).not.toContain('Giảm giá')
    expect(html).toContain('Thanh toán · 155.000đ')
  })

  it('VNĐ lớn hơn tiền hàng (sau khi bỏ món) → lỗi đỏ, khoá In tạm tính', () => {
    const html = panel(session({ unpaid_total: 100_000, total: 100_000, bill_discount_type: 'amount', bill_discount_value: 120_000 }))
    expect(html).toContain('Giảm giá lớn hơn tiền hàng — sửa lại giảm giá')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*In tạm tính/)
    expect(html).not.toContain('Giảm giá (')
  })
})

describe('DiscountDialog', () => {
  it('có giảm giá sẵn → hiện Bỏ giảm giá, xem trước đúng số', () => {
    const html = renderToStaticMarkup(
      <DiscountDialog current={{ type: 'percent', value: 10 }} subtotals={[155_000]} busy={false} onSave={async () => true} onClose={vi.fn()} />,
    )
    expect(html).toContain('Giảm giá hoá đơn')
    expect(html).toContain('Bỏ giảm giá')
    expect(html).toContain('Bỏ qua')
    expect(html).toContain('15.500đ')
  })

  it('chưa có giảm giá → không có Bỏ giảm giá, Lưu khoá khi chưa nhập', () => {
    const html = renderToStaticMarkup(
      <DiscountDialog current={null} subtotals={[155_000]} busy={false} onSave={async () => true} onClose={vi.fn()} />,
    )
    expect(html).not.toContain('Bỏ giảm giá')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Lưu/)
  })
})
