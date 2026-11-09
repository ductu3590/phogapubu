import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DebtBill, DebtCustomerDetail } from '@/lib/debts'
import DebtStatementSlip from './debt-statement-slip'

const bill = (over: Partial<DebtBill>): DebtBill => ({
  billPaymentId: 'b1', collectedAt: '2026-11-01T12:00:00Z', businessDate: '2026-11-01', tableLabel: 'Bàn 3', sessionIds: ['s1'],
  billTotal: 500_000, debtAmount: 400_000, paidAmount: 100_000, outstanding: 300_000, ...over,
})
const detail = (over: Partial<DebtCustomerDetail> = {}): DebtCustomerDetail => ({
  customer: { id: 'c1', name: 'Cty Hoà Bình', phone: '0912345678', kind: 'company', note: null, isActive: true,
    outstanding: 450_000, openBills: 2, oldestOpenAt: '2026-11-01T12:00:00Z', lastPaymentAt: null },
  bills: [
    bill({}),
    bill({ billPaymentId: 'b2', collectedAt: '2026-11-03T12:00:00Z', businessDate: '2026-11-03', tableLabel: 'Bàn 7', billTotal: 150_000, debtAmount: 150_000, paidAmount: 0, outstanding: 150_000 }),
    bill({ billPaymentId: 'b0', collectedAt: '2026-10-20T12:00:00Z', businessDate: '2026-10-20', tableLabel: 'Bàn Đã Trả', billTotal: 80_000, debtAmount: 80_000, paidAmount: 80_000, outstanding: 0 }),
  ],
  payments: [],
  ...over,
})
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const render = (d = detail()) => text(renderToStaticMarkup(
  <DebtStatementSlip storeName="Yên Garden" detail={d} printedAt="2026-11-09T15:05:00.000Z" printedBy="Lan · Thu ngân" autoPrint={false} />))

describe('Bảng kê công nợ 80mm', () => {
  it('BẢNG KÊ CÔNG NỢ: tên quán, khách, SĐT, giờ in VN; chỉ bill còn nợ; tổng còn nợ', () => {
    const t = render()
    for (const s of ['Yên Garden', 'BẢNG KÊ CÔNG NỢ', 'Cty Hoà Bình', '0912345678', '09/11/2026 22:05', 'Lan · Thu ngân']) expect(t).toContain(s)
    expect(t).not.toContain('Bàn Đã Trả')
    expect(t).toMatch(/TỔNG CÒN NỢ 450\.000/)
  })
  it('mỗi bill: ngày dd/mm, bàn, tổng bill, đã trả, còn nợ', () => {
    const t = render()
    expect(t).toContain('01/11 · Bàn 3')
    expect(t).toContain('Tổng bill 500.000')
    expect(t).toContain('Đã trả 100.000')
    expect(t).toContain('Còn nợ 300.000')
    expect(t).toContain('03/11 · Bàn 7')
    expect(t.indexOf('Bàn 3')).toBeLessThan(t.indexOf('Bàn 7'))
  })
  it('khách hết nợ: "Không còn khoản nợ"', () => {
    const t = render(detail({ customer: { ...detail().customer, outstanding: 0 }, bills: [bill({ outstanding: 0, paidAmount: 400_000 })] }))
    expect(t).toContain('Không còn khoản nợ')
    expect(t).not.toContain('Còn nợ 0')
  })
  it('khối ký: Bên quán, Khách hàng; chân phiếu số liệu tới giờ in', () => {
    const t = render()
    expect(t).toContain('Bên quán'); expect(t).toContain('Khách hàng')
    expect(t).toContain('Số liệu tới 09/11/2026 22:05. Đối chiếu và báo lại quán nếu có sai lệch.')
  })
  it('autoPrint=false: không có nút In lại', () => {
    expect(render()).not.toContain('In lại')
  })
})
