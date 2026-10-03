// Một bảng trạng thái duy nhất cho cả hệ (quyết định 2026-10-02).
// Badge, chấm màu, thanh timeline đều đọc từ đây — không màn nào tự chọn màu trạng thái.

export type StatusTone = 'success' | 'info' | 'warning' | 'critical' | 'neutral'

/** Class Tailwind cho từng tông. Nền nhạt + chữ đậm cùng sắc, chấm dùng sắc tươi hơn. */
export const STATUS_TONE_CLASSES: Record<StatusTone, { badge: string; dot: string; bar: string }> = {
  success: {
    badge: 'bg-success-bg text-success border-success-border',
    dot: 'bg-success-dot',
    bar: 'bg-success-bg border-success-border text-success',
  },
  info: {
    badge: 'bg-info-bg text-info border-info-border',
    dot: 'bg-info-dot',
    bar: 'bg-info-bg border-info-border text-info',
  },
  warning: {
    badge: 'bg-warning-bg text-warning border-warning-border',
    dot: 'bg-warning-dot',
    bar: 'bg-warning-bg border-warning-border text-warning',
  },
  critical: {
    badge: 'bg-critical-bg text-critical border-critical-border',
    dot: 'bg-critical-dot',
    bar: 'bg-critical-bg border-critical-border text-critical',
  },
  neutral: {
    badge: 'bg-neutral-bg text-neutral border-neutral-border',
    dot: 'bg-neutral-dot',
    bar: 'bg-neutral-bg border-neutral-border text-neutral',
  },
}

/**
 * Trạng thái bàn trên POS. Nghĩa đã chốt:
 *   xanh lá = đang phục vụ · xanh dương = đã đặt · vàng = chờ duyệt · đỏ = trễ / xung đột · xám = trống
 * Không có tông cam: cam chỉ dành cho nút. Màu luôn đi kèm nhãn.
 */
export type TableVisualState = 'serving' | 'booked' | 'pending' | 'late' | 'free'

export const TABLE_STATE: Record<TableVisualState, { label: string; tone: StatusTone }> = {
  serving: { label: 'Đang phục vụ', tone: 'success' },
  booked: { label: 'Đã đặt', tone: 'info' },
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
