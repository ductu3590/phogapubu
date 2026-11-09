// Xuất Excel sổ thu chi (mig 122): 2 sheet Tổng · Phiếu. Thuần (không gọi mạng) để test được, mẫu lib/bills-report-xlsx.ts.
// Tiền là SỐ (định dạng #,##0). Sheet Tổng lấy NGUYÊN totals của server (cash_book_list tính trên toàn bộ phiếu khớp lọc,
// kể cả khi danh sách bị cắt 2000 dòng) — không cộng lại các dòng ở TS.
import ExcelJS from 'exceljs'
import { normalizeSearch, vnDateTimeLabel } from '@/lib/bills-report'
import { REPORT_GROUP_LABEL, type CashBookEntry, type CashBookSource, type CashBookTotals, type CashbookFilters } from '@/lib/cash-book'
import { shiftDateTimeLabel, shiftTimeLabel } from '@/lib/cash-shift'

const MONEY = '#,##0'

export type CashbookWorkbookMeta = { storeName: string; filters: CashbookFilters; exportedAt: Date; exportedBy: string }

const vnDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`
const SOURCE_LABEL: Record<CashBookSource, string> = {
  manual: 'Ghi tay', pos_drawer: 'Thu/Chi két', inventory_receipt: 'Phiếu nhập kho',
}

export function buildCashbookWorkbook(
  list: { entries: CashBookEntry[]; totals: CashBookTotals; truncated: boolean },
  meta: CashbookWorkbookMeta,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MEVO'
  wb.created = meta.exportedAt
  const f = meta.filters
  const t = list.totals

  // ---- Tổng ----
  const sum = wb.addWorksheet('Tổng')
  sum.columns = [{ width: 30 }, { width: 24 }]
  const line = (label: string, value: string | number, money = false) => {
    const row = sum.addRow([label, value])
    if (money) row.getCell(2).numFmt = MONEY
    return row
  }
  sum.addRow(['SỔ THU CHI']).font = { bold: true, size: 14 }
  line('Quán', meta.storeName)
  line('Từ ngày', vnDate(f.from))
  line('Đến ngày', vnDate(f.to))
  line('Loại', f.kind === 'receipt' ? 'Thu' : f.kind === 'payment' ? 'Chi' : 'Tất cả')
  line('Phương thức', f.method === 'cash' ? 'Tiền mặt' : f.method === 'bank' ? 'Chuyển khoản' : 'Tất cả')
  line('Danh mục', f.categoryId ? 'Theo danh mục đang lọc' : 'Tất cả')
  line('Xuất lúc', vnDateTimeLabel(meta.exportedAt))
  line('Người xuất', meta.exportedBy)
  sum.addRow([])
  line('Thu tiền mặt', t.receiptCash, true)
  line('Thu chuyển khoản', t.receiptBank, true)
  line('Tổng thu', t.receiptTotal, true).font = { bold: true }
  line('Chi tiền mặt', t.paymentCash, true)
  line('Chi chuyển khoản', t.paymentBank, true)
  line('Tổng chi', t.paymentTotal, true).font = { bold: true }
  line('Chênh lệch (thu − chi)', t.net, true).font = { bold: true }
  sum.addRow([])
  sum.addRow(['Tổng chỉ tính phiếu còn hiệu lực (bỏ phiếu đã huỷ). Ngày = ngày kinh doanh lúc ghi phiếu.']).font = { italic: true }
  if (list.truncated) {
    sum.addRow(['Sheet Phiếu chỉ có 2000 phiếu mới nhất; số tổng ở trên vẫn tính đủ mọi phiếu khớp bộ lọc.']).font = { italic: true }
  }

  // ---- Phiếu ----
  const ws = wb.addWorksheet('Phiếu', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Ngày KD', width: 11 }, { header: 'Giờ', width: 7 }, { header: 'Loại', width: 6 }, { header: 'Danh mục', width: 20 },
    { header: 'Nhóm báo cáo', width: 18 }, { header: 'Số tiền', width: 14, style: { numFmt: MONEY } },
    { header: 'Phương thức', width: 13 }, { header: 'Người nộp/nhận', width: 20 }, { header: 'Ghi chú', width: 30 },
    { header: 'Người ghi', width: 20 }, { header: 'Ca', width: 16 }, { header: 'Nguồn', width: 15 }, { header: 'Trạng thái', width: 28 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const e of list.entries) {
    ws.addRow([
      vnDate(e.businessDate),
      shiftTimeLabel(e.createdAt),
      e.kind === 'receipt' ? 'Thu' : 'Chi',
      e.categoryName,
      REPORT_GROUP_LABEL[e.reportGroup],
      e.amount,
      e.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản',
      e.counterparty ?? '',
      e.note ?? '',
      e.createdByName ?? '',
      e.shiftOpenedAt ? `từ ${shiftDateTimeLabel(e.shiftOpenedAt)}` : '',
      SOURCE_LABEL[e.source],
      e.voidedAt ? `Đã huỷ: ${e.voidReason ?? ''}` : 'Hiệu lực',
    ])
  }
  return wb
}

export function cashbookWorkbookFileName(storeName: string, from: string, to: string): string {
  const slug = normalizeSearch(storeName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `so-thu-chi_${slug}_${from}_${to}.xlsx` : `so-thu-chi_${from}_${to}.xlsx`
}
