import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DayReportSlip from './day-report-slip'

const base = {
  storeName: 'Bia lẩu Bảo Lương',
  date: '2026-10-09',
  printedAt: '2026-10-09T15:05:00.000Z',
  printedBy: 'baoluong@mevo.vn · Chủ quán',
  totals: { revenue: 1281000, cash: 992000, bank: 289000, other: 0, billsCount: 3 },
  summary: {
    waitingCount: 1, waitingTotal: 150000, cancelledCount: 14, cancelledTotal: 2100000,
    giftCount: 1, giftTotal: 135000, voidCount: 0, voidTotal: 0, quantityChangeCount: 2,
    discountTotal: 0, billDiscountTotal: 0,
  },
}

describe('Phiếu báo cáo cuối ngày 80mm (A04-3)', () => {
  it('tiêu đề, ngày, giờ in theo giờ VN, người in', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} />)
    expect(html).toContain('Bia lẩu Bảo Lương')
    expect(html).toContain('BÁO CÁO CUỐI NGÀY')
    expect(html).toContain('09/10/2026')
    expect(html).toContain('09/10/2026 22:05') // 15:05Z = 22:05 giờ VN, ngày trước giờ
    expect(html).toContain('baoluong@mevo.vn · Chủ quán')
  })

  it('có rangeLabel thì hiện khoảng giờ của ngày kinh doanh, null thì không', () => {
    const label = '05:00 01/11 – 05:00 02/11'
    expect(renderToStaticMarkup(<DayReportSlip {...base} rangeLabel={label} />)).toContain(label)
    expect(renderToStaticMarkup(<DayReportSlip {...base} rangeLabel={null} />)).not.toContain('05:00')
    expect(renderToStaticMarkup(<DayReportSlip {...base} />)).not.toContain('05:00')
  })

  it('tiền mặt / chuyển khoản / tổng thực thu + số hoá đơn; ẩn dòng ví khi 0đ', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} />)
    expect(html).toContain('992.000')
    expect(html).toContain('289.000')
    expect(html).toContain('1.281.000')
    expect(html).toContain('TỔNG THỰC THU')
    expect(html).not.toContain('Ví / khác')
    expect(renderToStaticMarkup(<DayReportSlip {...base} totals={{ ...base.totals, other: 50000 }} />)).toContain('Ví / khác')
  })

  it('khoản chưa thu + huỷ + tặng + sửa số lượng; ẩn dòng Bỏ khi không có', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} />)
    expect(html).toContain('Còn chưa thu')
    expect(html).toContain('150.000')
    expect(html).toContain('Đơn huỷ / từ chối')
    expect(html).toContain('Tặng')
    expect(html).toContain('Sửa số lượng')
    expect(html).not.toContain('>Bỏ ')
  })

  it('GG-1: có giảm giá thì in dòng "Giảm giá" (gồm cả giảm giá bill), không có thì ẩn', () => {
    expect(renderToStaticMarkup(<DayReportSlip {...base} />)).not.toContain('Giảm giá')
    const html = renderToStaticMarkup(<DayReportSlip {...base} summary={{ ...base.summary, discountTotal: 25500, billDiscountTotal: 15500 }} />)
    expect(html).toContain('Giảm giá')
    expect(html).toContain('25.500')
    expect(html).not.toContain('Voucher')
  })

  it('nhắc đối chiếu chuyển khoản với app ngân hàng (không ghi "đã khớp") + chỗ ký bàn giao; KHÔNG quảng cáo MEVO', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} />)
    expect(html).toContain('Đối chiếu chuyển khoản với app ngân hàng')
    expect(html).not.toMatch(/khớp/i)
    expect(html).toContain('Người bàn giao')
    expect(html).toContain('Người nhận')
    expect(html).not.toContain('mevo.vn<')
  })
})

describe('DayReportSlip — autoPrint', () => {
  it('autoPrint=false: không vẽ khối .no-print', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} autoPrint={false} />)
    expect(html).not.toContain('no-print')
    expect(html).toContain('BÁO CÁO CUỐI NGÀY')
  })
  it('mặc định vẫn có nút In lại', () => {
    expect(renderToStaticMarkup(<DayReportSlip {...base} />)).toContain('no-print')
  })
})

describe('Phiếu cuối ngày — công nợ (mig 123)', () => {
  it('có nợ: DOANH THU, Ghi nợ hôm nay, Thu nợ TM / CK', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base}
      totals={{ revenue: 470000, cash: 150000, bank: 70000, debt: 230000, other: 20000, billsCount: 4 }}
      debtCollections={{ cash: 100000, bank: 50000, count: 2 }} />)
    expect(html).toContain('DOANH THU'); expect(html).not.toContain('TỔNG THỰC THU')
    expect(html).toContain('Ghi nợ hôm nay'); expect(html).toContain('230.000')
    expect(html).toContain('Thu nợ tiền mặt'); expect(html).toContain('100.000')
    expect(html).toContain('Thu nợ chuyển khoản'); expect(html).toContain('50.000')
    expect(html).toContain('Tiền mặt thu nợ cũng nằm trong két.')
    expect(html.indexOf('Ghi nợ hôm nay')).toBeGreaterThan(html.indexOf('Chuyển khoản'))
  })
  it('không nợ, không thu nợ: TỔNG THỰC THU, không có dòng nợ', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} debtCollections={{ cash: 0, bank: 0, count: 0 }} />)
    expect(html).toContain('TỔNG THỰC THU')
    for (const t of ['DOANH THU', 'Ghi nợ hôm nay', 'Thu nợ', 'thu nợ']) expect(html).not.toContain(t)
  })
  it('thu nợ chỉ chuyển khoản: có khối thu nợ, không có câu tiền mặt trong két', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} debtCollections={{ cash: 0, bank: 50000, count: 1 }} />)
    expect(html).toContain('Thu nợ chuyển khoản'); expect(html).toContain('TỔNG THỰC THU')
    expect(html).not.toContain('Tiền mặt thu nợ cũng nằm trong két.')
  })
})
