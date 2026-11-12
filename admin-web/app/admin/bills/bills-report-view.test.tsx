import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { parseBillsReport } from '@/lib/bills-report'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/actions/bill-detail', () => ({
  getSessionMoves: vi.fn(), loadBillDetail: vi.fn(), redeemBillSpin: vi.fn(), runBillOrderAction: vi.fn(),
}))
vi.mock('@/lib/print/print-document', () => ({ printDocument: vi.fn() }))

const { default: BillsReportView } = await import('./bills-report-view')

const view = (raw: unknown) => renderToStaticMarkup(
  <BillsReportView report={parseBillsReport(raw)} date="2026-11-09" maxDate="2026-11-09" today={false} dateTitle="Chủ nhật 09/11"
    viewer="Lan" updatedAt="2026-11-09T10:00:00Z" canManage={false} inModal={false} />)

const debtDay = {
  date: '2026-11-09',
  totals: { revenue: 470000, cash: 150000, bank: 70000, debt: 230000, other: 20000, bills_count: 2 },
  debt_collections: { cash: 100000, bank: 50000, count: 2 },
  bills: [
    { key: 'P:a', paid_at: '2026-11-09T05:00:00Z', total: 300000, instrument: 'mixed', table_label: 'Bàn 1',
      payments: [{ instrument: 'cash', amount: 100000 }, { instrument: 'debt', amount: 200000 }], debt_customer: { id: 'c', name: 'Cty Hoà Bình' } },
    { key: 'P:b', paid_at: '2026-11-09T06:00:00Z', total: 50000, instrument: 'cash', table_label: 'Bàn 3', payments: [{ instrument: 'cash', amount: 50000 }] },
  ],
}

describe('A04 — công nợ (mig 123)', () => {
  it('có nợ: thẻ Doanh thu, thẻ Ghi nợ kèm thu nợ hôm nay, chip Ghi nợ, dòng "Nợ — <tên>"; lưới 5 cột', () => {
    const html = view(debtDay)
    expect(html).toContain('Doanh thu')
    expect(html).not.toContain('Tổng thực thu')
    expect(html).toContain('230.000đ')
    expect(html).toContain('Thu nợ hôm nay 150.000đ')
    expect(html).toMatch(/role="tab"[^>]*>Ghi nợ/)
    expect(html).toContain('Nợ — Cty Hoà Bình')
    expect(html).toContain('@4xl:grid-cols-5')
  })
  it('quán / ngày không có nợ: giữ nguyên như cũ — Tổng thực thu, không thẻ / chip / dòng nợ', () => {
    const html = view({ ...debtDay, totals: { revenue: 50000, cash: 50000, bank: 0, other: 0, bills_count: 1 }, debt_collections: undefined,
      bills: [debtDay.bills[1]] })
    expect(html).toContain('Tổng thực thu')
    for (const t of ['Doanh thu', 'Ghi nợ', 'Thu nợ', 'Nợ —', '@4xl:grid-cols-5']) expect(html).not.toContain(t)
    expect(html).toContain('@4xl:grid-cols-4')
  })
  it('chỉ thu nợ (không ghi nợ mới): thẻ Ghi nợ hiện với 0đ, tổng vẫn là Tổng thực thu', () => {
    const html = view({ ...debtDay, totals: { revenue: 50000, cash: 50000, bank: 0, debt: 0, other: 0, bills_count: 1 }, bills: [debtDay.bills[1]] })
    expect(html).toContain('Tổng thực thu')
    expect(html).toContain('Thu nợ hôm nay 150.000đ')
  })
})
