import { describe, expect, it } from 'vitest'
import rpc125 from './__fixtures__/rpc-125.json'
import { parseFinanceReport } from './finance'
import type { CashFlowOutLine, ReceivableRow, RevenueRow } from './finance'
import {
  categoryShares, collectedRate, debtAgeDays, hourSummary, itemCategoryShares, marginPercent, opexShares, outflowBars,
  paymentMix, revenueExtremes, topDebtors, topItems, topWithRest, voidReasons, voidTopItems, waterfallSteps,
} from './insights'
import type { SalesCategoryRow, SalesHourRow, SalesItemRow, VoidRow } from './sales'

const item = (itemName: string, categoryId: string | null, categoryName: string, qtySold: number, qtyGift: number, amount: number): SalesItemRow =>
  ({ itemName, categoryId, categoryName, qtySold, qtyGift, amount })
const ITEMS: SalesItemRow[] = [
  item('Bia Hà Nội lon', 'c-do', 'Đồ uống', 15, 0, 300000),
  item('Lẩu thái', 'c-lau', 'Lẩu', 1, 0, 300000),
  item('Ba chỉ nướng', 'c-nuong', 'Nướng', 2, 1, 240000),
  item('Bia hơi (Tháp)', 'c-do', 'Đồ uống', 1, 0, 150000),
  item('Món cũ', null, 'Khác', 1, 0, 60000),
]
const HOURS: SalesHourRow[] = [
  { hour: 18, ordersCount: 2, itemsQty: 19, amount: 840000 },
  { hour: 4, ordersCount: 1, itemsQty: 2, amount: 210000 },
]
const VOIDS: VoidRow[] = [
  { at: '2026-11-20T11:55:00Z', type: 'cancelled', tableLabel: 'A1', itemName: 'Lẩu riêu', quantity: 1, amount: 250000, reason: 'Bếp hết', byName: 'Thu ngân' },
  { at: '2026-11-20T11:40:00Z', type: 'quantity', tableLabel: 'A1', itemName: 'Bia Hà Nội lon', quantity: 2, amount: 40000, reason: 'Khách trả lại', byName: 'Thu ngân' },
  { at: '2026-11-20T11:30:00Z', type: 'gift', tableLabel: 'A1', itemName: 'Ba chỉ nướng', quantity: 1, amount: 120000, reason: null, byName: 'Chủ quán' },
]

const revenue = parseFinanceReport('revenue', rpc125.report_revenue_series_day)
const pnl = parseFinanceReport('pnl', rpc125.report_profit_loss)
if (revenue.tab !== 'revenue' || pnl.tab !== 'pnl') throw new Error('sai tab')

