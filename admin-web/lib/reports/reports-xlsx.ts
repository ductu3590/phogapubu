// Xuất Excel trang Báo cáo (Part 1: 4 tab bán hàng). Thuần (không gọi mạng) để test được.
// Một workbook = một sheet, đặt tên theo nhãn tab; bảng đúng cột của view trên trang.
// Tiền là SỐ (#,##0), % là SỐ (0.0) để chủ quán cộng / lọc tiếp trong Excel — không ghi chữ "300.000đ".
import ExcelJS from 'exceljs'
import { vnDateTimeLabel } from '@/lib/bills-report'
import { suggestSlug } from '@/lib/slugify'
import { periodLabel } from './period'
import { REPORT_TABS, type ReportTab } from './tabs'
import { VOID_TYPE_LABEL, hourLabel, percentOf, type SalesReport, type SalesSummary } from './sales'

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

export function buildReportWorkbook(report: SalesReport, meta: ReportWorkbookMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MEVO'
  wb.created = meta.exportedAt
  const label = tabLabel(report.tab)
  const ws = wb.addWorksheet(label)

  // ---- Đầu sheet ----
  ws.addRow([`BÁO CÁO ${label.toUpperCase()}`]).font = { bold: true, size: 14 }
  ws.addRow(['Quán', meta.storeName])
  ws.addRow(['Kỳ', periodLabel({ from: meta.from, to: meta.to })])
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
  }
  return wb
}

/** `bao-cao-<tab>-<slug quán>-<from>_<to>.xlsx` — chỉ ký tự ASCII để header Content-Disposition không vỡ. */
export function reportWorkbookFileName(storeName: string, tab: ReportTab, from: string, to: string): string {
  return `bao-cao-${tab}-${suggestSlug(storeName) || 'quan'}-${from}_${to}.xlsx`
}
