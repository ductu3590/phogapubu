// Hàm thuần cho biến thể món — tách khỏi server action để test được.

import { parseVnd } from '@/lib/money'

export type ParseResult =
  | { ok: true; name: string; price: number }
  | { ok: false; error: string }

// Ngưỡng an toàn: không món ăn nào ở quán vượt 100 triệu đồng.
// Chặn số quá lớn để tránh gõ nhầm thừa số 0 hoặc input rác.
const MAX_PRICE = 100_000_000

// Giá gõ tay từ tờ menu giấy → phải chặn cả chữ lẫn số âm.
export function parseVariantInput(rawName: string, rawPrice: string): ParseResult {
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Nhập tên lựa chọn' }

  const trimmedPrice = rawPrice.trim()
  // Bắt dấu trừ TRƯỚC khi đưa vào parseVnd: parseVnd trả null cho cả "-1" lẫn "abc",
  // mà hai ca này cần hai câu báo lỗi khác nhau ("giá âm" vs "không phải số").
  const isNegative = trimmedPrice.startsWith('-')
  const body = isNegative ? trimmedPrice.slice(1) : trimmedPrice

  // parseVnd bỏ dấu ngăn nghìn kiểu Việt Nam ("80.000" → 80000) rồi bắt buộc phần
  // còn lại là chữ số thuần tuý — chi tiết và các đánh đổi xem lib/money.ts.
  const price = parseVnd(body)
  if (price === null) {
    return { ok: false, error: 'Giá chỉ gồm chữ số, ví dụ 80000 hoặc 80.000' }
  }
  if (isNegative || price > MAX_PRICE) {
    return { ok: false, error: 'Giá phải là số ≥ 0' }
  }
  return { ok: true, name, price }
}

export function displayPriceLabel(price: number, hasVariants: boolean): string {
  const formatted = `${price.toLocaleString('vi-VN')}đ`
  return hasVariants ? `Từ ${formatted}` : formatted
}
