// Xuất Excel trang Báo cáo (4 tab bán hàng + 4 tab tài chính). Thuần (không gọi mạng) để test được.
// Một workbook = một sheet, đặt tên theo nhãn tab; bảng đúng cột của view trên trang.
// Tiền là SỐ (#,##0), % là SỐ (0.0) để chủ quán cộng / lọc tiếp trong Excel — không ghi chữ "300.000đ".
import ExcelJS from 'exceljs'
import { vnDateTimeLabel } from '@/lib/bills-report'
import { suggestSlug } from '@/lib/slugify'
import { periodLabel } from './period'
import { REPORT_TABS, type ReportTab } from './tabs'
import { VOID_TYPE_LABEL, hourLabel, percentOf, type SalesReport, type SalesSummary } from './sales'
import {
  avgPerBill, revenueRowLabel, shownPeriod,
  type CashFlowReport, type FinanceReport, type ProfitLossReport, type ReceivablesReport, type RevenueReport,
} from './finance'

const MONEY = '#,##0'
const PERCENT = '0.0'

export type ReportWorkbookMeta = { storeName: string; from: string; to: string; exportedAt: Date; exportedBy: string }

type Col = { header: string; width: number; fmt?: string }
type Cell = string | number | null

const tabLabel = (tab: ReportTab): string => REPORT_TABS.find((t) => t.value === tab)?.label ?? tab
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/** Dựng bảng: hàng tiêu đề đậm, các dòng, dòng Tổng đậm; định dạng số theo cột. */
function addTable(ws: ExcelJS.Worksheet, cols: Col[], rows: Cell[][], total: Cell[]) {
  const header = ws.addRow(cols.map((c) => c.header))
  header.font = { bold: true }
  const style = (row: ExcelJS.Row) => cols.forEach((c, i) => { if (c.fmt) row.getCell(i + 1).numFmt = c.fmt })
  for (const r of rows) style(ws.addRow(r))
  const totalRow = ws.addRow(total)
  totalRow.font = { bold: true }
  style(totalRow)
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width ?? 0, c.width) })
}

function addLines(ws: ExcelJS.Worksheet, lines: [string, number][]) {
  ws.addRow([])
  for (const [label, value] of lines) ws.addRow([label, value]).getCell(2).numFmt = MONEY
}

const salesLines = (s: SalesSummary): [string, number][] =>
  [['Tiền món', s.itemsAmount], ['Giảm giá', s.discountTotal], ['Doanh thu', s.revenue]]

// Chữ dùng chung với các view (app/admin/reports/*-view.tsx) — giữ hai nơi cùng một câu.
const VOID_LATER_NOTE = 'Phiếu huỷ sau này không còn tính vào kỳ đã qua.'

function revenueSheet(ws: ExcelJS.Worksheet, r: RevenueReport) {
  const money = (header: string, width = 14) => ({ header, width, fmt: MONEY })
  const vals = (x: Omit<RevenueReport['rows'][number], 'date'>) =>
    [x.revenue, x.discountTotal, x.cash, x.bank, x.debt, x.billsCount, avgPerBill(x.revenue, x.billsCount)]
  addTable(
    ws,
    [{ header: r.grain === 'month' ? 'Tháng' : 'Ngày', width: 12 }, money('Doanh thu'), money('Giảm giá', 12), money('Tiền mặt'),
      money('Chuyển khoản'), money('Ghi nợ'), { header: 'Số bill', width: 9 }, money('TB/bill', 12)],
    r.rows.map((x) => [revenueRowLabel(x, r.grain), ...vals(x)]),
    ['Tổng', ...vals(r.totals)],
  )
  if (r.totals.other > 0) {
    ws.addRow([])
    const row = ws.addRow(['Thu qua ví / phương thức khác (không nằm trong TM, CK, nợ)', r.totals.other])
    row.getCell(2).numFmt = MONEY
  }
}

