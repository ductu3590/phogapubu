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

  it('nhắc đối chiếu chuyển khoản với app ngân hàng (không ghi "đã khớp") + chỗ ký bàn giao; KHÔNG quảng cáo MEVO', () => {
    const html = renderToStaticMarkup(<DayReportSlip {...base} />)
    expect(html).toContain('Đối chiếu chuyển khoản với app ngân hàng')
    expect(html).not.toMatch(/khớp/i)
    expect(html).toContain('Người bàn giao')
    expect(html).toContain('Người nhận')
    expect(html).not.toContain('mevo.vn<')
  })
})
