import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrintBill, { billDiscountError, billDiscountLabel, LOI_GIAM_GIA_IN } from './print-bill'
import { buildTestBill } from '@/lib/print/test-bill'

const now = new Date('2026-10-09T12:00:00.000Z')
const store = { name: 'Bia lẩu Bảo Lương', address: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai', phone: '0826325523' }

describe('PrintBill (PA-5)', () => {
  it('hoá đơn thường: tiêu đề HOÁ ĐƠN, có lời cảm ơn, in địa chỉ', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)
    expect(html).toContain('HOÁ ĐƠN')
    expect(html).not.toContain('PHIẾU IN THỬ')
    expect(html).toContain('Cảm ơn quý khách')
    expect(html).toContain('236 Bảo Lương, Ngã 5 Bảo Lương')
  })

  it('in thử: tiêu đề PHIẾU IN THỬ, ghi rõ không phải hoá đơn, bỏ lời cảm ơn', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} testMode />)
    expect(html).toContain('PHIẾU IN THỬ')
    expect(html).not.toContain('>HOÁ ĐƠN<')
    expect(html).toContain('Không phải hoá đơn — không tạo đơn')
    expect(html).not.toContain('Cảm ơn quý khách')
    expect(html).toContain('236 Bảo Lương, Ngã 5 Bảo Lương')
    expect(html).toContain('ĐT: 0826325523')
    expect(html).toContain('200.000')
  })

  it('quán chưa có địa chỉ/SĐT → không có dòng trống, không có "ĐT:"', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill({ name: 'Quán A', address: ' ', phone: '' }, now)} testMode />)
    expect(html).not.toContain('ĐT:')
    expect(html).not.toMatch(/class="diachi"/)
  })

  it('mig 098: dòng Bỏ/Tặng in 0đ kèm lý do + mục Điều chỉnh số lượng', () => {
    const bill = buildTestBill(store, now)
    bill.sessions[0].items.push(
      { name: 'Nem chua', quantity: 1, price: 0, line_total: 0, is_gift: false, void_type: 'cancelled', void_reason: 'Bếp báo hết món' },
      { name: 'Lạc rang', quantity: 2, price: 0, line_total: 0, is_gift: true, void_type: 'gift', void_reason: 'Khách quen' },
    )
    bill.sessions[0].qty_changes = [
      { name: 'Bia hơi (Cốc)', old_quantity: 6, new_quantity: 4, reason: 'Nhân viên bấm nhầm', changed_at: now.toISOString() },
    ]
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).toContain('1 × BỎ — Bếp báo hết món')
    expect(html).toContain('2 × TẶNG — Khách quen')
    expect(html).toContain('Điều chỉnh số lượng:')
    expect(html).toContain('Bia hơi (Cốc): 6 → 4 — Nhân viên bấm nhầm')
  })

  it('địa chỉ dài được phép xuống dòng', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)
    expect(html).toContain('.diachi { overflow-wrap: anywhere; }')
    expect(html).toMatch(/class="diachi"/)
  })

  it('2026-10-12: chân hoá đơn có dòng giới thiệu MEVO (không logo) và mevo.vn; có tổng số món + thời gian ngồi', () => {
    const bill = buildTestBill(store, now)
    bill.sessions[0].opened_at = new Date(now.getTime() - 80 * 60000).toISOString()
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).not.toContain('<img')
    expect(html).toContain('MEVO · Menu Evolution')
    expect(html).toContain('mevo.vn')
    expect(html).toContain('Tổng số món')
    expect(html).toContain('Ngồi 1g 20p')
  })
  it('GG-1: bill có giảm giá in Tổng tiền hàng, Giảm giá (10%) -15.500 và Khách cần trả (đã trừ)', () => {
    const bill = buildTestBill(store, now)
    bill.sessions[0].subtotal = 155000
    bill.sessions[0].discount = 15500
    bill.sessions[0].discount_label = '10%'
    bill.grand_total = 139500
    bill.grand_discount = 15500
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).toContain('Tổng tiền hàng')
    expect(html).toContain('155.000')
    expect(html).toContain('Giảm giá (10%)')
    expect(html).toContain('-15.500')
    expect(html).toContain('Khách cần trả')
    expect(html).toContain('139.500đ')
  })

  it('GG-1: giảm giá VNĐ (không nhãn %) vẫn in dòng Giảm giá', () => {
    const bill = buildTestBill(store, now)
    bill.sessions[0].discount = 20000
    bill.grand_total = 180000
    bill.grand_discount = 20000
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).toContain('Giảm giá')
    expect(html).not.toContain('Giảm giá (')
    expect(html).toContain('-20.000')
    expect(html).toContain('200.000')
    expect(html).toContain('180.000đ')
  })

  it('GG-1: không giảm giá (hoặc server cũ không trả trường) → không có chữ "Giảm giá"', () => {
    const bill = buildTestBill(store, now)
    expect(renderToStaticMarkup(<PrintBill bill={bill} />)).not.toContain('Giảm giá')
    bill.sessions[0].discount = 0
    bill.sessions[0].discount_label = null
    bill.grand_discount = 0
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).not.toContain('Giảm giá')
    expect(html).toContain('TỔNG CỘNG')
  })

  it('GG-1: gộp nhiều mâm — grand_discount thiếu thì cộng discount từng mâm', () => {
    const bill = buildTestBill(store, now)
    bill.sessions.push({ ...bill.sessions[0], session_id: 'm2', tables: 'Bàn mẫu 2', discount: 5000, discount_label: null })
    bill.sessions[0].discount = 10000
    bill.grand_total = 400000 - 15000
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).toContain('-15.000')
    expect(html).toContain('385.000đ')
  })

  it('M2: giảm giá một mâm lớn hơn tiền hàng → báo lỗi, KHÔNG in hoá đơn', () => {
    const bill = buildTestBill(store, now)
    bill.sessions[0].subtotal = 50000
    bill.sessions[0].discount = 80000
    bill.grand_discount = 80000
    bill.grand_total = -30000
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).toContain('Giảm giá lớn hơn tiền hàng — sửa lại giảm giá ở POS')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('HOÁ ĐƠN')
    expect(html).not.toContain('Khách cần trả')
    expect(html).not.toContain('TỔNG CỘNG')
  })

  it('M2: grand_discount lớn hơn tổng tiền hàng (dù từng mâm không thiếu trường) → báo lỗi', () => {
    const bill = buildTestBill(store, now)
    const sub = bill.sessions[0].subtotal
    bill.grand_discount = sub + 1
    bill.grand_total = 0
    expect(billDiscountError(bill)).toBe(LOI_GIAM_GIA_IN)
    expect(renderToStaticMarkup(<PrintBill bill={bill} />)).not.toContain('Khách cần trả')
  })

  it('M2: giảm giá bằng đúng tiền hàng vẫn in (0đ hợp lệ)', () => {
    const bill = buildTestBill(store, now)
    const sub = bill.sessions[0].subtotal
    bill.sessions[0].discount = sub
    bill.grand_discount = sub
    bill.grand_total = 0
    expect(billDiscountError(bill)).toBeNull()
    expect(renderToStaticMarkup(<PrintBill bill={bill} />)).toContain('Khách cần trả')
  })

  it('M4: gộp mâm 10% với mâm KHÔNG giảm → in "Giảm giá" trơn, không "(10%)"', () => {
    const bill = buildTestBill(store, now)
    bill.sessions.push({ ...bill.sessions[0], session_id: 'm2', tables: 'Bàn mẫu 2', discount: 0, discount_label: null })
    bill.sessions[0].discount = 20000
    bill.sessions[0].discount_label = '10%'
    bill.grand_discount = 20000
    bill.grand_total = 2 * bill.sessions[1].subtotal - 20000
    const html = renderToStaticMarkup(<PrintBill bill={bill} />)
    expect(html).toContain('Giảm giá')
    expect(html).not.toContain('Giảm giá (')
  })

  it('M4: gộp mâm 10% với mâm 5% → nhãn trơn; mọi mâm cùng 10% → "(10%)"', () => {
    const bill = buildTestBill(store, now)
    bill.sessions.push({ ...bill.sessions[0], session_id: 'm2', tables: 'Bàn mẫu 2', discount: 10000, discount_label: '5%' })
    bill.sessions[0].discount = 20000
    bill.sessions[0].discount_label = '10%'
    expect(billDiscountLabel(bill)).toBe('')
    bill.sessions[1].discount_label = '10%'
    expect(billDiscountLabel(bill)).toBe('10%')
    bill.sessions[1].discount = 0
    expect(billDiscountLabel(bill)).toBe('')
  })
})

describe('PrintBill — autoPrint', () => {
  it('autoPrint=false: không vẽ khối .no-print (phần mềm in tự in, không cần nút In lại)', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} autoPrint={false} />)
    expect(html).not.toContain('no-print')
    expect(html).toContain('HOÁ ĐƠN')
  })
  it('mặc định vẫn có nút In lại', () => {
    expect(renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)).toContain('no-print')
  })
})