function cashFlowSheet(ws: ExcelJS.Worksheet, r: CashFlowReport) {
  const cols = (title: string) => [{ header: title, width: 30 }, { header: 'Tiền mặt', width: 14, fmt: MONEY },
    { header: 'Chuyển khoản', width: 14, fmt: MONEY }]
  addTable(ws, cols('Tiền vào'), r.inflows.map((x) => [x.label, x.cash, x.bank]), ['Tổng', r.funds.cash.in, r.funds.bank.in])
  ws.addRow([])
  addTable(ws, cols('Tiền ra'), r.outflows.map((x) => [x.label, x.cash, x.bank]), ['Tổng', r.funds.cash.out, r.funds.bank.out])
  // Cùng nhãn với thẻ quỹ trên trang: có dòng ví thì quỹ ngân hàng là "Ngân hàng / ví".
  const hasWallet = r.inflows.some((x) => x.key === 'wallet')
  const bank = hasWallet ? 'Ngân hàng / ví' : 'Ngân hàng'
  addLines(ws, [
    ['Tiền mặt: Vào', r.funds.cash.in], ['Tiền mặt: Ra', r.funds.cash.out], ['Tiền mặt: Chênh lệch', r.funds.cash.net],
    [`${bank}: Vào`, r.funds.bank.in], [`${bank}: Ra`, r.funds.bank.out], [`${bank}: Chênh lệch`, r.funds.bank.net],
  ])
  ws.addRow([])
  if (hasWallet) ws.addRow(['Tiền ví về tài khoản ngân hàng khi đối soát.'])
  ws.addRow(['Ghi nợ không tính là tiền vào. Không có số dư đầu kỳ.'])
  ws.addRow([VOID_LATER_NOTE])
}

function profitLossSheet(ws: ExcelJS.Worksheet, p: ProfitLossReport) {
  const header = ws.addRow(['Khoản', 'Số tiền'])
  header.font = { bold: true }
  ws.getColumn(1).width = 40
  ws.getColumn(2).width = 16
  const line = (label: string, value: number, bold = false) => {
    const row = ws.addRow([label, value])
    row.getCell(2).numFmt = MONEY
    if (bold) row.font = { bold: true }
  }
  // Thứ tự spec §4.3, cùng chữ với bảng dọc trên trang; dòng con thụt 4 dấu cách.
  line('Doanh thu thuần', p.revenue, true)
  line('− Giá vốn hàng bán', p.cogsTotal)
  line('    Hàng bán', p.cogsGoods)
  line('    Nguyên liệu', p.cogsIngredient)
  line('= Lãi gộp', p.grossProfit, true)
  line('− Chi phí hoạt động', p.operatingExpenses.total)
  for (const x of p.operatingExpenses.rows) line(`    ${x.name}`, x.amount)
  line('− Hàng huỷ', p.writeoffCost)
  line('+ Thu nhập khác', p.otherIncome.total)
  for (const x of p.otherIncome.rows) line(`    ${x.name}`, x.amount)
  line('= Lãi ròng', p.netProfit, true)

  const warnings = [
    ...(p.warnings.ingredientUncounted ? ['Cảnh báo: Giá vốn nguyên liệu chưa tính — cần kiểm kho'] : []),
    ...(p.warnings.missingCostItems.length
      ? [`Cảnh báo: Thiếu giá nhập: ${p.warnings.missingCostItems.map((m) => m.name).join(', ')}`] : []),
  ]
  if (warnings.length) {
    ws.addRow([])
    for (const w of warnings) ws.addRow([w]).font = { bold: true, color: { argb: 'FFB45309' } }
  }
  ws.addRow([])
  ws.addRow(['Không tính vào lãi lỗ']).font = { bold: true }
  line('Nhập hàng (đã nằm trong giá vốn)', p.excluded.inventoryPurchase)
  line('Chủ quán rút', p.excluded.ownerDraw)
  line('Chuyển quỹ (tổng phiếu, không tính)', p.excluded.cashTransfer)
  ws.addRow([])
  ws.addRow([VOID_LATER_NOTE])
}

function receivablesSheet(ws: ExcelJS.Worksheet, r: ReceivablesReport) {
  const money = (header: string) => ({ header, width: 14, fmt: MONEY })
  const ymd = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null)
  addTable(
    ws,
    [{ header: 'Tên', width: 28 }, { header: 'SĐT', width: 13 }, money('Nợ đầu kỳ'), money('Phát sinh'), money('Đã thu'),
      money('Nợ cuối kỳ'), { header: 'Bill nợ cũ nhất', width: 14 }],
    r.rows.map((x) => [x.name, x.phone, x.opening, x.incurred, x.collected, x.closing, ymd(x.oldestOpenDate)]),
    ['Tổng', null, r.totals.opening, r.totals.incurred, r.totals.collected, r.totals.closing, null],
  )
  addLines(ws, [['0–7 ngày', r.totals.age0to7], ['8–30 ngày', r.totals.age8to30], ['Trên 30 ngày', r.totals.ageOver30]])
}

function financeSheet(ws: ExcelJS.Worksheet, report: FinanceReport) {
  switch (report.tab) {
    case 'revenue': return revenueSheet(ws, report)
    case 'cashflow': return cashFlowSheet(ws, report)
    case 'pnl': return profitLossSheet(ws, report)
    case 'debts': return receivablesSheet(ws, report)
  }
}

