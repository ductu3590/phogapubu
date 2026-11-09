import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import PosBillPanel, { PaymentView } from './bill-panel'
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

describe('bill có đơn đã thu trước', () => {
  it('nút Thanh toán dùng tiền chưa thu, không phải tổng mọi đơn', () => {
    const html = panel(session({ total: 200_000, unpaid_total: 155_000, bill_discount_type: 'percent', bill_discount_value: 10 }))
    expect(html).toContain('Thanh toán · 139.500đ')
    expect(html).not.toContain('Thanh toán · 155.000đ')
  })

  it('giảm giá lỗi → nút Thanh toán giữ số trước giảm, không kẹp về 0đ', () => {
    const html = panel(session({ unpaid_total: 100_000, total: 100_000, bill_discount_type: 'amount', bill_discount_value: 120_000 }))
    expect(html).toContain('Thanh toán · 100.000đ')
    expect(html).not.toContain('Thanh toán · 0đ')
  })
})

describe('PaymentView', () => {
  const view = (over: Partial<Parameters<typeof PaymentView>[0]>) =>
    renderToStaticMarkup(
      <PaymentView title="Bàn 5" list={[session({})]} goods={155_000} paid={0} expiredNote={null} discount={0} discountLabel=""
        discountError={null} onEditDiscount={vi.fn()} total={155_000} busy={false} onAdjust={vi.fn()} onQty={vi.fn()}
        onRestore={vi.fn()} onBack={vi.fn()} onDismiss={vi.fn()} onPay={vi.fn()} onPrint={vi.fn()} {...over} />,
    )

  it('có đơn đã thu trước → hiện dòng "Đã thu trước" riêng', () => {
    const html = view({ paid: 45_000 })
    expect(html).toContain('Đã thu trước')
    expect(html).toContain('45.000đ')
  })

  it('phiên hết hạn → ẩn nút giảm giá, hiện ghi chú', () => {
    const html = view({ expiredNote: 'Phiên hết hạn không giảm giá được' })
    expect(html).toContain('Phiên hết hạn không giảm giá được')
    expect(html).not.toContain('Thêm giảm giá')
  })

  it('ba lựa chọn thu tiền có "Kết hợp"; nút thu vẫn ghi số cần thu', () => {
    const html = view({})
    expect(html).toContain('Kết hợp')
    expect(html).toContain('Xác nhận đã nhận 155.000đ')
  })

  it('bill 0đ (tặng hết món): nút thu vẫn bấm được', () => {
    const html = view({ goods: 0, total: 0 })
    // Lớp tailwind có chữ "disabled:" nên dò thuộc tính disabled="" chứ không dò chữ "disabled"
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>(?:(?!<\/button>).)*Xác nhận đã nhận 0đ/)
  })

  it('bình thường → có nút Thêm giảm giá, không có ghi chú', () => {
    const html = view({})
    expect(html).toContain('Thêm giảm giá')
    expect(html).not.toContain('hết hạn')
  })

  it('M1: giảm giá đang lưu bị lỗi → vẫn hiện mức đã lưu + nút sửa đỏ, KHÔNG hiện "Thêm giảm giá"', () => {
    const s = session({ unpaid_total: 50_000, total: 50_000, bill_discount_type: 'amount', bill_discount_value: 80_000 })
    const html = view({ list: [s], goods: 50_000, discount: 0, total: 50_000,
      discountError: 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá' })
    expect(html).not.toContain('Thêm giảm giá')
    expect(html).toMatch(/<button[^>]*aria-label="Sửa giảm giá hoá đơn"[^>]*text-red-700[^>]*>Sửa −80\.000đ<\/button>/)
    expect(html).toContain('Giảm giá lớn hơn tiền hàng — sửa lại giảm giá')
  })

  it('M3: gộp bill có mâm hết hạn + mâm còn mở có giảm giá → hiện số giảm (chữ thường) kèm ghi chú hết hạn', () => {
    const open = session({ session_id: 'a', unpaid_total: 100_000, total: 100_000, bill_discount_type: 'amount', bill_discount_value: 20_000 })
    const expired = session({ session_id: 'b', status: 'closed', close_reason: 'expired', needs_review: true, unpaid_total: 50_000, total: 50_000 })
    const html = view({ list: [open, expired], goods: 150_000, discount: 20_000, total: 130_000,
      expiredNote: 'Phiên hết hạn không giảm giá được: Bàn 5' })
    expect(html).toContain('−20.000đ')
    expect(html).toContain('Phiên hết hạn không giảm giá được')
    expect(html).not.toContain('aria-label="Sửa giảm giá hoá đơn"')
    expect(html).toContain('150.000đ')
    expect(html).toContain('130.000đ')
  })
})

describe('ô đầu bill "Đã duyệt · chưa thu"', () => {
  it('dùng tiền CHƯA thu, lượt đã thu trước tách riêng', () => {
    const html = panel(session({ total: 200_000, unpaid_total: 155_000 }))
    expect(html).toContain('Đã duyệt · chưa thu')
    expect(html).not.toContain('Hoá đơn đã duyệt')
    expect(html).toMatch(/Đã duyệt · chưa thu<\/p><p[^>]*>155\.000đ<\/p>/)
    expect(html).toContain('Đã thu trước 45.000đ')
  })

  it('có giảm giá → ghi rõ số chưa trừ giảm giá', () => {
    const html = panel(session({ bill_discount_type: 'percent', bill_discount_value: 10 }))
    expect(html).toContain('Chưa trừ giảm giá 15.500đ')
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
