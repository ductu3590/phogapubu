import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { PaymentView } from './bill-panel'
import PaymentMethodFields from './payment-method-fields'
import PaymentVietQr from './payment-vietqr'

const qr = {
  payload: '00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061550005802VN62170813BAN 12 A1B2C363047A8C',
  amount: 155000, memo: 'BAN 12 A1B2C3', bankName: 'Vietcombank', accountNumber: '0011001234567', accountName: 'DO DUC TU',
}

const session = {
  session_id: 's1', table_id: 't5', table_number: 'Bàn 5', tables: [{ id: 't5', table_number: 'Bàn 5' }],
  is_open_ordering: false, status: 'open', close_reason: null, opened_at: new Date().toISOString(), opened_by: 'staff',
  last_activity_at: new Date().toISOString(), has_host: false, needs_review: false, order_count: 1, total: 155_000,
  unpaid_total: 155_000, cooking_count: 0, idle_timeout_minutes: 360, orders: [],
} as OpenTableSession

const view = (over: Partial<Parameters<typeof PaymentView>[0]>) =>
  renderToStaticMarkup(
    <PaymentView title="Bàn 5" list={[session]} goods={155_000} paid={0} expiredNote={null} discount={0} discountLabel=""
      discountError={null} onEditDiscount={vi.fn()} total={155_000} busy={false} onAdjust={vi.fn()} onQty={vi.fn()}
      onRestore={vi.fn()} onBack={vi.fn()} onDismiss={vi.fn()} onPay={vi.fn()} onPrint={vi.fn()} {...over} />,
  )

describe('PaymentVietQr', () => {
  it('không có QR thì không render gì', () => {
    expect(renderToStaticMarkup(<PaymentVietQr qr={null} />)).toBe('')
  })
  it('hiện mã, số tiền, tài khoản, nội dung', () => {
    const html = renderToStaticMarkup(<PaymentVietQr qr={qr} />)
    expect(html).toContain('<svg')
    expect(html).toContain('155.000')
    expect(html).toContain('Vietcombank')
    expect(html).toContain('0011001234567')
    expect(html).toContain('DO DUC TU')
    expect(html).toContain('BAN 12 A1B2C3')
  })
})

describe('PaymentView', () => {
  it('mặc định là tiền mặt: có tài khoản cũng không hiện QR', () => {
    const html = view({ bankAccount: { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' } })
    expect(html).not.toContain('Mã VietQR')
  })
})

describe('PaymentMethodFields + QR', () => {
  const fields = (over: Partial<Parameters<typeof PaymentMethodFields>[0]>) =>
    renderToStaticMarkup(
      <PaymentMethodFields method="bank" total={155000} cashPart={0} bankPart={155000} cashText="" bankText="" givenText=""
        mixedError={null} onMethod={vi.fn()} onCashText={vi.fn()} onBankText={vi.fn()} onGivenText={vi.fn()} {...over} />,
    )
  it('chuyển khoản có QR: hiện mã và câu nhắc mới', () => {
    const html = fields({ qr })
    expect(html).toContain('Mã VietQR')
    expect(html).toContain('Cho khách quét mã này')
  })
  it('không có QR: giữ câu cũ, không hiện mã', () => {
    const html = fields({ qr: null })
    expect(html).not.toContain('Mã VietQR')
    expect(html).toContain('Cho khách quét mã QR của quán')
  })
  it('kết hợp đang chia lệch: ẩn QR', () => {
    expect(fields({ method: 'mixed', qr, mixedError: 'Tổng hai khoản phải đúng' })).not.toContain('Mã VietQR')
  })
})
