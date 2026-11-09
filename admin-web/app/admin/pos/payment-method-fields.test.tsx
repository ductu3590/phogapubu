import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PaymentMethodFields from './payment-method-fields'

const fields = (over: Partial<Parameters<typeof PaymentMethodFields>[0]>) => renderToStaticMarkup(
  <PaymentMethodFields method="cash" total={1_000_000} cashPart={1_000_000} cashText="" bankText="" givenText=""
    mixedError={null} onMethod={vi.fn()} onCashText={vi.fn()} onBankText={vi.fn()} onGivenText={vi.fn()} {...over} />)

describe('PaymentMethodFields', () => {
  it('ba lựa chọn', () => {
    const html = fields({})
    for (const label of ['Tiền mặt', 'Chuyển khoản', 'Kết hợp']) expect(html).toContain(label)
    expect(html).toContain('grid-cols-3')
  })

  it('lựa chọn đang chọn được đánh dấu aria-checked', () => {
    expect(fields({ method: 'mixed' })).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*Kết hợp/)
  })

  it('tiền mặt: có ô tiền khách đưa, gợi ý theo tổng', () => {
    const html = fields({ cashPart: 123_000 })
    expect(html).toContain('id="pos-cash-given"')
    expect(html).toContain('130.000đ')
    expect(html).not.toContain('id="pos-mixed-cash"')
  })

  it('kết hợp: hai ô tiền; gợi ý và tiền thối theo PHẦN TIỀN MẶT', () => {
    const html = fields({ method: 'mixed', cashPart: 400_000, cashText: '400.000', bankText: '600.000', givenText: '500.000' })
    expect(html).toContain('id="pos-mixed-cash"')
    expect(html).toContain('id="pos-mixed-bank"')
    expect(html).toContain('Tiền thối lại cho khách')
    expect(html).toContain('100.000đ')
    expect(html).toContain('Vừa đủ 400.000đ')
  })

  it('kết hợp còn lệch: hiện lỗi', () => {
    expect(fields({ method: 'mixed', cashPart: 0, mixedError: 'Tổng hai khoản phải đúng 1.000.000đ' })).toContain('Tổng hai khoản phải đúng 1.000.000đ')
  })

  it('kết hợp phần tiền mặt 0: ẩn ô tiền khách đưa', () => {
    expect(fields({ method: 'mixed', cashPart: 0 })).not.toContain('id="pos-cash-given"')
  })

  it('kết hợp có phần chuyển khoản: nhắc nghe loa đúng số chuyển khoản', () => {
    const html = fields({ method: 'mixed', cashPart: 400_000, cashText: '400.000', bankText: '600.000' })
    expect(html).toContain('nghe loa báo tiền')
    expect(html).toContain('600.000đ')
  })

  it('kết hợp chưa có phần chuyển khoản: không nhắc nghe loa', () => {
    expect(fields({ method: 'mixed', cashPart: 1_000_000, cashText: '1.000.000', bankText: '0' })).not.toContain('nghe loa báo tiền')
  })

  it('chuyển khoản: nhắc nghe loa, không có ô tiền khách đưa', () => {
    const html = fields({ method: 'bank', cashPart: 0 })
    expect(html).toContain('nghe loa báo tiền')
    expect(html).not.toContain('id="pos-cash-given"')
  })

  it('tiền mặt đưa thiếu: báo thiếu', () => {
    expect(fields({ cashPart: 100_000, givenText: '50.000' })).toContain('Khách đưa còn thiếu 50.000đ')
  })
})
