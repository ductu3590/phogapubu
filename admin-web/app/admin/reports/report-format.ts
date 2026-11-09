// Định dạng dùng chung cho các view báo cáo (thuần, chạy được cả server lẫn client).
import type { ReportTab } from '@/lib/reports/tabs'

/** 28.6 → '28,6%' (luôn một chữ số thập phân, dấu phẩy kiểu Việt). */
export function formatPercent(value: number): string {
  return `${value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export const formatQty = (n: number): string => n.toLocaleString('vi-VN')

/** Giờ VN 'HH:mm', kèm 'dd/MM' phía trước khi `withDate`. */
export function formatClock(iso: string, withDate = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false })
  if (!withDate) return time
  const date = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
  return `${date} ${time}`
}

export { hourLabel } from '@/lib/reports/sales'

export const EMPTY_TEXT = 'Chưa có dữ liệu trong kỳ này'

/** Dòng phạm vi dưới tiêu đề: 3 tab bán hàng chỉ tính bill đã thu; Món huỷ lọc theo giờ thao tác, gồm cả bàn chưa thu. */
export function reportScopeNote(tab: ReportTab): string {
  switch (tab) {
    case 'voids':
      return 'theo ngày kinh doanh, theo giờ thao tác (gồm cả bàn chưa thu)'
    case 'cashflow':
      return 'theo ngày kinh doanh, tiền thật vào và ra két, tài khoản'
    case 'pnl':
      return 'theo ngày kinh doanh, doanh thu đã thu trừ giá vốn và chi phí'
    case 'debts':
      return 'nợ của khách theo ngày kinh doanh: đầu kỳ, phát sinh, đã thu, cuối kỳ'
    default:
      return 'theo ngày kinh doanh, chỉ tính bill đã thu tiền'
  }
}

/** Ngày 'YYYY-MM-DD' → 'dd/MM/yyyy'. */
export const formatYmd = (ymd: string | null): string =>
  ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '—'

/** Ghi chú chung cho Thu chi / Lãi lỗ: phiếu đọc theo trạng thái HIỆN TẠI. */
export const VOID_LATER_NOTE = 'Phiếu huỷ sau này không còn tính vào kỳ đã qua.'