describe('chia lát', () => {
  it('itemCategoryShares gom theo danh mục, món mất danh mục thành other', () => {
    const s = itemCategoryShares(ITEMS)
    expect(s.map((x) => x.key)).toEqual(['c-do', 'c-lau', 'c-nuong', 'other'])
    expect(s[0]).toMatchObject({ value: 450000, qty: 16 })
  })

  it('topWithRest gộp phần còn lại và gộp luôn lát other', () => {
    const shares = [
      { key: 'a', label: 'A', value: 70, qty: 1 }, { key: 'b', label: 'B', value: 60, qty: 1 },
      { key: 'c', label: 'C', value: 50, qty: 1 }, { key: 'other', label: 'Khác', value: 45, qty: 2 },
      { key: 'd', label: 'D', value: 40, qty: 1 }, { key: 'e', label: 'E', value: 30, qty: 1 },
      { key: 'f', label: 'F', value: 20, qty: 1 },
    ]
    const r = topWithRest(shares, 5)
    expect(r).toHaveLength(6)
    expect(r.some((x) => x.key === 'other')).toBe(false)
    const last = r[r.length - 1]
    expect(last).toMatchObject({ key: '__rest', label: 'Khác' })
    // Gộp: other(45) + e(30) + f(20) hoặc tuỳ top 5; tổng giá trị phải bảo toàn.
    expect(r.reduce((a, x) => a + x.value, 0)).toBe(315)
    expect(r.reduce((a, x) => a + (x.qty ?? 0), 0)).toBe(8)
  })

  it('topWithRest: other nằm trong top max và có __rest thì vẫn bị gộp (một lát Khác duy nhất)', () => {
    const shares = [
      { key: 'other', label: 'Khác', value: 100 }, { key: 'a', label: 'A', value: 50 }, { key: 'b', label: 'B', value: 40 },
      { key: 'c', label: 'C', value: 30 },
    ]
    const r = topWithRest(shares, 2)
    expect(r.filter((x) => x.label === 'Khác')).toHaveLength(1)
    expect(r.map((x) => x.key)).toEqual(['a', 'b', '__rest'])
    expect(r[2].value).toBe(130)
  })

  it('topWithRest không vượt max thì giữ nguyên, chỉ sắp lại', () => {
    const r = topWithRest([{ key: 'a', label: 'A', value: 1 }, { key: 'other', label: 'Khác', value: 5 }], 5)
    expect(r.map((x) => x.key)).toEqual(['other', 'a'])
  })

  it('categoryShares', () => {
    const rows: SalesCategoryRow[] = [
      { categoryId: 'x', categoryName: 'X', qtySold: 3, qtyGift: 0, amount: 100, items: [] },
      { categoryId: null, categoryName: 'Khác', qtySold: 1, qtyGift: 0, amount: 200, items: [] },
    ]
    expect(categoryShares(rows).map((s) => s.key)).toEqual(['other', 'x'])
  })

  it('opexShares dùng hạng mục chi, tối đa 4 + Khác', () => {
    const p = { ...pnl, operatingExpenses: { total: 0, rows: Array.from({ length: 6 }, (_, i) => ({ categoryId: `k${i}`, name: `K${i}`, amount: 10 * (i + 1) })) } }
    const s = opexShares(p)
    expect(s).toHaveLength(5)
    expect(s[4].key).toBe('__rest')
    expect(opexShares(pnl).map((x) => x.label)).toEqual(['Lương - thưởng', 'Đi chợ'])
  })
})

describe('xếp hạng', () => {
  it('topItems theo tiền / SL', () => {
    expect(topItems(ITEMS, 'qty', 1)[0].itemName).toBe('Bia Hà Nội lon')
    expect(topItems(ITEMS, 'amount', 3)).toHaveLength(3)
  })

  it('hourSummary', () => {
    expect(hourSummary(HOURS)).toEqual({ peakHour: 18, peakAmount: 840000, busiestHour: 18, busiestOrders: 2, totalOrders: 3, avgPerOrder: 350000 })
    expect(hourSummary([])).toBeNull()
    expect(hourSummary([{ hour: 1, ordersCount: 0, itemsQty: 0, amount: 0 }])).toBeNull()
  })

  it('hourSummary hoà thì lấy giờ đứng trước, 0 lượt thì avg 0', () => {
    const r = hourSummary([{ hour: 9, ordersCount: 0, itemsQty: 0, amount: 100 }, { hour: 10, ordersCount: 0, itemsQty: 0, amount: 100 }])
    expect(r).toMatchObject({ peakHour: 9, avgPerOrder: 0, totalOrders: 0 })
  })

  it('voidReasons / voidTopItems', () => {
    expect(voidReasons(VOIDS)).toContainEqual({ reason: 'Không ghi lý do', count: 1 })
    expect(voidTopItems(VOIDS)[0]).toEqual({ itemName: 'Bia Hà Nội lon', quantity: 2 })
  })

  it('topDebtors chỉ lấy closing > 0, giảm dần', () => {
    const base = { opening: 0, incurred: 0, collected: 0, age0to7: 0, age8to30: 0, ageOver30: 0, phone: null, kind: 'x', oldestOpenDate: null }
    const rows: ReceivableRow[] = [
      { ...base, customerId: '1', name: 'A', closing: 0 }, { ...base, customerId: '2', name: 'B', closing: 5 },
      { ...base, customerId: '3', name: 'C', closing: 9 },
    ]
    expect(topDebtors(rows).map((r) => r.name)).toEqual(['C', 'B'])
  })
})

