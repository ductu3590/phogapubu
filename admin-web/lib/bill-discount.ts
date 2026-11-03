// Giảm giá cả bill (VNĐ hoặc %) — NGUỒN SỰ THẬT của phép tính. SQL ở mig 107/108 phải khớp từng bước
// với file này; POS chỉ hiển thị con số lấy từ đây / từ server, không tự nghĩ ra công thức khác.

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

/**
 * Chia `total` tiền giảm cho các phần (mâm) theo tỉ lệ `amount` của từng phần.
 * - Mỗi phần: Math.floor(total * amount / tổng amount).
 * - Phần dư (do làm tròn xuống) chia lần lượt theo thứ tự `amount` giảm dần, hoà thì `id` nhỏ nhất
 *   theo so sánh chuỗi: mỗi phần nhận thêm min(dư còn lại, amount − phần đã chia) — không phần nào
 *   bị giảm quá tiền hàng của nó (3 × 1.000đ giảm 2.999 → 1.000 / 1.000 / 999, không phải 999/999/1.001).
 *   Khi phần lớn nhất còn chỗ, kết quả y như "dồn hết dư vào phần lớn nhất". Kết quả không phụ thuộc
 *   thứ tự mảng đầu vào. Tổng kết quả luôn === total.
 * - total > tổng amount (không đủ chỗ chứa, chỉ xảy ra khi bỏ qua validateDiscount) → phần còn dư sau
 *   khi đã lấp đầy dồn vào phần lớn nhất.
 * - total = 0 → mọi phần 0.
 * - Mọi phần đều amount 0 mà total > 0 (tổng tỉ lệ = 0, không chia được) → dồn hết vào `id` nhỏ nhất,
 *   để vẫn giữ đúng tổng thay vì làm rơi tiền giảm.
 * - Không có phần nào → {} (không có chỗ để chia).
 * Dùng số thường: total * amount với bill thực tế (< vài chục triệu) còn xa giới hạn 2^53.
 */
export function allocateDiscount(
  total: number,
  parts: { id: string; amount: number }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  if (parts.length === 0) return out
  for (const p of parts) out[p.id] = 0
  if (total === 0) return out

  // Phần nhận số dư: amount lớn nhất, hoà thì id nhỏ nhất
  let winner = parts[0]
  for (const p of parts) {
    if (p.amount > winner.amount || (p.amount === winner.amount && p.id < winner.id)) winner = p
  }

  const sumAmount = parts.reduce((s, p) => s + p.amount, 0)
  if (sumAmount === 0) {
    out[winner.id] = total
    return out
  }

  let allocated = 0
  for (const p of parts) {
    const share = Math.floor((total * p.amount) / sumAmount)
    out[p.id] = share
    allocated += share
  }

  // Phần dư: đi lần lượt từ phần lớn nhất (hoà → id nhỏ nhất), mỗi phần chỉ nhận tới khi đầy
  // (không vượt amount của chính nó) — không phần nào bị giảm quá tiền hàng của nó.
  let rem = total - allocated
  const order = [...parts].sort(
    (a, b) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  for (const p of order) {
    if (rem === 0) break
    const add = Math.min(rem, Math.max(0, p.amount - out[p.id]))
    out[p.id] += add
    rem -= add
  }
  // Chỉ còn dư khi total > tổng amount (không có chỗ chứa) → dồn vào phần lớn nhất để giữ đúng tổng.
  out[winner.id] += rem
  return out
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

/** Lỗi giảm giá đầu tiên trong các phiên (vd. giảm VNĐ lớn hơn tiền hàng sau khi bỏ món), hoặc null. */
export function firstDiscountError(sessions: DiscountedSession[]): string | null {
  for (const s of sessions) {
    const err = validateDiscount(s.unpaid_total, sessionDiscountOf(s))
    if (err) return err
  }
  return null
}
