import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseSalesReport, type SalesReport } from './sales'
import { buildReportWorkbook, reportWorkbookFileName } from './reports-xlsx'

// Số liệu "ngày D" của test SQL mig 117 (quán 05:00). JSON đúng hình RPC.
const HEAD = { from: '2026-11-01', to: '2026-11-20', period_from: '2026-10-31T22:00:00Z', period_to: '2026-11-20T22:00:00Z' }
const SUMMARY = { items_amount: 1050000, discount_total: 40000, revenue: 1010000, qty_sold: 20, qty_gift: 1, open_tables_count: 0 }
const meta = { storeName: 'Bia lẩu Bảo Lương', from: '2026-11-01', to: '2026-11-20', exportedAt: new Date('2026-11-20T15:00:00Z'), exportedBy: 'Chủ quán · Chủ quán' }

const ITEM = parseSalesReport('item', {
  ...HEAD, summary: SUMMARY,
  rows: [
    { item_name: 'Bia Hà Nội lon', category_id: 'c-do', category_name: 'Đồ uống', qty_sold: 15, qty_gift: 0, amount: 300000 },
    { item_name: 'Lẩu thái', category_id: 'c-lau', category_name: 'Lẩu', qty_sold: 1, qty_gift: 0, amount: 300000 },
    { item_name: 'Ba chỉ nướng', category_id: 'c-nuong', category_name: 'Nướng', qty_sold: 2, qty_gift: 1, amount: 240000 },
    { item_name: 'Bia hơi (Tháp)', category_id: 'c-do', category_name: 'Đồ uống', qty_sold: 1, qty_gift: 0, amount: 150000 },
    { item_name: 'Món cũ', category_id: null, category_name: 'Khác', qty_sold: 1, qty_gift: 0, amount: 60000 },
  ],
})
const CATEGORY = parseSalesReport('category', {
  ...HEAD, summary: SUMMARY,
  rows: [
    { category_id: 'c-do', category_name: 'Đồ uống', qty_sold: 16, qty_gift: 0, amount: 450000,
      items: [{ item_name: 'Bia Hà Nội lon', qty_sold: 15, qty_gift: 0, amount: 300000 }, { item_name: 'Bia hơi (Tháp)', qty_sold: 1, qty_gift: 0, amount: 150000 }] },
    { category_id: 'c-lau', category_name: 'Lẩu', qty_sold: 1, qty_gift: 0, amount: 300000, items: [{ item_name: 'Lẩu thái', qty_sold: 1, qty_gift: 0, amount: 300000 }] },
    { category_id: 'c-nuong', category_name: 'Nướng', qty_sold: 2, qty_gift: 1, amount: 240000, items: [{ item_name: 'Ba chỉ nướng', qty_sold: 2, qty_gift: 1, amount: 240000 }] },
    { category_id: null, category_name: 'Khác', qty_sold: 1, qty_gift: 0, amount: 60000, items: [{ item_name: 'Món cũ', qty_sold: 1, qty_gift: 0, amount: 60000 }] },
  ],
})
const HOUR = parseSalesReport('hour', {
  ...HEAD, summary: SUMMARY,
  rows: [{ hour: 18, orders_count: 2, items_qty: 19, amount: 840000 }, { hour: 4, orders_count: 1, items_qty: 2, amount: 210000 }],
})
const VOIDS = parseSalesReport('voids', {
  ...HEAD,
  totals: { cancelled_amount: 250000, gift_amount: 120000, reduced_amount: 40000, count: 3 },
  rows: [
    { at: '2026-11-20T11:55:00Z', type: 'cancelled', table_label: 'A1', item_name: 'Lẩu riêu', quantity: 1, amount: 250000, reason: 'Bếp hết', by_name: 'Thu ngân' },
    { at: '2026-11-20T11:40:00Z', type: 'quantity', table_label: 'A1', item_name: 'Bia Hà Nội lon', quantity: 2, amount: 40000, reason: 'Khách trả lại', by_name: 'Thu ngân' },
    { at: '2026-11-20T11:30:00Z', type: 'gift', table_label: 'A1', item_name: 'Ba chỉ nướng', quantity: 1, amount: 120000, reason: null, by_name: 'Chủ quán' },
  ],
})

