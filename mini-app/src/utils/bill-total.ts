/**
 * Tổng bill trả sau sau khi thu ngân giảm giá (mig 108: bill_discount tính trên tiền hàng CHƯA thu).
 * Trả sau thì chưa đơn nào được thu trước khi đóng bàn nên tạm tính của phiên = tiền hàng chưa thu.
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
