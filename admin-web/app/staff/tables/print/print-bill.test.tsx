import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrintBill from './print-bill'
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
})