async function roundTrip(report: SalesReport) {
  const buf = await buildReportWorkbook(report, meta).xlsx.writeBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  expect(wb.worksheets).toHaveLength(1)
  return wb.worksheets[0]
}
type Sheet = Awaited<ReturnType<typeof roundTrip>>
/** Mọi dòng dạng mảng giá trị (bỏ ô đầu rỗng do ExcelJS đánh số từ 1). */
const rowsOf = (ws: Sheet) => {
  const out: { n: number; values: unknown[] }[] = []
  ws.eachRow({ includeEmpty: true }, (row, n) => out.push({ n, values: (row.values as unknown[]).slice(1) }))
  return out
}
const valuesOf = (ws: Sheet, first: string) => {
  const r = rowsOf(ws).find((x) => x.values[0] === first)
  expect(r, first).toBeDefined()
  return r!.values
}
const findRow = (ws: Sheet, first: string) => {
  const r = rowsOf(ws).find((x) => x.values[0] === first)
  expect(r, first).toBeDefined()
  return ws.getRow(r!.n)
}

describe('Excel báo cáo bán hàng', () => {
  it('Theo món: sheet "Theo món", hàng tổng 1.050.000, ô tiền là số định dạng #,##0', async () => {
    const ws = await roundTrip(ITEM)
    expect(ws.name).toBe('Theo món')
    expect(ws.getCell('A1').value).toBe('BÁO CÁO THEO MÓN')
    expect(rowsOf(ws).slice(1, 5).map((r) => r.values)).toEqual([
      ['Quán', 'Bia lẩu Bảo Lương'], ['Kỳ', '01/11 – 20/11/2026'], ['Xuất lúc', '20/11/2026 22:00'], ['Người xuất', 'Chủ quán · Chủ quán'],
    ])
    expect(valuesOf(ws, 'Món')).toEqual(['Món', 'Danh mục', 'SL bán', 'SL tặng', 'Tiền', '%'])
    const bia = findRow(ws, 'Bia Hà Nội lon')
    expect(bia.getCell(5).value).toBe(300000)
    expect(bia.getCell(5).numFmt).toBe('#,##0')
    expect(bia.getCell(6).value).toBe(28.6)
    expect(bia.getCell(6).numFmt).toBe('0.0')
    expect(findRow(ws, 'Món cũ').getCell(2).value).toBe('Khác')
    const total = findRow(ws, 'Tổng')
    expect([total.getCell(3).value, total.getCell(4).value, total.getCell(5).value]).toEqual([20, 1, 1050000])
    expect(total.getCell(5).numFmt).toBe('#,##0')
    expect(total.font?.bold).toBe(true)
    expect(findRow(ws, 'Tiền món').getCell(2).value).toBe(1050000)
    expect(findRow(ws, 'Giảm giá').getCell(2).value).toBe(40000)
    const revenue = findRow(ws, 'Doanh thu')
    expect(revenue.getCell(2).value).toBe(1010000)
    expect(revenue.getCell(2).numFmt).toBe('#,##0')
  })

  it('Món huỷ: cột Loại ghi Bỏ / Tặng / Giảm SL', async () => {
    const ws = await roundTrip(VOIDS)
    expect(ws.name).toBe('Món huỷ')
    expect(ws.getCell('A1').value).toBe('BÁO CÁO MÓN HUỶ')
    expect(valuesOf(ws, 'Giờ')).toEqual(['Giờ', 'Bàn', 'Món', 'SL', 'Tiền', 'Loại', 'Lý do', 'Người làm'])
    const body = rowsOf(ws).filter((r) => typeof r.values[0] === 'string' && /^\d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(r.values[0] as string))
    expect(body.map((r) => [r.values[0], r.values[2], r.values[4], r.values[5], r.values[6] ?? null])).toEqual([
      ['20/11/2026 18:55', 'Lẩu riêu', 250000, 'Bỏ', 'Bếp hết'],
      ['20/11/2026 18:40', 'Bia Hà Nội lon', 40000, 'Giảm SL', 'Khách trả lại'],
      ['20/11/2026 18:30', 'Ba chỉ nướng', 120000, 'Tặng', null],
    ])
    expect(ws.getRow(body[0].n).getCell(5).numFmt).toBe('#,##0')
    expect(findRow(ws, 'Tổng').getCell(5).value).toBe(410000)
    expect(findRow(ws, 'Tiền bỏ').getCell(2).value).toBe(250000)
    expect(findRow(ws, 'Tiền tặng').getCell(2).value).toBe(120000)
    expect(findRow(ws, 'Giảm SL').getCell(2).value).toBe(40000)
    // Món huỷ không có khối Tiền món / Giảm giá / Doanh thu.
    expect(rowsOf(ws).some((r) => r.values[0] === 'Doanh thu')).toBe(false)
  })

  it('Theo danh mục: một dòng mỗi danh mục, không lồng món', async () => {
    const ws = await roundTrip(CATEGORY)
    expect(ws.name).toBe('Theo danh mục')
    expect(valuesOf(ws, 'Danh mục')).toEqual(['Danh mục', 'SL bán', 'SL tặng', 'Tiền', '%'])
    const header = findRow(ws, 'Danh mục').number
    const total = findRow(ws, 'Tổng').number
    const body = rowsOf(ws).filter((r) => r.n > header && r.n < total)
    expect(body.map((r) => r.values)).toEqual([
      ['Đồ uống', 16, 0, 450000, 42.9],
      ['Lẩu', 1, 0, 300000, 28.6],
      ['Nướng', 2, 1, 240000, 22.9],
      ['Khác', 1, 0, 60000, 5.7],
    ])
    expect(rowsOf(ws).some((r) => r.values[0] === 'Bia Hà Nội lon')).toBe(false)
    expect(ws.getRow(total).getCell(4).value).toBe(1050000)
  })

  it('Theo giờ: thứ tự server, giờ HH:00, cột tiền là số', async () => {
    const ws = await roundTrip(HOUR)
    expect(ws.name).toBe('Theo giờ')
    expect(valuesOf(ws, 'Giờ')).toEqual(['Giờ', 'Lượt gọi', 'SL món', 'Tiền'])
    expect(valuesOf(ws, '18:00')).toEqual(['18:00', 2, 19, 840000])
    expect(findRow(ws, '04:00').number).toBe(findRow(ws, '18:00').number + 1)
    expect(valuesOf(ws, 'Tổng')).toEqual(['Tổng', 3, 21, 1050000])
    expect(findRow(ws, 'Doanh thu').getCell(2).value).toBe(1010000)
  })

  it('kỳ trống: vẫn có bảng với dòng Tổng 0, % không chia cho 0', async () => {
    const ws = await roundTrip(parseSalesReport('item', { ...HEAD, summary: {}, rows: [] }))
    expect(valuesOf(ws, 'Tổng')).toEqual(['Tổng', undefined, 0, 0, 0, 0])
  })

  it('tên file: bao-cao-item-bia-lau-bao-luong-2026-11-01_2026-11-20.xlsx', () => {
    expect(reportWorkbookFileName('Bia lẩu Bảo Lương', 'item', '2026-11-01', '2026-11-20')).toBe('bao-cao-item-bia-lau-bao-luong-2026-11-01_2026-11-20.xlsx')
    expect(reportWorkbookFileName('Yên Garden', 'voids', '2026-11-20', '2026-11-20')).toBe('bao-cao-voids-yen-garden-2026-11-20_2026-11-20.xlsx')
    expect(reportWorkbookFileName('', 'hour', '2026-11-20', '2026-11-20')).toBe('bao-cao-hour-quan-2026-11-20_2026-11-20.xlsx')
  })
})