describe('doanh thu và dòng tiền', () => {
  it('revenueExtremes trên fixture', () => {
    const r = revenueExtremes(revenue.rows)!
    expect(r.best.date).toBe('2026-12-01')
    expect(r.worst.date).toBe('2026-12-02') // dòng 12-03 không có bill nên bị bỏ
    expect(r.avg).toBe(Math.round(3470000 / 3))
  })

  it('revenueExtremes: mọi dòng 0 bill → null', () => {
    const zero: RevenueRow[] = revenue.rows.map((x) => ({ ...x, billsCount: 0, revenue: 0 }))
    expect(revenueExtremes(zero)).toBeNull()
    expect(revenueExtremes([])).toBeNull()
  })

  it('paymentMix bỏ lát ≤ 0', () => {
    const t = { ...revenue.totals, other: 0 }
    const m = paymentMix(t)
    expect(m.map((x) => x.key)).toEqual(['cash', 'bank', 'debt'])
    expect(paymentMix(revenue.totals).map((x) => x.key)).toContain('other')
  })

  it('outflowBars bỏ chuyển quỹ, kẹp âm về 0, bỏ 0, sắp giảm dần', () => {
    const lines: CashFlowOutLine[] = [
      { key: 'a', label: 'Chuyển quỹ', cash: 900000, bank: 0, reportGroup: 'cash_transfer' },
      { key: 'b', label: 'Hoàn', cash: -500000, bank: 200000, reportGroup: 'expense' },
      { key: 'c', label: 'Không', cash: 0, bank: 0, reportGroup: 'expense' },
      { key: 'd', label: 'Lớn', cash: 700000, bank: 100000, reportGroup: 'expense' },
    ]
    const r = outflowBars(lines)
    expect(r.map((x) => x.key)).toEqual(['d', 'b'])
    expect(r[1]).toMatchObject({ cash: 0, bank: 200000, total: 200000 })
  })
})

describe('lãi lỗ và công nợ', () => {
  it('waterfallSteps: 6 bước đúng thứ tự, cộng khớp', () => {
    const s = waterfallSteps(pnl)
    expect(s.map((x) => x.label)).toEqual(['Doanh thu', 'Giá vốn', 'Lãi gộp', 'Chi phí', 'Huỷ + khác', 'Lãi ròng'])
    expect(s.map((x) => x.kind)).toEqual(['total', 'delta', 'total', 'delta', 'delta', 'total'])
    const v = (l: string) => s.find((x) => x.label === l)!.value
    expect(v('Doanh thu') + v('Giá vốn')).toBe(v('Lãi gộp'))
    expect(v('Lãi gộp') + v('Chi phí') + v('Huỷ + khác')).toBe(v('Lãi ròng'))
  })

  it('marginPercent', () => {
    expect(marginPercent(70_700_000, 111_900_000)).toBe(63.2)
    expect(marginPercent(1, 0)).toBeNull()
  })

  it('collectedRate', () => {
    const a = { opening: 6_200_000, incurred: 8_950_000, collected: 5_400_000, closing: 0, age0to7: 0, age8to30: 0, ageOver30: 0 }
    expect(collectedRate(a)).toBe(35.6)
    expect(collectedRate({ ...a, opening: 0, incurred: 0 })).toBeNull()
  })

  it('debtAgeDays', () => {
    expect(debtAgeDays('2026-10-09', '2026-11-16')).toBe(38)
    expect(debtAgeDays(null, '2026-11-16')).toBeNull()
  })
})
