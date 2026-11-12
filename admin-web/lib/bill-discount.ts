// Giảm giá cả bill (VNĐ hoặc %) — phần POS cần để HIỂN THỊ và chặn nhập sai. Server (mig 107/108) mới là nơi
// chia giảm giá vào từng đơn lúc thu tiền; discountAmount ở đây phải khớp bill_discount_amount của SQL.

export type BillDiscount = { type: 'amount' | 'percent'; value: number } | null

/**
 * Số tiền giảm. amount → đúng `value`; percent → làm tròn `subtotal * value / 100` (Math.round).
 * KHÔNG cắt bớt khi vượt tiền hàng: trường hợp đó do validateDiscount chặn trước khi lưu.
 */
export function discountAmount(subtotal: number, d: BillDiscount): number {
  if (!d) return 0
  if (d.type === 'amount') return d.value
  return Math.round((subtotal * d.value) / 100)
}

/** Lỗi tiếng Việt hiện cho thu ngân, hoặc null nếu giảm giá hợp lệ với tiền hàng hiện tại. */
export function validateDiscount(subtotal: number, d: BillDiscount): string | null {
  if (!d) return null
  // Number.isInteger đã loại NaN / Infinity / số lẻ
  if (!Number.isInteger(d.value) || d.value < 0) return 'Giảm giá phải là số nguyên không âm'
  if (d.type === 'percent' && d.value > 100) return 'Phần trăm phải từ 0 đến 100'
  if (d.type === 'amount' && d.value > subtotal) {
    return 'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá'
  }
  return null
}

/** Phần cột giảm giá của một phiên bàn (list_open_table_sessions, mig 108). */
export type SessionDiscountColumns = {
  bill_discount_type?: 'amount' | 'percent' | null
  bill_discount_value?: number | null
}

/** Phiên + tiền hàng CHƯA thu của nó (OpenTableSession.unpaid_total) — nền tính giảm giá của server. */
export type DiscountedSession = SessionDiscountColumns & { unpaid_total: number }

/** Cột của phiên → BillDiscount; chưa giảm giá (type hoặc value thiếu) → null. */
export function sessionDiscountOf(s: SessionDiscountColumns): BillDiscount {
  if (!s.bill_discount_type || s.bill_discount_value == null) return null
  return { type: s.bill_discount_type, value: s.bill_discount_value }
}

/**
 * Tổng tiền giảm của các phiên (gộp bill): mỗi phiên một `discountAmount` trên tiền hàng chưa thu của
 * CHÍNH nó — đúng cách server lưu/trừ (mỗi mâm giữ phần riêng, % làm tròn từng mâm rồi mới cộng).
 */
export function combinedDiscount(sessions: DiscountedSession[]): number {
  return sessions.reduce((n, s) => n + discountAmount(s.unpaid_total, sessionDiscountOf(s)), 0)
}

/**
 * Các con số của một bill (1 phiên hoặc gộp N mâm) khớp với những gì server thu/ghi:
 * - goods: tiền hàng CHƯA thu (Σ unpaid_total) — nền của giảm giá và của số tiền thu;
 * - paid: phần các đơn đã nhận tiền trước (Σ total − Σ unpaid_total), hiện riêng để phép tính nhìn thấy được;
 * - discount: tổng giảm giá; payable: Khách cần trả = goods − discount.
 * Giảm giá đang lỗi → `error` có chữ, discount = 0 và payable = goods (số TRƯỚC giảm, không kẹp về 0đ).
 */
export function billTotals(sessions: (DiscountedSession & { total: number })[]): {
  goods: number
  paid: number
  discount: number
  payable: number
  error: string | null
} {
  const goods = sessions.reduce((n, s) => n + s.unpaid_total, 0)
  const paid = sessions.reduce((n, s) => n + s.total, 0) - goods
  const error = firstDiscountError(sessions)
  const discount = error ? 0 : combinedDiscount(sessions)
  return { goods, paid, discount, payable: goods - discount, error }
}

/** Lỗi giảm giá đầu tiên trong các phiên (vd. giảm VNĐ lớn hơn tiền hàng sau khi bỏ món), hoặc null. */
export function firstDiscountError(sessions: DiscountedSession[]): string | null {
  for (const s of sessions) {
    const err = validateDiscount(s.unpaid_total, sessionDiscountOf(s))
    if (err) return err
  }
  return null
}
