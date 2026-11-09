import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CashShiftEntry, CashShiftReport } from '@/lib/cash-shift'
import ShiftReportSlip, { shiftReportPrintable } from './shift-report-slip'

const entry = (over: Partial<CashShiftEntry>): CashShiftEntry => ({
  id: Math.random().toString(), kind: 'payment', method: 'cash', categoryName: 'Đá', amount: 10000, note: null,
  counterparty: null, source: 'pos_drawer', createdAt: '2026-11-09T05:00:00Z', createdByName: 'Lan', voidedAt: null, ...over,
})

const report: CashShiftReport = {
  id: 'sh1', storeId: 'st', status: 'closed',
  openedAt: '2026-11-09T01:00:00Z', closedAt: '2026-11-09T15:30:00Z',
  openedByName: 'Thu ngân Lan', closedByName: 'Chủ quán Tú',
  openingCash: 500000, openNote: 'Két có 500k lẻ', closeNote: 'Thiếu 10k chưa rõ',
  cashSales: 300000, bankSales: 200000, cashReceipts: 100000, cashPayments: 50000, debtCash: 0,
  expectedCash: 850000, countedCash: 840000, difference: -10000, billsCount: 7, carriedDays: 1,
  continuedAt: null, continuedByName: null,
  entries: [
    entry({ kind: 'receipt', categoryName: 'Nộp thêm vào két', amount: 100000 }),
    entry({ categoryName: 'Đá', amount: 20000 }),
    entry({ categoryName: 'Đá', amount: 30000 }),
    entry({ categoryName: 'Đi chợ', amount: 999000, voidedAt: '2026-11-09T06:00:00Z' }),
  ],
}

const base = {
  report, storeName: 'Yên Garden', printedAt: '2026-11-09T15:35:00.000Z', printedBy: 'tu@yen.vn · Chủ quán',
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const render = (props: Partial<Parameters<typeof ShiftReportSlip>[0]> = {}) =>
  text(renderToStaticMarkup(<ShiftReportSlip {...base} {...props} />))

describe('Phiếu bàn giao ca 80mm', () => {
  it('đủ dòng: người mở, người kết, giờ mở, giờ đóng, tiền đầu ca, tiền mặt thu bill, phiếu thu TM, phiếu chi TM, tiền dự kiến, tiền đếm được, chênh lệch, số bill, tổng TM, tổng CK, ghi chú', () => {
    const t = render()
    for (const s of [
      'Yên Garden', 'PHIẾU BÀN GIAO CA',
      'Người mở Thu ngân Lan', 'Người kết Chủ quán Tú',
      'Giờ mở 09/11/2026 08:00', 'Giờ đóng 09/11/2026 22:30',
      'Tiền đầu ca 500.000', 'Tiền mặt thu bill + 300.000', 'Phiếu thu TM + 100.000', 'Phiếu chi TM − 50.000',
      'TIỀN DỰ KIẾN 850.000đ', 'Tiền đếm được 840.000', 'Chênh lệch Thiếu 10.000đ',
      'Số bill 7', 'Tổng TM 300.000', 'Tổng CK 200.000',
      'Ghi chú mở ca: Két có 500k lẻ', 'Ghi chú kết ca: Thiếu 10k chưa rõ',
      'Người giao', 'Người nhận',
    ]) {
      expect(t).toContain(s)
    }
  })

  it('dòng Khách trả nợ (TM) chỉ hiện khi debtCash > 0', () => {
    expect(render()).not.toContain('Khách trả nợ (TM)')
    expect(render({ report: { ...report, debtCash: 45000 } })).toContain('Khách trả nợ (TM) + 45.000')
  })

  it('prop debt (mig 123): Ghi nợ trong ca luôn hiện khi có prop; Khách trả nợ (CK) chỉ khi > 0', () => {
    expect(render()).not.toContain('Ghi nợ trong ca')
    const t = render({ debt: { debtRecorded: 120000, debtCash: 0, debtBank: 0 } })
    expect(t).toContain('Ghi nợ trong ca 120.000')
    expect(t).not.toContain('Khách trả nợ (CK)')
    expect(render({ debt: { debtRecorded: 0, debtCash: 0, debtBank: 70000 } })).toContain('Khách trả nợ (CK) 70.000')
    expect(render({ debt: null })).not.toContain('Ghi nợ trong ca')
  })

  it('phiếu thu / chi gom theo danh mục kèm số phiếu, bỏ phiếu đã huỷ', () => {
    const t = render()
    expect(t).toContain('Thu · Nộp thêm vào két (1) + 100.000')
    expect(t).toContain('Chi · Đá (2) − 50.000')
    expect(t).not.toContain('Đi chợ')
    expect(t).not.toContain('999.000')
    expect(render({ report: { ...report, entries: [] } })).toContain('Không có phiếu thu / chi tiền mặt')
  })

  it('giờ in theo giờ VN', () => {
    // 15:35Z = 22:35 giờ VN
    expect(render()).toContain('In lúc 09/11/2026 22:35')
    expect(render()).toContain('tu@yen.vn · Chủ quán')
  })

  it('carriedDays 3: có dòng Ca gộp qua 3 ngày; 1: không có', () => {
    expect(render({ report: { ...report, carriedDays: 3 } })).toContain('Ca gộp qua 3 ngày')
    expect(render()).not.toContain('Ca gộp qua')
  })

  it('autoPrint=false (phần mềm in): không có nút In lại', () => {
    expect(render()).toContain('In lại')
    expect(render({ autoPrint: false })).not.toContain('In lại')
  })
})

describe('in được hay không', () => {
  it('ca đã kết đủ số: in được; thiếu đếm được / dự kiến / chênh lệch hoặc ca mở: không', () => {
    expect(shiftReportPrintable(report)).toBe(true)
    expect(shiftReportPrintable({ ...report, countedCash: null })).toBe(false)
    expect(shiftReportPrintable({ ...report, expectedCash: null })).toBe(false)
    expect(shiftReportPrintable({ ...report, difference: null })).toBe(false)
    expect(shiftReportPrintable({ ...report, status: 'open' })).toBe(false)
  })
})
