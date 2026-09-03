// Trạng thái một ô bàn trên sơ đồ POS (/admin/cashier) và trên màn chọn bàn của nhân viên
// (/staff/order). Hai màn PHẢI đọc cùng một hàm, nếu mỗi màn tự suy thì thu ngân và nhân viên
// nhìn hai màu khác nhau về cùng một cái bàn.
//
// Quy ước màu (chốt với anh Tú 2026-09-04):
//   🟢 free = bàn trống, HOẶC mâm đã ghép nhưng chưa ai gọi món.
//   🔴 busy = đang có khách ngồi ăn, tiền chưa thu xong.
// Cố tình KHÔNG dùng màu để báo "món chưa nấu xong": Bảo Lương không có màn hình bếp nên
// không ai cập nhật trạng thái đó — màu sẽ đứng im và nói dối.

export type TableDot = 'free' | 'busy'

/** Chỉ đúng 2 field mà hai hàm dưới thật sự đọc → OpenTableSession truyền thẳng vào được. */
export type SessionStatusLike = {
  status: string
  orders: { status: string }[]
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
  return session.orders.filter((o) => o.status === 'pending').length
}
