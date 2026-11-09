// Xuất Excel danh sách công nợ (mig 123): một sheet "Công nợ". Thuần (không gọi mạng) để test được, mẫu
// lib/cashbook-xlsx.ts / lib/bills-report-xlsx.ts. Tiền là SỐ (định dạng #,##0). Số nợ lấy nguyên từ debt_list (server
// đã bỏ lần trả đã huỷ); dòng Tổng chỉ cộng các dòng đang xuất.
import ExcelJS from 'exceljs'
import { normalizeSearch, vnDateTimeLabel } from '@/lib/bills-report'
import { debtDateLabel, debtKindLabel, vnYmd, type DebtCustomerSummary } from '@/lib/debts'

const MONEY = '#,##0'

export type DebtsWorkbookMeta = { storeName: string; exportedAt: Date; exportedBy: string }

export function buildDebtsWorkbook(customers: DebtCustomerSummary[], meta: DebtsWorkbookMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MEVO'
  wb.created = meta.exportedAt

  const ws = wb.addWorksheet('Công nợ')
  ws.columns = [
    { width: 30 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 36 },
  ]
  ws.addRow(['CÔNG NỢ KHÁCH HÀNG']).font = { bold: true, size: 14 }
  ws.addRow(['Quán', meta.storeName])
  ws.addRow(['Xuất lúc', vnDateTimeLabel(meta.exportedAt)])
  ws.addRow(['Người xuất', meta.exportedBy])
  ws.addRow([])

  ws.addRow(['Tên', 'SĐT', 'Loại', 'Tổng nợ', 'Số bill nợ', 'Bill nợ cũ nhất', 'Ghi chú']).font = { bold: true }
  let total = 0
  let bills = 0
  for (const c of customers) {
    const row = ws.addRow([
      c.isActive ? c.name : `${c.name} (đã ngừng)`,
      c.phone ?? '',
      debtKindLabel(c.kind),
      c.outstanding,
      c.openBills,
      debtDateLabel(vnYmd(c.oldestOpenAt)),
      c.note ?? '',
    ])
    row.getCell(4).numFmt = MONEY
    total += c.outstanding
    bills += c.openBills
  }
  const sum = ws.addRow(['Tổng', '', '', total, bills, '', ''])
  sum.font = { bold: true }
  sum.getCell(4).numFmt = MONEY
  return wb
}

export function debtsWorkbookFileName(storeName: string, date: string): string {
  const slug = normalizeSearch(storeName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `cong-no-${slug}-${date}.xlsx` : `cong-no-${date}.xlsx`
}
