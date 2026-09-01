// Hàm thuần cho biến thể món — tách khỏi server action để test được.

export type ParseResult =
  | { ok: true; name: string; price: number }
  | { ok: false; error: string }

// Ngưỡng an toàn: không món ăn nào ở quán vượt 100 triệu đồng.
// Chặn số quá lớn để tránh gõ nhầm thừa số 0 hoặc input rác.
const MAX_PRICE = 100_000_000

// Sau khi bỏ dấu ngăn nghìn, phần còn lại phải là chuỗi số nguyên thuần tuý.
const DIGITS_ONLY_PATTERN = /^\d+$/

// Giá gõ tay từ tờ menu giấy → phải chặn cả chữ lẫn số âm.
export function parseVariantInput(rawName: string, rawPrice: string): ParseResult {
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Nhập tên lựa chọn' }

  const trimmedPrice = rawPrice.trim()
  // Bắt dấu trừ TRƯỚC khi bỏ dấu ngăn nghìn, để "-1" báo đúng lỗi "giá âm" thay vì
  // lẫn vào nhánh "không phải số" ở dưới.
  const isNegative = trimmedPrice.startsWith('-')
  const body = isNegative ? trimmedPrice.slice(1) : trimmedPrice

  // Người Việt chép giá từ tờ menu giấy in "80.000đ" luôn gõ kèm dấu ngăn nghìn —
  // đây là cách gõ MẶC ĐỊNH, không phải ca hiếm. Dấu chấm, dấu phẩy, khoảng trắng
  // bên trong chuỗi số ở Việt Nam chỉ có một nghĩa: ngăn nghìn. Bỏ hết trước khi
  // validate, không thì Number('80.000') hiểu nhầm thành số thập phân 80, mất 1000
  // lần mỗi lần gõ.
  // Đánh đổi có chủ đích: "80000.5" cũng bị hiểu thành 800005 chứ không phải làm
  // tròn 80000.5 → 80001. Chấp nhận được vì VNĐ không có phần lẻ, không ai gõ giá
  // món ăn kiểu thập phân vào ô này — đừng tưởng đây là lỗi.
  const digitsOnly = body.replace(/[.,\s]/g, '')

  if (!DIGITS_ONLY_PATTERN.test(digitsOnly)) {
    return { ok: false, error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000' }
  }
  if (isNegative) return { ok: false, error: 'Giá phải là số ≥ 0' }

  const price = Number(digitsOnly)
  if (!Number.isFinite(price) || price > MAX_PRICE) {
    return { ok: false, error: 'Giá phải là số ≥ 0' }
  }
  return { ok: true, name, price }
}

export function displayPriceLabel(price: number, hasVariants: boolean): string {
  const formatted = `${price.toLocaleString('vi-VN')}đ`
  return hasVariants ? `Từ ${formatted}` : formatted
}