// ================================================================================================================
// 4 tab tài chính — JSON thật của RPC mig 125 (lib/reports/__fixtures__/rpc-125.json, kỳ 01/12 – 03/12/2026).
// Số khác brief (brief viết trước khi fixture thêm đơn ví 120.000 ngày 01/12): doanh thu 3.470.000 (brief 3.350.000),
// lãi ròng 1.240.000 (brief 1.120.000). Fixture lãi lỗ chụp với nguyên liệu CHƯA kiểm (lãi ròng 2.140.000); bản "đã
// kiểm" ở đây dựng lại từ cùng JSON với giá vốn nguyên liệu 900.000 như test SQL Task 8.
describe('Excel báo cáo tài chính', async () => {
  const rpc = (await import('./__fixtures__/rpc-125.json')).default
  const { parseFinanceReport } = await import('./finance')
  const fmeta = { ...meta, from: '2026-12-01', to: '2026-12-03' }
  const sheetOf = async (report: Parameters<typeof buildReportWorkbook>[0], m = fmeta) => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await buildReportWorkbook(report, m).xlsx.writeBuffer())
    expect(wb.worksheets).toHaveLength(1)
    return wb.worksheets[0]
  }
  const pnlCounted = parseFinanceReport('pnl', {
    ...rpc.report_profit_loss,
    cogs_ingredient: 900000, cogs_total: 1420000, gross_profit: 2050000, net_profit: 1240000,
    warnings: { ingredient_uncounted: false, missing_cost_items: [] },
  })

  it('Lãi lỗ: dòng Lãi ròng = 1.240.000 là số', async () => {
    const ws = await sheetOf(pnlCounted)
    expect(ws.name).toBe('Lãi lỗ')
    expect(ws.getCell('A1').value).toBe('BÁO CÁO LÃI LỖ')
    expect(valuesOf(ws, 'Khoản')).toEqual(['Khoản', 'Số tiền'])
    const labels = rowsOf(ws).map((r) => r.values[0]).filter((v) => typeof v === 'string') as string[]
    const order = ['Doanh thu thuần', '− Giá vốn hàng bán', '= Lãi gộp', '− Chi phí hoạt động', '− Hàng huỷ', '+ Thu nhập khác', '= Lãi ròng']
    const pos = order.map((l) => labels.indexOf(l))
    expect(pos.every((x) => x >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    const net = findRow(ws, '= Lãi ròng')
    expect(net.getCell(2).value).toBe(1240000)
    expect(net.getCell(2).numFmt).toBe('#,##0')
    expect(net.font?.bold).toBe(true)
    expect(findRow(ws, 'Doanh thu thuần').getCell(2).value).toBe(3470000)
    expect(findRow(ws, '= Lãi gộp').getCell(2).value).toBe(2050000)
    expect(findRow(ws, '    Nguyên liệu').getCell(2).value).toBe(900000)
    expect(findRow(ws, '    Lương - thưởng').getCell(2).value).toBe(500000)
    expect(findRow(ws, 'Nhập hàng (đã nằm trong giá vốn)').getCell(2).value).toBe(600000)
    expect(findRow(ws, 'Chủ quán rút').getCell(2).value).toBe(2000000)
    expect(findRow(ws, 'Chuyển quỹ (tổng phiếu, không tính)').getCell(2).value).toBe(1000000)
    expect(labels.some((l) => l.startsWith('Cảnh báo'))).toBe(false)
    expect(labels).toContain('Phiếu huỷ sau này không còn tính vào kỳ đã qua.')
    // Nguyên liệu chưa kiểm + thiếu giá: hai dòng cảnh báo bằng chữ; lãi ròng âm vẫn là SỐ âm.
    const warn = await sheetOf({ ...parseFinanceReport('pnl', rpc.report_profit_loss), netProfit: -150000 } as never)
    const wl = rowsOf(warn).map((r) => r.values[0])
    expect(wl).toContain('Cảnh báo: Giá vốn nguyên liệu chưa tính — cần kiểm kho')
    expect(wl).toContain('Cảnh báo: Thiếu giá nhập: Đá viên')
    expect(findRow(warn, '= Lãi ròng').getCell(2).value).toBe(-150000)
  })

  it('Doanh thu: 3 dòng ngày + dòng Tổng 3.470.000', async () => {
    const ws = await sheetOf(parseFinanceReport('revenue', rpc.report_revenue_series_day))
    expect(ws.name).toBe('Doanh thu')
    expect(valuesOf(ws, 'Chế độ')).toEqual(['Chế độ', 'Ngày'])
    expect(valuesOf(ws, 'Ngày')).toEqual(['Ngày', 'Doanh thu', 'Giảm giá', 'Tiền mặt', 'Chuyển khoản', 'Ghi nợ', 'Số bill', 'TB/bill'])
    expect(valuesOf(ws, '01/12')).toEqual(['01/12', 3170000, 50000, 1000000, 850000, 1200000, 6, 528333])
    expect(valuesOf(ws, '02/12')[1]).toBe(300000)
    expect(valuesOf(ws, '03/12')[1]).toBe(0)
    const total = findRow(ws, 'Tổng')
    expect(total.getCell(2).value).toBe(3470000)
    expect(total.getCell(2).numFmt).toBe('#,##0')
    expect(total.getCell(7).value).toBe(7)
    expect(total.getCell(7).numFmt).not.toBe('#,##0.00')
  })

  it('Doanh thu tháng: dòng Kỳ ghi đúng 12 tháng của báo cáo, không phải kỳ đang chọn', async () => {
    const month = parseFinanceReport('revenue', rpc.report_revenue_series_month)
    const ws = await sheetOf(month)
    expect(valuesOf(ws, 'Kỳ')).toEqual(['Kỳ', '01/01 – 31/12/2026'])
    expect(valuesOf(ws, 'Chế độ')).toEqual(['Chế độ', 'Tháng'])
    expect(valuesOf(ws, 'Tháng')[0]).toBe('Tháng')
    expect(valuesOf(ws, '12/2026')[1]).toBe(3470000)
  })

  it('Công nợ: dòng tổng Nợ cuối kỳ 650.000', async () => {
    const ws = await sheetOf(parseFinanceReport('debts', rpc.report_receivables), { ...fmeta, from: '2026-12-02' })
    expect(ws.name).toBe('Công nợ')
    expect(valuesOf(ws, 'Tên')).toEqual(['Tên', 'SĐT', 'Nợ đầu kỳ', 'Phát sinh', 'Đã thu', 'Nợ cuối kỳ', 'Bill nợ cũ nhất'])
    expect(valuesOf(ws, 'Cty Điện lực')).toEqual(['Cty Điện lực', undefined, 800000, 0, 500000, 300000, '01/12/2026'])
    const total = findRow(ws, 'Tổng')
    expect([total.getCell(3).value, total.getCell(6).value]).toEqual([1550000, 650000])
    expect(total.getCell(6).numFmt).toBe('#,##0')
    expect(findRow(ws, '0–7 ngày').getCell(2).value).toBe(300000)
    expect(findRow(ws, '8–30 ngày').getCell(2).value).toBe(100000)
    expect(findRow(ws, 'Trên 30 ngày').getCell(2).value).toBe(250000)
  })

  it('Thu chi: Chênh lệch Tiền mặt -500.000; quỹ ngân hàng ghi "Ngân hàng / ví" khi có ví', async () => {
    const cf = parseFinanceReport('cashflow', rpc.report_cash_flow)
    if (cf.tab !== 'cashflow') throw new Error('sai tab')
    const ws = await sheetOf(cf)
    expect(ws.name).toBe('Thu chi')
    const diff = findRow(ws, 'Tiền mặt: Chênh lệch')
    expect(diff.getCell(2).value).toBe(-500000)
    expect(diff.getCell(2).numFmt).toBe('#,##0')
    expect(findRow(ws, 'Ngân hàng / ví: Vào').getCell(2).value).toBe(1820000)
    expect(findRow(ws, 'Ngân hàng / ví: Chênh lệch').getCell(2).value).toBe(1320000)
    expect(valuesOf(ws, 'Tiền vào')).toEqual(['Tiền vào', 'Tiền mặt', 'Chuyển khoản'])
    expect(valuesOf(ws, 'Tiền ra')).toEqual(['Tiền ra', 'Tiền mặt', 'Chuyển khoản'])
    expect(valuesOf(ws, 'Thu qua ví')).toEqual(['Thu qua ví', 0, 120000])
    expect(valuesOf(ws, 'Nhập hàng')).toEqual(['Nhập hàng', 600000, 0])
    const labels = rowsOf(ws).map((r) => r.values[0])
    expect(labels).toContain('Ghi nợ không tính là tiền vào. Không có số dư đầu kỳ.')
    expect(labels).toContain('Tiền ví về tài khoản ngân hàng khi đối soát.')
    // Không có ví: quỹ ghi "Ngân hàng".
    const plain = await sheetOf({ ...cf, inflows: cf.inflows.filter((x) => x.key !== 'wallet') } as never)
    expect(findRow(plain, 'Ngân hàng: Vào').getCell(2).value).toBe(1820000)
    expect(rowsOf(plain).some((r) => r.values[0] === 'Tiền ví về tài khoản ngân hàng khi đối soát.')).toBe(false)
  })

  it('tên file theo tab tài chính', () => {
    expect(reportWorkbookFileName('Yên Garden', 'pnl', '2026-12-01', '2026-12-03')).toBe('bao-cao-pnl-yen-garden-2026-12-01_2026-12-03.xlsx')
  })
})
