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
 * - Phần dư (do làm tròn xuống) cộng hết vào phần có `amount` lớn nhất; hoà thì lấy `id` nhỏ nhất
 *   theo so sánh chuỗi — kết quả không phụ thuộc thứ tự mảng đầu vào. Tổng kết quả luôn === total.
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
  out[winner.id] += total - allocated
  return out
}
