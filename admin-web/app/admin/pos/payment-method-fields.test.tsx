import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PaymentMethodFields from './payment-method-fields'

const fields = (over: Partial<Parameters<typeof PaymentMethodFields>[0]>) => renderToStaticMarkup(
  <PaymentMethodFields method="cash" total={1_000_000} cashPart={1_000_000} bankPart={0} cashText="" bankText="" givenText=""
    mixedError={null} onMethod={vi.fn()} onCashText={vi.fn()} onBankText={vi.fn()} onGivenText={vi.fn()} {...over} />)

describe('PaymentMethodFields', () => {
  it('bốn lựa chọn', () => {
    for (const label of ['Tiền mặt', 'Chuyển khoản', 'Kết hợp', 'Ghi nợ']) expect(fields({})).toContain(label)
  })

  it('lưới 2 × 2 dưới 480px, 4 cột từ 480px', () => {
    const html = fields({})
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('min-[480px]:grid-cols-4')
  })

  it('Ghi nợ: không có ô tiền khách đưa, ghi rõ số nợ', () => {
    const html = fields({ method: 'debt', cashPart: 0, debtPart: 1_000_000 })
    expect(html).not.toContain('id="pos-cash-given"'); expect(html).toContain('Ghi nợ toàn bộ 1.000.000đ')
    expect(html).not.toContain('nghe loa báo tiền')
  })

  it('Kết hợp: có ô "Ghi nợ phần còn lại"; bật thì hiện số nợ', () => {
    expect(fields({ method: 'mixed' })).toContain('Ghi nợ phần còn lại')
    expect(fields({ method: 'mixed', debtRest: true, cashPart: 500_000, debtPart: 700_000 })).toContain('700.000đ')
  })

  it('Kết hợp + ghi nợ: checkbox phản ánh trạng thái, không còn câu "ô kia tự điền"', () => {
    const on = fields({ method: 'mixed', debtRest: true, cashPart: 500_000, debtPart: 700_000 })
    expect(on).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/)
    expect(on).not.toContain('ô kia tự điền')
    expect(on).toContain('Ghi nợ: 700.000đ')
    const off = fields({ method: 'mixed' })
    expect(off).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/)
    expect(off).toContain('ô kia tự điền')
    expect(fields({})).not.toContain('Ghi nợ phần còn lại')
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

  it('kết hợp có phần chuyển khoản: nhắc nghe loa đúng số chuyển khoản (đọc prop bankPart, không tự tính)', () => {
    const html = fields({ method: 'mixed', cashPart: 400_000, bankPart: 600_000, cashText: '400.000', bankText: '999.000' })
    expect(html).toContain('nghe loa báo tiền')
    expect(html).toContain('600.000đ')
  })

  it('kết hợp chưa có phần chuyển khoản: không nhắc nghe loa', () => {
    expect(fields({ method: 'mixed', cashPart: 1_000_000, bankPart: 0, cashText: '1.000.000', bankText: '0' })).not.toContain('nghe loa báo tiền')
  })

  it('kết hợp đang lệch: ẩn nhắc nghe loa (số chuyển khoản chưa chốt)', () => {
    const html = fields({ method: 'mixed', cashPart: 300_000, bankPart: 600_000, cashText: '300.000', bankText: '600.000',
      mixedError: 'Tổng hai khoản phải đúng 1.000.000đ' })
    expect(html).not.toContain('nghe loa báo tiền')
  })

  it('chuyển khoản: nhắc nghe loa, không có ô tiền khách đưa', () => {
    const html = fields({ method: 'bank', cashPart: 0, bankPart: 1_000_000 })
    expect(html).toContain('nghe loa báo tiền')
    expect(html).not.toContain('id="pos-cash-given"')
  })

  it('khách đưa quá 2 tỉ: báo lỗi tiếng Việt, không hiện tiền thối', () => {
    const html = fields({ cashPart: 100_000, givenText: '3.000.000.000' })
    expect(html).toContain('Tiền khách đưa quá lớn — kiểm tra lại số')
    expect(html).not.toContain('Tiền thối lại cho khách')
  })

  it('tiền mặt đưa thiếu: báo thiếu', () => {
    expect(fields({ cashPart: 100_000, givenText: '50.000' })).toContain('Khách đưa còn thiếu 50.000đ')
  })
})
