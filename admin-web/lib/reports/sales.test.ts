import { describe, expect, it } from 'vitest'
import {
  VOID_TYPE_LABEL,
  discountGap,
  parseSalesReport,
  percentOf,
  sortItemRows,
  type SalesItemRow,
  type SalesSummary,
} from './sales'

const HEAD = { from: '2026-11-20', to: '2026-11-20', period_from: '2026-11-19T22:00:00+00:00', period_to: '2026-11-20T22:00:00+00:00' }
const SUMMARY = { items_amount: 1050000, discount_total: 40000, revenue: 1010000, qty_sold: 20, qty_gift: 1, open_tables_count: 2 }
const EMPTY_SUMMARY: SalesSummary = { itemsAmount: 0, discountTotal: 0, revenue: 0, qtySold: 0, qtyGift: 0, openTablesCount: 0 }
const EMPTY_HEAD = { from: '', to: '', periodFrom: '', periodTo: '' }

describe('parseSalesReport', () => {
  it('Theo món: đổi tên trường, giữ thứ tự server', () => {
    const r = parseSalesReport('item', {
      ...HEAD, summary: SUMMARY,
      rows: [
        { item_name: 'Bia Hà Nội lon', category_id: 'c1', category_name: 'Đồ uống', qty_sold: 15, qty_gift: 0, amount: 300000 },
        { item_name: 'Món cũ', category_id: null, category_name: 'Khác', qty_sold: 1, qty_gift: 0, amount: 60000 },
      ],
    })
    expect(r).toEqual({
      tab: 'item',
      head: { from: '2026-11-20', to: '2026-11-20', periodFrom: HEAD.period_from, periodTo: HEAD.period_to },
      summary: { itemsAmount: 1050000, discountTotal: 40000, revenue: 1010000, qtySold: 20, qtyGift: 1, openTablesCount: 2 },
      rows: [
        { itemName: 'Bia Hà Nội lon', categoryId: 'c1', categoryName: 'Đồ uống', qtySold: 15, qtyGift: 0, amount: 300000 },
        { itemName: 'Món cũ', categoryId: null, categoryName: 'Khác', qtySold: 1, qtyGift: 0, amount: 60000 },
      ],
    })
  })

  it('Theo danh mục: có món xổ ra', () => {
    const r = parseSalesReport('category', {
      ...HEAD, summary: SUMMARY,
      rows: [{ category_id: null, category_name: 'Khác', qty_sold: 2, qty_gift: 1, amount: 70000,
        items: [{ item_name: 'Gà rán', qty_sold: 2, qty_gift: 1, amount: 70000 }, 'rác'] }],
    })
    expect(r.tab === 'category' && r.rows).toEqual([{
      categoryId: null, categoryName: 'Khác', qtySold: 2, qtyGift: 1, amount: 70000,
      items: [{ itemName: 'Gà rán', qtySold: 2, qtyGift: 1, amount: 70000 }],
    }])
  })

  it('Theo giờ', () => {
    const r = parseSalesReport('hour', { ...HEAD, summary: SUMMARY, rows: [{ hour: 18, orders_count: 2, items_qty: 19, amount: '840000' }] })
    expect(r.tab === 'hour' && r.rows).toEqual([{ hour: 18, ordersCount: 2, itemsQty: 19, amount: 840000 }])
  })

  it('Món huỷ: totals + dòng, lý do rỗng ra null, loại lạ bị bỏ', () => {
    const r = parseSalesReport('voids', {
      ...HEAD,
      totals: { cancelled_amount: 250000, gift_amount: 120000, reduced_amount: 40000, count: 3 },
      rows: [
        { at: '2026-11-20T11:55:00+00:00', type: 'cancelled', table_label: 'A1', item_name: 'Lẩu riêu', quantity: 1, amount: 250000, reason: 'Bếp hết', by_name: 'Thu ngân' },
        { at: '2026-11-20T11:30:00+00:00', type: 'gift', table_label: null, item_name: 'Ba chỉ nướng', quantity: 1, amount: 120000, reason: '  ', by_name: null },
        { at: 'x', type: 'xoá', item_name: 'Lạ', quantity: 1, amount: 1 },
      ],
    })
    expect(r).toEqual({
      tab: 'voids',
      head: { from: '2026-11-20', to: '2026-11-20', periodFrom: HEAD.period_from, periodTo: HEAD.period_to },
      totals: { cancelledAmount: 250000, giftAmount: 120000, reducedAmount: 40000, count: 3 },
      rows: [
        { at: '2026-11-20T11:55:00+00:00', type: 'cancelled', tableLabel: 'A1', itemName: 'Lẩu riêu', quantity: 1, amount: 250000, reason: 'Bếp hết', byName: 'Thu ngân' },
        { at: '2026-11-20T11:30:00+00:00', type: 'gift', tableLabel: '—', itemName: 'Ba chỉ nướng', quantity: 1, amount: 120000, reason: null, byName: null },
      ],
    })
  })

  it('rác an toàn: null, chuỗi, mảng, số hỏng', () => {
    for (const raw of [null, undefined, 'abc', 42, [], { rows: 'x', summary: 'y' }]) {
      expect(parseSalesReport('item', raw)).toEqual({ tab: 'item', head: EMPTY_HEAD, summary: EMPTY_SUMMARY, rows: [] })
      expect(parseSalesReport('category', raw)).toEqual({ tab: 'category', head: EMPTY_HEAD, summary: EMPTY_SUMMARY, rows: [] })
      expect(parseSalesReport('hour', raw)).toEqual({ tab: 'hour', head: EMPTY_HEAD, summary: EMPTY_SUMMARY, rows: [] })
      expect(parseSalesReport('voids', raw)).toEqual({
        tab: 'voids', head: EMPTY_HEAD, totals: { cancelledAmount: 0, giftAmount: 0, reducedAmount: 0, count: 0 }, rows: [],
      })
    }
    const r = parseSalesReport('item', { summary: { revenue: 'NaN', items_amount: Infinity }, rows: [{ item_name: 5, amount: 'abc', category_name: '' }, null] })
    expect(r.tab === 'item' && r.summary).toEqual(EMPTY_SUMMARY)
    expect(r.tab === 'item' && r.rows).toEqual([{ itemName: '', categoryId: null, categoryName: 'Khác', qtySold: 0, qtyGift: 0, amount: 0 }])
  })
})

