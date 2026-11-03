/**
 * Tổng bill trả sau sau khi thu ngân giảm giá (mig 108: bill_discount tính trên tiền hàng CHƯA thu).
 * Bàn trả sau thu CẢ BÀN một lần ở POS: từ mig 110 server chặn thu lẻ từng lượt của phiên đang mở
 * (confirm_manual_payment / kitchen_confirm_payment báo lỗi), nên với bill đang mở bill.total = tiền hàng
 * chưa thu = đúng nền server dùng để tính bill_discount. (Trước mig 110 có vài đơn cũ bị thu lẻ, đều ở phiên đã đóng.)
 * bill_discount thiếu (server/bản cache cũ) hoặc rác → 0. Kẹp để không bao giờ ra số âm.
 */
export function billTotals(
  subtotal: number,
  billDiscount: number | undefined,
): { subtotal: number; discount: number; payable: number } {
  const raw = typeof billDiscount === "number" && Number.isFinite(billDiscount) ? billDiscount : 0;
  const discount = Math.min(Math.max(raw, 0), Math.max(subtotal, 0));
  return { subtotal, discount, payable: subtotal - discount };
}
