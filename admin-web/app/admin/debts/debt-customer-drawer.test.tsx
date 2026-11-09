import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DebtBill, DebtCustomerDetail, DebtPaymentRow } from '@/lib/debts'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/actions/debts', () => ({
  collectDebt: vi.fn(), voidDebtPayment: vi.fn(), saveDebtCustomer: vi.fn(), setDebtCustomerActive: vi.fn(),
  loadDebtCustomerDetail: vi.fn(async () => ({ ok: false, error: 'x' })),
}))

const { DebtCustomerDetailBody, DebtCollectForm } = await import('./debt-customer-drawer')

const bill = (over: Partial<DebtBill>): DebtBill => ({
  billPaymentId: 'b1', collectedAt: '2026-11-01T12:00:00Z', businessDate: '2026-11-01', tableLabel: 'Bàn 3', sessionIds: ['s1'],
  billTotal: 500_000, debtAmount: 300_000, paidAmount: 100_000, outstanding: 200_000, ...over,
})
const payment = (over: Partial<DebtPaymentRow>): DebtPaymentRow => ({
  id: 'p1', amount: 100_000, method: 'bank', businessDate: '2026-11-02', createdAt: '2026-11-02T03:00:00Z', createdByName: 'Thu ngân Lan',
  note: null, voidedAt: null, voidReason: null, voidedByName: null, allocations: [{ billPaymentId: 'b1', amount: 100_000 }], ...over,
})
const detail = (over: Partial<DebtCustomerDetail> = {}): DebtCustomerDetail => ({
  customer: { id: 'c1', name: 'Cty Hoà Bình', phone: '0912345678', kind: 'company', note: 'kế toán chị Lan', isActive: true,
    outstanding: 350_000, openBills: 2, oldestOpenAt: '2026-11-01T12:00:00Z', lastPaymentAt: '2026-11-02T03:00:00Z' },
  bills: [
    bill({}),
    bill({ billPaymentId: 'b2', collectedAt: '2026-11-03T12:00:00Z', businessDate: '2026-11-03', tableLabel: 'Bàn 7', billTotal: 150_000, debtAmount: 150_000, paidAmount: 0, outstanding: 150_000 }),
    bill({ billPaymentId: 'b0', collectedAt: '2026-10-20T12:00:00Z', businessDate: '2026-10-20', tableLabel: 'Bàn 1', billTotal: 80_000, debtAmount: 80_000, paidAmount: 80_000, outstanding: 0 }),
  ],
  payments: [
    payment({}),
    payment({ id: 'p0', amount: 50_000, method: 'cash', voidedAt: '2026-11-02T05:00:00Z', voidReason: 'đếm nhầm', voidedByName: 'Chủ quán Tú' }),
  ],
  ...over,
})
const noop = vi.fn()
const body = (canManage: boolean, d = detail()) => renderToStaticMarkup(
  <DebtCustomerDetailBody detail={d} canManage={canManage} busy={false}
    onCollect={noop} onPrint={noop} onVoid={noop} onEdit={noop} onToggleActive={noop} />)
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).test(html)

