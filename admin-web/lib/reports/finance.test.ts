import { describe, expect, it } from 'vitest'
import rpc from './__fixtures__/rpc-125.json'
import { avgPerBill, parseFinanceReport, revenueRowLabel, shownPeriod, type RevenueRow } from './finance'

// JSON chép NGUYÊN từ một lần chạy 4 RPC mig 125 trên pglite (bảng seed của plan, giá vốn stub có nguyên liệu chưa
// kiểm + một hàng thiếu giá). Đổi tên khoá ở SQL mà quên đổi parser thì test này đỏ.
const EMPTY_HEAD = { from: '', to: '', periodFrom: '', periodTo: '' }

describe('parseFinanceReport trên JSON thật của RPC mig 125', () => {
  it('Doanh thu theo ngày', () => {
    const r = parseFinanceReport('revenue', rpc.report_revenue_series_day)
    if (r.tab !== 'revenue') throw new Error('sai tab')
    expect(r.grain).toBe('day')
    expect(r.head).toEqual({ from: '2026-12-01', to: '2026-12-03', periodFrom: '', periodTo: '' })
    expect(r.rows[0]).toEqual({
      date: '2026-12-01', revenue: 3170000, discountTotal: 50000, cash: 1000000, bank: 850000, debt: 1200000, other: 120000, billsCount: 6,
    })
    expect(r.rows.map((x) => x.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03'])
    expect(r.totals).toEqual({ revenue: 3470000, discountTotal: 50000, cash: 1000000, bank: 1150000, debt: 1200000, other: 120000, billsCount: 7 })
  })

  it('Doanh thu theo tháng: 12 dòng', () => {
    const r = parseFinanceReport('revenue', rpc.report_revenue_series_month)
    expect(r.tab === 'revenue' && [r.grain, r.rows.length, r.rows[0].date, r.rows[11].revenue]).toEqual(['month', 12, '2026-01-01', 3470000])
  })

  it('Thu chi', () => {
    const r = parseFinanceReport('cashflow', rpc.report_cash_flow)
    if (r.tab !== 'cashflow') throw new Error('sai tab')
    expect(r.funds).toEqual({ cash: { in: 2400000, out: 2900000, net: -500000 }, bank: { in: 1820000, out: 500000, net: 1320000 } })
    expect(r.inflows.map((x) => [x.key, x.label, x.cash, x.bank]).slice(0, 3))
      .toEqual([['bills', 'Thu bill', 1000000, 1150000], ['wallet', 'Thu qua ví', 0, 120000], ['debt', 'Thu nợ', 400000, 500000]])
    expect(r.outflows[0]).toMatchObject({ label: 'Nhập hàng', reportGroup: 'inventory_purchase', cash: 600000, bank: 0 })
  })

  it('Lãi lỗ', () => {
    const r = parseFinanceReport('pnl', rpc.report_profit_loss)
    if (r.tab !== 'pnl') throw new Error('sai tab')
    expect([r.revenue, r.cogsGoods, r.cogsIngredient, r.cogsTotal, r.grossProfit, r.writeoffCost, r.netProfit])
      .toEqual([3470000, 520000, 0, 520000, 2950000, 60000, 2140000])
    expect(r.operatingExpenses.total).toBe(800000)
    expect(r.operatingExpenses.rows.map((x) => [x.name, x.amount])).toEqual([['Lương - thưởng', 500000], ['Đi chợ', 300000]])
    expect(r.otherIncome).toMatchObject({ total: 50000, rows: [{ name: 'Thu khác', amount: 50000 }] })
    expect(r.excluded).toEqual({ inventoryPurchase: 600000, ownerDraw: 2000000, cashTransfer: 1000000 })
    expect(r.warnings).toEqual({
      ingredientUncounted: true,
      missingCostItems: [{ inventoryItemId: '00000000-0000-0000-0000-0000000000a1', name: 'Đá viên' }],
    })
  })

  it('Công nợ', () => {
    const r = parseFinanceReport('debts', rpc.report_receivables)
    if (r.tab !== 'debts') throw new Error('sai tab')
    expect(r.totals).toEqual({ opening: 1550000, incurred: 0, collected: 900000, closing: 650000, age0to7: 300000, age8to30: 100000, ageOver30: 250000 })
    expect(r.rows[0]).toMatchObject({
      name: 'Cty Điện lực', kind: 'company', phone: null, opening: 800000, incurred: 0, collected: 500000, closing: 300000,
      oldestOpenDate: '2026-12-01', age0to7: 300000, age8to30: 0, ageOver30: 0,
    })
    expect(r.rows.find((x) => x.name === 'Anh Hùng')?.oldestOpenDate).toBeNull()
    expect(typeof r.rows[0].customerId).toBe('string')
  })
})

describe('parseFinanceReport rác an toàn', () => {
  it('parseFinanceReport: rác an toàn, số lạ ra 0, warnings mặc định false', () => {
    for (const raw of [null, undefined, 'abc', 42, [], { rows: 'x', totals: 'y', funds: null }]) {
      const rev = parseFinanceReport('revenue', raw)
      expect(rev).toEqual({ tab: 'revenue', grain: 'day', head: EMPTY_HEAD, rows: [],
        totals: { revenue: 0, discountTotal: 0, cash: 0, bank: 0, debt: 0, other: 0, billsCount: 0 } })
      const cf = parseFinanceReport('cashflow', raw)
      expect(cf).toEqual({ tab: 'cashflow', head: EMPTY_HEAD,
        funds: { cash: { in: 0, out: 0, net: 0 }, bank: { in: 0, out: 0, net: 0 } }, inflows: [], outflows: [] })
      const pnl = parseFinanceReport('pnl', raw)
      expect(pnl.tab === 'pnl' && [pnl.revenue, pnl.netProfit, pnl.warnings, pnl.excluded, pnl.operatingExpenses]).toEqual([
        0, 0, { ingredientUncounted: false, missingCostItems: [] }, { inventoryPurchase: 0, ownerDraw: 0, cashTransfer: 0 },
        { total: 0, rows: [] },
      ])
      const debts = parseFinanceReport('debts', raw)
      expect(debts.tab === 'debts' && [debts.rows, debts.totals.closing]).toEqual([[], 0])
    }
    const pnl = parseFinanceReport('pnl', { revenue: 'NaN', warnings: { ingredient_uncounted: 'true', missing_cost_items: [null, 5] } })
    expect(pnl.tab === 'pnl' && [pnl.revenue, pnl.warnings]).toEqual([0, { ingredientUncounted: false, missingCostItems: [] }])
    const month = parseFinanceReport('revenue', { grain: 'month', rows: [{ date: '2026-12-01', revenue: 'x' }, 'rác'] })
    expect(month.tab === 'revenue' && [month.grain, month.rows]).toEqual(['month', [
      { date: '2026-12-01', revenue: 0, discountTotal: 0, cash: 0, bank: 0, debt: 0, other: 0, billsCount: 0 },
    ]])
  })
})

describe('kỳ hiển thị', () => {
  it('Doanh thu chế độ tháng: kỳ là 12 tháng thật của báo cáo; còn lại là kỳ đang chọn', () => {
    const selected = { from: '2026-12-01', to: '2026-12-03' }
    expect(shownPeriod(parseFinanceReport('revenue', rpc.report_revenue_series_month), selected)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(shownPeriod(parseFinanceReport('revenue', rpc.report_revenue_series_day), selected)).toEqual(selected)
    expect(shownPeriod(parseFinanceReport('pnl', rpc.report_profit_loss), selected)).toEqual(selected)
    // Server không trả from/to (rác): giữ kỳ đang chọn.
    expect(shownPeriod(parseFinanceReport('revenue', { grain: 'month' }), selected)).toEqual(selected)
    expect(shownPeriod({ tab: 'item' }, selected)).toEqual(selected)
  })
})

describe('tiện ích', () => {
  it('avgPerBill', () => {
    expect(avgPerBill(3050000, 5)).toBe(610000)
    expect(avgPerBill(0, 0)).toBe(0)
    expect(avgPerBill(100000, 3)).toBe(33333)
    expect(avgPerBill(200000, 3)).toBe(66667)
  })

  it('revenueRowLabel ngày và tháng', () => {
    const row = (date: string): RevenueRow => ({ date, revenue: 0, discountTotal: 0, cash: 0, bank: 0, debt: 0, other: 0, billsCount: 0 })
    expect(revenueRowLabel(row('2026-12-01'), 'day')).toBe('01/12')
    expect(revenueRowLabel(row('2026-12-01'), 'month')).toBe('12/2026')
    expect(revenueRowLabel(row('2026-01-01'), 'month')).toBe('01/2026')
    expect(revenueRowLabel(row(''), 'day')).toBe('—')
  })
})
