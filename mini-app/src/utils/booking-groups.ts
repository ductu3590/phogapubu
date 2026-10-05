// Tab "Đặt bàn" gộp (2026-10-05): lịch hẹn ĐANG có (chờ quán xác nhận / đã xác nhận) hiện ở đầu
// để khách không đặt trùng hay tưởng lần trước chưa đặt được; các lượt đã xong (đã đến, huỷ,
// không đến, hoàn tất, quán từ chối) vào "Lịch sử đặt bàn". Trạng thái do server đổi, app chỉ đọc.
const ACTIVE = new Set(["pending", "confirmed"]);

export function splitBookings<T extends { reservationId: string; status: string; arrivalAt: string }>(
  bookings: T[],
): { active: T[]; history: T[] } {
  const active = bookings.filter((x) => ACTIVE.has(x.status)).sort((a, b) => a.arrivalAt.localeCompare(b.arrivalAt));
  const history = bookings.filter((x) => !ACTIVE.has(x.status)).sort((a, b) => b.arrivalAt.localeCompare(a.arrivalAt));
  return { active, history };
}
