// Trạng thái một ô bàn trên sơ đồ POS (/admin/pos) và trên màn chọn bàn của nhân viên
// (/staff/order). Hai màn PHẢI đọc cùng một hàm, nếu mỗi màn tự suy thì thu ngân và nhân viên
// nhìn hai màu khác nhau về cùng một cái bàn.
//
// Quy ước màu (chốt 2026-10-02, THAY quy ước đỏ-có-khách / xanh-trống của 2026-09-04):
//   serving (xanh lá)   = đang có khách, đã gọi món, tiền chưa thu xong.
//   pending (vàng)      = có đơn thu ngân chưa bấm Xác nhận — việc phải làm NGAY, thắng mọi trạng thái khác.
//   late    (đỏ)        = phiên quá hạn (tự đóng sau thời gian chờ) mà còn tiền chưa thu.
//   booked  (xanh dương)= bàn trống nhưng đã giữ cho khách đặt trước sắp đến.
//   free    (xám)       = bàn trống, HOẶC mâm đã ghép nhưng chưa ai gọi món.
// Bảng nhãn + màu nằm ở components/ui/status.ts (TABLE_STATE). Màu luôn đi kèm chữ.
// Cố tình KHÔNG dùng màu để báo "món chưa nấu xong": Bảo Lương không có màn hình bếp nên
// không ai cập nhật trạng thái đó — màu sẽ đứng im và nói dối.

import type { TableVisualState } from '@/components/ui/status'

export type TableDot = 'free' | 'busy'

/** Chỉ đúng 2 field mà hai hàm dưới thật sự đọc → OpenTableSession truyền thẳng vào được. */
export type SessionStatusLike = {
  status: string
  orders: { status: string; order_source?: string }[]
}

export function tableDot(session: SessionStatusLike | undefined): TableDot {
  if (!session || session.status !== 'open') return 'free'
  return session.orders.length > 0 ? 'busy' : 'free'
}

/**
 * Số đơn thu ngân chưa bấm Xác nhận. Đây là thứ làm ô bàn nhấp nháy và gọi chuông.
 * 'pending' = chưa xác nhận; pos_confirm_order đẩy sang 'confirmed' (mig 045).
 */
export function pendingCount(session: SessionStatusLike | undefined): number {
  if (!session || session.status !== 'open') return 0
  // Món ghi tay ở POS ('pos') là thu ngân tự thêm = đã duyệt sẵn; món đặt trước có luồng duyệt riêng.
  // Đếm chúng thì bàn hiện "Chờ duyệt" mà không có nút duyệt nào (anh Tú báo 2026-10-03).
  return session.orders.filter((o) => o.status === 'pending' && o.order_source !== 'pos' && o.order_source !== 'reservation_preorder').length
}

/**
 * Trạng thái hiển thị của một ô bàn — MỘT nguồn cho màu + nhãn ở mọi màn.
 * `needs_review` là cờ server (phiên đã quá hạn, còn tiền chưa thu); `prearrivalReserved` là bàn
 * đang được giữ cho booking trong khung trước giờ đến.
 */
export function tableVisualState(
  session: (SessionStatusLike & { needs_review?: boolean }) | undefined,
  options: { prearrivalReserved?: boolean } = {},
): TableVisualState {
  if (session?.needs_review) return 'late'
  if (pendingCount(session) > 0) return 'pending'
  if (tableDot(session) === 'busy') return 'serving'
  if (options.prearrivalReserved) return 'booked'
  return 'free'
}
