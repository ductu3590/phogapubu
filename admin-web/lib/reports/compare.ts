// So sánh với kỳ trước cho trang /admin/reports. Hàm thuần: ngày là NGÀY KINH DOANH YYYY-MM-DD, tính bằng UTC
// như period.ts (dùng lại addDays/daysBetween của file đó). Không tự nghĩ công thức tiền — chỉ tính % giữa hai số
// mà RPC đã trả.
import type { ReportData } from '@/lib/actions/reports'
import { addDays, daysBetween, type ReportPreset } from '@/lib/reports/period'

/** Kỳ liền trước, cùng độ dài; riêng theo tháng thì bám tháng lịch (xem từng nhánh). */
export function previousRange(preset: ReportPreset, from: string, to: string): { from: string; to: string } {
  if (preset === 'this_month' || preset === 'last_month') {
    // Ngày cuối tháng trước = ngày 1 của tháng đang xem lùi 1 ngày.
    const prevLast = addDays(`${from.slice(0, 7)}-01`, -1)
    const prevFirst = `${prevLast.slice(0, 7)}-01`
    if (preset === 'last_month') return { from: prevFirst, to: prevLast }
    // Tháng này mới đi n ngày: lấy n ngày đầu tháng trước, cắt ở cuối tháng đó (tháng ngắn hơn).
    const n = daysBetween(from, to) + 1
    const end = addDays(prevFirst, n - 1)
    return { from: prevFirst, to: end > prevLast ? prevLast : end }
  }
  const n = daysBetween(from, to) + 1
  return { from: addDays(from, -n), to: addDays(from, -1) }
}

/** % thay đổi, làm tròn 1 chữ số. Kỳ trước ≤ 0 hoặc thiếu thì null (không có mốc để so → UI ẩn chip, khỏi ra Infinity/NaN). */
export function deltaPercent(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || !Number.isFinite(prev) || prev <= 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

export function compareLabel(preset: ReportPreset): string {
  switch (preset) {
    case 'today':
      return 'so với hôm qua'
    case 'yesterday':
      return 'so với hôm kia'
    case '7d':
      return 'so với 7 ngày trước'
    case 'this_month':
    case 'last_month':
      return 'so với tháng trước'
    default:
      return 'so với kỳ trước'
  }
}

/** Kỳ trước (null nếu tải lỗi → UI chỉ ẩn delta) + nhãn "so với …". */
export type Compare = { prev: ReportData | null; label: string }

/** Lấy báo cáo kỳ trước đúng tab; sai tab hoặc thiếu thì null. */
export function prevOf<T extends ReportData['tab']>(c: Compare | undefined, tab: T): Extract<ReportData, { tab: T }> | null {
  if (!c?.prev || c.prev.tab !== tab) return null
  return c.prev as Extract<ReportData, { tab: T }>
}