describe('tiện ích', () => {
  it('percentOf: một chữ số thập phân, total 0 ra 0', () => {
    expect(percentOf(300000, 1050000)).toBe(28.6)
    expect(percentOf(60000, 1050000)).toBe(5.7)
    expect(percentOf(1, 3)).toBe(33.3)
    expect(percentOf(5, 0)).toBe(0)
    expect(percentOf(0, 100)).toBe(0)
  })

  it('sortItemRows theo SL và theo tiền, không đổi mảng gốc', () => {
    const row = (itemName: string, qtySold: number, amount: number): SalesItemRow =>
      ({ itemName, categoryId: null, categoryName: 'Khác', qtySold, qtyGift: 0, amount })
    const rows = [row('Lẩu thái', 1, 300000), row('Bia', 15, 300000), row('Ba chỉ', 2, 240000), row('Trà đá', 15, 75000)]
    const copy = [...rows]
    expect(sortItemRows(rows, 'qty').map((r) => r.itemName)).toEqual(['Bia', 'Trà đá', 'Ba chỉ', 'Lẩu thái'])
    expect(sortItemRows(rows, 'amount').map((r) => r.itemName)).toEqual(['Bia', 'Lẩu thái', 'Ba chỉ', 'Trà đá'])
    expect(rows).toEqual(copy)
  })

  it('discountGap = tiền món − giảm giá − doanh thu (0 khi khớp A04)', () => {
    const s: SalesSummary = { itemsAmount: 1050000, discountTotal: 40000, revenue: 1010000, qtySold: 20, qtyGift: 1, openTablesCount: 0 }
    expect(discountGap(s)).toBe(0)
    expect(discountGap({ ...s, revenue: 1000000 })).toBe(10000)
  })

  it('VOID_TYPE_LABEL', () => {
    expect(VOID_TYPE_LABEL).toEqual({ cancelled: 'Bỏ', gift: 'Tặng', quantity: 'Giảm SL' })
  })
})
