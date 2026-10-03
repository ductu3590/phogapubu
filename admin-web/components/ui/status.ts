// Một bảng trạng thái duy nhất cho cả hệ (quyết định 2026-10-02, đổi màu theo Stitch ở Pha 4 — 2026-10-03).
// Badge, chấm màu, thanh timeline đều đọc từ đây — không màn nào tự chọn màu trạng thái.

export type StatusTone = 'success' | 'accent' | 'info' | 'warning' | 'critical' | 'neutral'

/**
 * Class Tailwind cho từng tông.
 * - badge / bar: nền nhạt + chữ đậm cùng sắc (nhãn nhỏ, thẻ).
 * - solid: tô đặc chữ trắng như bản Stitch P01 — thanh Timeline, ô bàn, nhãn trên dải tối.
 */
export const STATUS_TONE_CLASSES: Record<StatusTone, { badge: string; dot: string; bar: string; solid: string }> = {
  success: {
    badge: 'bg-success-bg text-success border-success-border',
    dot: 'bg-success-dot',
    bar: 'bg-success-bg border-success-border text-success',
    solid: 'bg-emerald-600 border-emerald-700 text-white',
  },
  info: {
    badge: 'bg-info-bg text-info border-info-border',
    dot: 'bg-info-dot',
    bar: 'bg-info-bg border-info-border text-info',
    solid: 'bg-blue-600 border-blue-700 text-white',
  },
  warning: {
    badge: 'bg-warning-bg text-warning border-warning-border',
    dot: 'bg-warning-dot',
    bar: 'bg-warning-bg border-warning-border text-warning',
    solid: 'bg-amber-500 border-amber-600 text-white',
  },
  critical: {
    badge: 'bg-critical-bg text-critical border-critical-border',
    dot: 'bg-critical-dot',
    bar: 'bg-critical-bg border-critical-border text-critical',
    solid: 'bg-red-600 border-red-700 text-white',
  },
  neutral: {
    badge: 'bg-neutral-bg text-neutral border-neutral-border',
    dot: 'bg-neutral-dot',
    bar: 'bg-neutral-bg border-neutral-border text-neutral',
    solid: 'bg-slate-200 border-slate-300 text-slate-700',
  },
  accent: {
    badge: 'bg-accent-bg text-accent border-accent-border',
    dot: 'bg-accent-dot',
    bar: 'bg-accent-bg border-accent-border text-accent',
    solid: 'bg-orange-500 border-orange-600 text-white',
  },
}

/**
 * Trạng thái bàn trên POS (Pha 4, theo bản Stitch P01 — THAY bảng 2026-10-02):
 *   xanh lá = đang phục vụ · CAM = đã đặt · vàng = chờ duyệt · đỏ = trễ / xung đột · xám = trống
 * Màu luôn đi kèm nhãn.
 */
export type TableVisualState = 'serving' | 'booked' | 'pending' | 'late' | 'free'

export const TABLE_STATE: Record<TableVisualState, { label: string; tone: StatusTone }> = {
  serving: { label: 'Đang phục vụ', tone: 'success' },
  booked: { label: 'Đã đặt', tone: 'accent' },
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  late: { label: 'Trễ / xung đột', tone: 'critical' },
  free: { label: 'Trống', tone: 'neutral' },
}

/** Thứ tự hiện trong chú giải màu (POS). */
export const TABLE_STATE_ORDER: TableVisualState[] = ['serving', 'booked', 'pending', 'late', 'free']

/**
 * Trạng thái ĐƠN (orders.status) — dùng chung Dashboard, Đơn hàng, màn nhân viên.
 * Chỉ "chờ" (việc cần làm) và "xong / huỷ" mới có màu; các bước giữa để trung tính.
 */
export const ORDER_STATUS_TONE: Record<string, StatusTone> = {
  pending: 'warning',
  confirmed: 'neutral',
  cooking: 'neutral',
  ready: 'success',
  paid: 'neutral',
  completed: 'neutral',
  cancelled: 'critical',
}

export function orderStatusTone(status: string): StatusTone {
  return ORDER_STATUS_TONE[status] ?? 'neutral'
}
