// Chữ hiển thị trên màn nhân viên (/staff) — thuần, không gọi mạng, để test được.

/**
 * Mã đơn ngắn: 6 ký tự cuối ID, viết hoa. Cùng kiểu mã với Hoá đơn A04 (`billCode`) và danh sách
 * "Đang xử lý", để màn gửi đơn và danh sách không ghi hai mã khác nhau cho cùng một đơn.
 */
export function shortOrderCode(orderId: string): string {
  return `#${orderId.replace(/-/g, '').slice(-6).toUpperCase()}`
}

/**
 * Tiêu đề màn "gửi đơn xong". Quán bắt thu ngân duyệt đơn nhân viên (staff_order_release_policy =
 * 'pos_confirmation', vd Yên Garden) thì đơn CHƯA vào bếp — nói "vào bếp" làm nhân viên tưởng bếp đã nhận.
 */
export function staffSubmitTitle(needsPosConfirmation: boolean): string {
  return needsPosConfirmation ? 'Đã gửi, chờ thu ngân duyệt' : 'Đã gửi vào bếp'
}

/**
 * Nhãn trạng thái một đơn trên màn nhân viên. Đơn `order_source = 'pos'` (thu ngân ghi tay vào bill)
 * nằm `pending` mãi (CLAUDE.md §6) nhưng là món đã phục vụ — không phải "Chờ xử lý".
 */
export function staffOrderStatusLabel(
  status: string,
  orderSource: string | null | undefined,
  labels: Record<string, string>,
): string {
  if (orderSource === 'pos' && status === 'pending') return 'Thu ngân ghi'
  return labels[status] ?? status
}

/** Đơn thu ngân ghi tay không phải việc cần làm → không tô màu "chờ". */
export function isPosManualPending(status: string, orderSource: string | null | undefined): boolean {
  return orderSource === 'pos' && status === 'pending'
}
