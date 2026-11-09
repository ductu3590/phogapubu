import { describe, expect, it } from 'vitest'
import rpc from './__fixtures__/rpc-117.json'
import { discountGap, parseSalesReport } from './sales'

// Ghim tên trường: JSON chép NGUYÊN từ một lần chạy 4 RPC mig 117 trên pglite (một bill phiên bàn A1 có tặng,
// bỏ, giảm SL, giảm giá bill 20.000; món cũ không còn danh mục). Đổi tên khoá ở SQL mà quên đổi parser thì
// test này đỏ, thay vì trang âm thầm hiện toàn số 0.
describe('parseSalesReport trên JSON thật của RPC mig 117', () => {
  it('report_sales_by_item', () => {
    const r = parseSalesReport('item', rpc.report_sales_by_item)
    expect(r).toEqual({
      tab: 'item',
      head: { from: '2026-03-20', to: '2026-03-20', periodFrom: '2026-03-20T05:00:00+07:00', periodTo: '2026-03-21T05:00:00+07:00' },
      summary: { itemsAmount: 360000, discountTotal: 20000, revenue: 340000, qtySold: 2, qtyGift: 1, openTablesCount: 0 },
      rows: [
        { itemName: 'Lẩu thái', categoryId: '00000000-0000-0000-0000-000000000031', categoryName: 'Lẩu', qtySold: 1, qtyGift: 1, amount: 300000 },
        { itemName: 'Món cũ', categoryId: null, categoryName: 'Khác', qtySold: 1, qtyGift: 0, amount: 60000 },
      ],
    })
    expect(r.tab === 'item' && discountGap(r.summary)).toBe(0)
  })

  it('report_sales_by_category', () => {
    const r = parseSalesReport('category', rpc.report_sales_by_category)
    expect(r.tab === 'category' && r.rows).toEqual([
      { categoryId: '00000000-0000-0000-0000-000000000031', categoryName: 'Lẩu', qtySold: 1, qtyGift: 1, amount: 300000,
        items: [{ itemName: 'Lẩu thái', qtySold: 1, qtyGift: 1, amount: 300000 }] },
      { categoryId: null, categoryName: 'Khác', qtySold: 1, qtyGift: 0, amount: 60000,
        items: [{ itemName: 'Món cũ', qtySold: 1, qtyGift: 0, amount: 60000 }] },
    ])
    expect(r.tab === 'category' && r.summary.revenue).toBe(340000)
  })

  it('report_sales_by_hour', () => {
    const r = parseSalesReport('hour', rpc.report_sales_by_hour)
    expect(r.tab === 'hour' && r.rows).toEqual([{ hour: 18, ordersCount: 1, itemsQty: 3, amount: 360000 }])
    expect(r.tab === 'hour' && r.summary.itemsAmount).toBe(360000)
  })

  it('report_voids', () => {
    const r = parseSalesReport('voids', rpc.report_voids)
    expect(r).toEqual({
      tab: 'voids',
      head: { from: '2026-03-20', to: '2026-03-20', periodFrom: '2026-03-20T05:00:00+07:00', periodTo: '2026-03-21T05:00:00+07:00' },
      totals: { cancelledAmount: 250000, giftAmount: 300000, reducedAmount: 120000, count: 3 },
      rows: [
        { at: '2026-03-20T18:55:00+07:00', type: 'cancelled', tableLabel: 'A1', itemName: 'Lẩu riêu', quantity: 1, amount: 250000, reason: 'Bếp hết', byName: 'Chủ quán' },
        { at: '2026-03-20T18:40:00+07:00', type: 'quantity', tableLabel: 'A1', itemName: 'Món cũ', quantity: 2, amount: 120000, reason: 'Khách trả lại', byName: 'Chủ quán' },
        { at: '2026-03-20T18:30:00+07:00', type: 'gift', tableLabel: 'A1', itemName: 'Lẩu thái', quantity: 1, amount: 300000, reason: null, byName: 'Chủ quán' },
      ],
    })
  })
})
