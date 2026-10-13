// Xuất Excel báo cáo ngày (A04-3): 3 sheet Tổng hợp · Hoá đơn · Điều chỉnh. Thuần (không gọi mạng) để test được.
// Tiền là SỐ (định dạng #,##0) để chủ quán cộng/lọc tiếp trong Excel — không ghi thành chữ "1.281.000đ".
import ExcelJS from 'exceljs'
import { instrumentLabel } from '@/lib/daily-report'
import { buildBillRows, daySummary, normalizeSearch, startedLabel, vnDateTimeLabel, type BillRow, type BillsReport } from '@/lib/bills-report'

const MONEY = '#,##0'

export type BillsWorkbookMeta = { storeName: string; date: string; exportedAt: Date; exportedBy: string }

const vnDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`

function statusText(r: BillRow): string {
  if (r.kind === 'paid') return 'Đã thanh toán'
  if (r.kind === 'waiting') return r.expired ? 'Hết hạn · còn nợ' : 'Chờ thu'
  return r.rejected ? 'Từ chối' : 'Đã huỷ'
}

export function buildBillsWorkbook(report: BillsReport, meta: BillsWorkbookMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MEVO'
  wb.created = meta.exportedAt
  const s = daySummary(report)

  // ---- Tổng hợp ----
  const sum = wb.addWorksheet('Tổng hợp')
  sum.columns = [{ width: 34 }, { width: 22 }]
  const line = (label: string, value: string | number | null, money = false) => {
    const row = sum.addRow([label, value])
    if (money) row.getCell(2).numFmt = MONEY
    return row
  }
  sum.addRow(['BÁO CÁO NGÀY']).font = { bold: true, size: 14 }
  line('Quán', meta.storeName)
  line('Ngày', vnDate(meta.date))
  line('Xuất lúc', vnDateTimeLabel(meta.exportedAt))
  line('Người xuất', meta.exportedBy)
  sum.addRow([])
  line('Tổng thực thu', report.totals.revenue, true).font = { bold: true }
  line('Tiền mặt', report.totals.cash, true)
  line('Chuyển khoản', report.totals.bank, true)
  line('Ví / khác', report.totals.other, true)
  line('Số hoá đơn đã thu', report.totals.billsCount)
  sum.addRow([])
  line('Chờ thu (bàn / đơn)', s.waitingCount)
  line('Tạm tính chưa thu', s.waitingTotal, true)
  line('Đơn huỷ / từ chối', s.cancelledCount)
  line('Giá trị đơn huỷ', s.cancelledTotal, true)
  line('Món tặng (lần)', s.giftCount)
  line('Giá trị tặng', s.giftTotal, true)
  line('Món bỏ (lần)', s.voidCount)
  line('Giá trị bỏ', s.voidTotal, true)
  line('Sửa số lượng (lần)', s.quantityChangeCount)
  sum.addRow([])
  // Option A (2026-07-08): hệ thống không thấy giao dịch ngân hàng → không được ghi "đã khớp".
  sum.addRow(['Chuyển khoản: đối chiếu app ngân hàng — hệ thống không xác minh tiền đã về tài khoản.']).font = { italic: true }

  // ---- Hoá đơn ----
  const bills = wb.addWorksheet('Hoá đơn', { views: [{ state: 'frozen', ySplit: 1 }] })
  bills.columns = [
    { header: 'Mã', width: 11 }, { header: 'Trạng thái', width: 17 }, { header: 'Bàn', width: 18 },
    { header: 'Khách', width: 20 }, { header: 'Số khách', width: 9 }, { header: 'Vào', width: 12 },
    { header: 'Thu / huỷ lúc', width: 13 }, { header: 'Số món', width: 8 }, { header: 'Phương thức', width: 16 },
    { header: 'Giảm giá', width: 11, style: { numFmt: MONEY } }, { header: 'Số tiền', width: 13, style: { numFmt: MONEY } },
    { header: 'Người thu', width: 22 }, { header: 'Ghi chú', width: 28 },
  ]
  bills.getRow(1).font = { bold: true }
  for (const r of buildBillRows(report)) {
    bills.addRow([
      r.code, statusText(r), r.tableLabel, r.customerName ?? '', r.partySize ?? null,
      startedLabel(r.startedAt, meta.date), r.kind === 'waiting' ? '' : startedLabel(r.at, meta.date), r.itemsCount,
      r.kind === 'paid' && r.instrument ? instrumentLabel(r.instrument) : r.kind === 'waiting' ? 'Tạm tính' : '',
      r.discountTotal > 0 ? r.discountTotal : null, r.amount, r.receivedByName ?? '',
      r.kind === 'cancelled' ? (r.reasonText ?? '') : r.adjustmentsCount > 0 ? `${r.adjustmentsCount} điều chỉnh` : '',
    ])
  }

  // ---- Điều chỉnh ----
  const adj = wb.addWorksheet('Điều chỉnh', { views: [{ state: 'frozen', ySplit: 1 }] })
  adj.columns = [
    { header: 'Giờ', width: 9 }, { header: 'Loại', width: 15 }, { header: 'Bàn', width: 16 }, { header: 'Món', width: 28 },
    { header: 'Số lượng', width: 10 }, { header: 'Số tiền', width: 13, style: { numFmt: MONEY } },
    { header: 'Lý do', width: 30 }, { header: 'Người làm', width: 22 },
  ]
  adj.getRow(1).font = { bold: true }
  for (const a of report.adjustments) {
    adj.addRow([
      startedLabel(a.at, meta.date),
      a.type === 'gift' ? 'Tặng' : a.type === 'quantity' ? 'Sửa số lượng' : 'Bỏ',
      a.tableLabel, a.itemName,
      a.type === 'quantity' ? `${a.oldQuantity} → ${a.newQuantity}` : a.quantity,
      a.amount, a.reason ?? '', a.byName ?? '',
    ])
  }
  return wb
}

export function billsWorkbookFileName(storeName: string, date: string): string {
  const slug = normalizeSearch(storeName).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug ? `bao-cao-${slug}-${date}.xlsx` : `bao-cao-${date}.xlsx`
}
