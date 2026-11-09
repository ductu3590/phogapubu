import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CashShiftListItem, CashShiftReport } from '@/lib/cash-shift'

vi.mock('@/lib/print/print-document', () => ({ printDocument: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))

const { ShiftsTable, ShiftDetail } = await import('./shifts-panel')
const { default: BillsTabs } = await import('./bills-tabs')

const noop = () => {}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const closed: CashShiftListItem = {
  id: 'a', status: 'closed', openedAt: '2026-11-09T01:00:00Z', closedAt: '2026-11-09T15:30:00Z',
  openedByName: 'Thu ngân Lan', closedByName: 'Chủ quán Tú', openingCash: 500000,
  expectedCash: 850000, countedCash: 800000, difference: -50000,
}
const open: CashShiftListItem = {
  id: 'b', status: 'open', openedAt: '2026-11-09T16:00:00Z', closedAt: null, openedByName: 'Quản lý Minh',
  closedByName: null, openingCash: 300000,
  // Server không trả số của ca mở; có rác cũng không được hiện.
  expectedCash: 123456, countedCash: null, difference: 7777,
}

describe('BillsTabs', () => {
  it('showShifts false: chỉ render children, không có thanh tab', () => {
    const html = renderToStaticMarkup(<BillsTabs showShifts={false} shifts={[]}><p>BÁO CÁO</p></BillsTabs>)
    expect(html).toBe('<p>BÁO CÁO</p>')
  })
  it('showShifts true: có tab Hoá đơn + Ca, mặc định tab Hoá đơn hiện báo cáo', () => {
    const html = renderToStaticMarkup(<BillsTabs showShifts shifts={[closed]}><p>BÁO CÁO</p></BillsTabs>)
    expect(html).toContain('role="tablist"')
    expect(text(html)).toContain('Hoá đơn')
    expect(text(html)).toContain('Ca')
    expect(html).toMatch(/aria-selected="true"[^>]*>Hoá đơn/)
    expect(html).toContain('<p>BÁO CÁO</p>')
  })
})

describe('ShiftsTable', () => {
  it('danh sách: người mở, giờ, tiền đầu ca, chênh lệch bằng differenceLabel', () => {
    const t = text(renderToStaticMarkup(createElement(ShiftsTable, { shifts: [closed], onOpen: noop })))
    for (const s of ['Thu ngân Lan', 'Chủ quán Tú', '08:00 09/11', '22:30 09/11', '500.000đ', '850.000đ', '800.000đ', 'Thiếu 50.000đ']) {
      expect(t).toContain(s)
    }
    expect(t).toContain('60 ca gần nhất')
  })
  it('ca đang mở: nhãn Đang mở, không hiện dự kiến và chênh lệch', () => {
    const t = text(renderToStaticMarkup(createElement(ShiftsTable, { shifts: [open], onOpen: noop })))
    expect(t).toContain('Đang mở')
    expect(t).toContain('300.000đ')
    expect(t).not.toContain('123.456')
    expect(t).not.toContain('7.777')
    expect(t).not.toMatch(/Thiếu|Thừa|Khớp/)
  })
  it('trống: Chưa có ca nào', () => {
    expect(text(renderToStaticMarkup(createElement(ShiftsTable, { shifts: [], onOpen: noop })))).toContain('Chưa có ca nào')
  })
})

describe('ShiftDetail', () => {
  const report: CashShiftReport = {
    id: 'a', storeId: 's', status: 'closed', openedAt: closed.openedAt, closedAt: closed.closedAt,
    openedByName: 'Thu ngân Lan', closedByName: 'Chủ quán Tú', openingCash: 500000, openNote: null, closeNote: 'thiếu',
    cashSales: 300000, bankSales: 200000, cashReceipts: 100000, cashPayments: 50000, debtCash: 0,
    expectedCash: 850000, countedCash: 800000, difference: -50000, billsCount: 4, carriedDays: 1,
    continuedAt: null, continuedByName: null,
    entries: [
      { id: 'e1', kind: 'payment', method: 'cash', categoryName: 'Đá', amount: 50000, note: 'đá cây', counterparty: null,
        source: 'pos_drawer', createdAt: '2026-11-09T05:00:00Z', createdByName: 'Lan', voidedAt: null },
      { id: 'e2', kind: 'payment', method: 'cash', categoryName: 'Đi chợ', amount: 20000, note: null, counterparty: null,
        source: 'pos_drawer', createdAt: '2026-11-09T06:00:00Z', createdByName: 'Lan', voidedAt: '2026-11-09T07:00:00Z' },
    ],
  }
  it('ca đã kết: đủ số két, chênh lệch, phiếu thu/chi TM, nút In lại phiếu', () => {
    const html = renderToStaticMarkup(createElement(ShiftDetail, { report, onPrint: noop, printError: null }))
    const t = text(html)
    for (const s of ['Tiền dự kiến', '850.000đ', 'Tiền đếm được', '800.000đ', 'Thiếu 50.000đ', 'Số bill', '4',
      'Chuyển khoản', '200.000đ', '−50.000đ', 'Đá', 'đá cây', 'In lại phiếu', 'thiếu']) {
      expect(t).toContain(s)
    }
    expect(html).toMatch(/line-through[^>]*>[\s\S]*Đi chợ/)
  })
  it('ca đang mở: không hiện dự kiến / chênh lệch dù có trường, không có nút In lại phiếu', () => {
    const t = text(renderToStaticMarkup(createElement(ShiftDetail, {
      report: { ...report, status: 'open', closedAt: null, closedByName: null, expectedCash: 999999, difference: 4321 },
      onPrint: noop, printError: null,
    })))
    expect(t).toContain('Đang mở')
    expect(t).not.toContain('999.999')
    expect(t).not.toContain('4.321')
    expect(t).not.toContain('Tiền dự kiến')
    expect(t).not.toContain('In lại phiếu')
    expect(t).toContain('Đá')
  })
})