export function buildReportWorkbook(report: SalesReport | FinanceReport, meta: ReportWorkbookMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MEVO'
  wb.created = meta.exportedAt
  const label = tabLabel(report.tab)
  const ws = wb.addWorksheet(label)

  // ---- Đầu sheet ----
  ws.addRow([`BÁO CÁO ${label.toUpperCase()}`]).font = { bold: true, size: 14 }
  ws.addRow(['Quán', meta.storeName])
  // Doanh thu chế độ tháng: kỳ là 12 tháng thật của báo cáo (giống nhãn đầu trang), không phải kỳ đang chọn.
  ws.addRow(['Kỳ', periodLabel(shownPeriod(report, meta))])
  if (report.tab === 'revenue') ws.addRow(['Chế độ', report.grain === 'month' ? 'Tháng' : 'Ngày'])
  ws.addRow(['Xuất lúc', vnDateTimeLabel(meta.exportedAt)])
  ws.addRow(['Người xuất', meta.exportedBy])
  ws.addRow([])
  ws.getColumn(1).width = 22

  switch (report.tab) {
    case 'item': {
      const total = sum(report.rows.map((r) => r.amount))
      addTable(
        ws,
        [{ header: 'Món', width: 32 }, { header: 'Danh mục', width: 18 }, { header: 'SL bán', width: 9 }, { header: 'SL tặng', width: 9 },
          { header: 'Tiền', width: 14, fmt: MONEY }, { header: '%', width: 8, fmt: PERCENT }],
        report.rows.map((r) => [r.itemName, r.categoryName, r.qtySold, r.qtyGift, r.amount, percentOf(r.amount, report.summary.itemsAmount)]),
        ['Tổng', null, sum(report.rows.map((r) => r.qtySold)), sum(report.rows.map((r) => r.qtyGift)), total, total > 0 ? 100 : 0],
      )
      addLines(ws, salesLines(report.summary))
      break
    }
    case 'category': {
      // Một dòng mỗi danh mục, không lồng món (món xem ở báo cáo Theo món).
      const total = sum(report.rows.map((r) => r.amount))
      addTable(
        ws,
        [{ header: 'Danh mục', width: 24 }, { header: 'SL bán', width: 9 }, { header: 'SL tặng', width: 9 },
          { header: 'Tiền', width: 14, fmt: MONEY }, { header: '%', width: 8, fmt: PERCENT }],
        report.rows.map((r) => [r.categoryName, r.qtySold, r.qtyGift, r.amount, percentOf(r.amount, report.summary.itemsAmount)]),
        ['Tổng', sum(report.rows.map((r) => r.qtySold)), sum(report.rows.map((r) => r.qtyGift)), total, total > 0 ? 100 : 0],
      )
      addLines(ws, salesLines(report.summary))
      break
    }
    case 'hour': {
      // Giữ thứ tự server (theo ngày kinh doanh), không sắp lại theo đồng hồ.
      addTable(
        ws,
        [{ header: 'Giờ', width: 10 }, { header: 'Lượt gọi', width: 10 }, { header: 'SL món', width: 10 }, { header: 'Tiền', width: 14, fmt: MONEY }],
        report.rows.map((r) => [hourLabel(r.hour), r.ordersCount, r.itemsQty, r.amount]),
        ['Tổng', sum(report.rows.map((r) => r.ordersCount)), sum(report.rows.map((r) => r.itemsQty)), sum(report.rows.map((r) => r.amount))],
      )
      addLines(ws, salesLines(report.summary))
      break
    }
    case 'voids': {
      addTable(
        ws,
        [{ header: 'Giờ', width: 18 }, { header: 'Bàn', width: 14 }, { header: 'Món', width: 28 }, { header: 'SL', width: 7 },
          { header: 'Tiền', width: 14, fmt: MONEY }, { header: 'Loại', width: 10 }, { header: 'Lý do', width: 26 }, { header: 'Người làm', width: 22 }],
        report.rows.map((r) => [vnDateTimeLabel(new Date(r.at)), r.tableLabel, r.itemName, r.quantity, r.amount, VOID_TYPE_LABEL[r.type], r.reason, r.byName]),
        ['Tổng', null, null, sum(report.rows.map((r) => r.quantity)), sum(report.rows.map((r) => r.amount))],
      )
      addLines(ws, [['Tiền bỏ', report.totals.cancelledAmount], ['Tiền tặng', report.totals.giftAmount], ['Giảm SL', report.totals.reducedAmount]])
      break
    }
    default:
      financeSheet(ws, report)
  }
  return wb
}

/** `bao-cao-<tab>-<slug quán>-<from>_<to>.xlsx` — chỉ ký tự ASCII để header Content-Disposition không vỡ. */
export function reportWorkbookFileName(storeName: string, tab: ReportTab, from: string, to: string): string {
  return `bao-cao-${tab}-${suggestSlug(storeName) || 'quan'}-${from}_${to}.xlsx`
}