describe('DebtCustomerDetailBody', () => {
  it('bill còn nợ: ngày, bàn, tổng bill, đã trả, còn nợ; link A04 theo ngày kinh doanh', () => {
    const html = body(false)
    expect(html).toContain('href="/admin/bills?date=2026-11-01"')
    for (const t of ['01/11/2026', 'Bàn 3', '500.000đ', '100.000đ', '200.000đ', 'Bàn 7', '150.000đ']) expect(html).toContain(t)
    // Bill còn nợ đứng trước, bill đã trả hết thu gọn
    expect(html.indexOf('Bàn 3')).toBeLessThan(html.indexOf('Bàn 7'))
    expect(html).toContain('Đã trả hết (1)')
    expect(html).toContain('350.000đ')
  })
  it('lịch sử trả nợ: lần huỷ gạch ngang kèm lý do', () => {
    const html = body(false)
    expect(html).toMatch(/line-through[^>]*>(?:(?!<\/).)*50\.000đ/)
    expect(html).toContain('đếm nhầm')
    expect(html).toContain('Chủ quán Tú')
  })
  it('thu ngân: có Thu nợ, In bảng kê; không có Huỷ, Sửa khách, Ngừng', () => {
    const html = body(false)
    expect(button(html, 'Thu nợ')).toBe(true)
    expect(button(html, 'In bảng kê')).toBe(true)
    expect(button(html, 'Huỷ')).toBe(false)
    expect(button(html, 'Sửa khách')).toBe(false)
    expect(button(html, 'Ngừng')).toBe(false)
  })
  it('quản lý: có Huỷ ở lần chưa huỷ, Sửa khách, Ngừng', () => {
    const html = body(true)
    expect(html.match(/<button[^>]*><span[^>]*>Huỷ<\/span><\/button>/g)?.length).toBe(1)
    expect(button(html, 'Sửa khách')).toBe(true)
    expect(button(html, 'Ngừng theo dõi')).toBe(true)
    const off = body(true, detail({ customer: { ...detail().customer, isActive: false, outstanding: 0 } }))
    expect(button(off, 'Dùng lại')).toBe(true)
  })
  it('lần trả đã huỷ: gạch ngang, không có nút Huỷ, không cộng vào Đã trả của bill', () => {
    const d = detail({
      bills: [bill({ paidAmount: 0, outstanding: 300_000 })],
      payments: [payment({ voidedAt: '2026-11-02T05:00:00Z', voidReason: 'nhầm khách', voidedByName: 'Chủ' })],
    })
    const html = body(true, d)
    expect(html).not.toMatch(/<button[^>]*><span[^>]*>Huỷ<\/span><\/button>/)
    expect(html).toContain('nhầm khách')
    expect(html).toMatch(/Đã trả[^<]*<\/[^>]+>\s*<[^>]+>0đ/)
  })
  it('khách hết nợ: không có nút Thu nợ', () => {
    const html = body(false, detail({ customer: { ...detail().customer, outstanding: 0 }, bills: [] }))
    expect(button(html, 'Thu nợ')).toBe(false)
  })
})

describe('DebtCollectForm', () => {
  const bills = detail().bills
  const form = (over: Partial<Parameters<typeof DebtCollectForm>[0]> = {}) => renderToStaticMarkup(
    <DebtCollectForm bills={bills} amountText="" onAmount={noop} method="cash" onMethod={noop} note="" onNote={noop}
      selected={null} onSelected={noop} error={null} busy={false} locked={false} onSubmit={noop} onCancel={noop} {...over} />)

  it('form thu nợ: xem trước phân bổ cũ nhất trước theo allocateDebt; vượt nợ khoá nút', () => {
    const html = form({ amountText: '250.000' })
    // Cũ nhất trước: Bàn 3 (còn 200.000) rồi Bàn 7 (50.000)
    expect(html).toMatch(/Bàn 3[^]*200\.000đ[^]*Bàn 7[^]*50\.000đ/)
    expect(html).toMatch(/<button type="submit"[^>]*>/)
    expect(html).not.toMatch(/<button type="submit"[^>]*disabled="/)
    const over = form({ amountText: '400.000' })
    expect(over).toContain('Số tiền trả vượt số nợ: còn nợ 350.000đ')
    expect(over).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/)
  })
  it('bill còn nợ có ô tick (mặc định tick hết); nút Trả hết; chỉ tick bill → chỉ bill đó', () => {
    const html = form()
    expect(html.match(/type="checkbox"[^>]*checked=""/g)?.length).toBe(2)
    expect(html).toContain('Trả hết')
    const only = form({ amountText: '150.000', selected: ['b2'] })
    expect(only.match(/type="checkbox"[^>]*checked=""/g)?.length).toBe(1)
    expect(only).not.toContain('Số tiền trả vượt')
  })
  it('chưa nhập số tiền: khoá nút, không báo lỗi đỏ; lỗi server hiện nguyên văn', () => {
    expect(form()).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/)
    expect(form({ error: 'Chưa mở ca' })).toContain('Chưa mở ca')
  })
})
