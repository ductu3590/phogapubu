// Hàm thuần cho biến thể món — tách khỏi server action để test được.

export type ParseResult =
  | { ok: true; name: string; price: number }
  | { ok: false; error: string }

// Ngưỡng an toàn: không món ăn nào ở quán vượt 100 triệu đồng.
// Chặn số quá lớn để tránh gõ nhầm thừa số 0 hoặc input rác.
const MAX_PRICE = 100_000_000

// Chỉ nhận SỐ NGUYÊN (có thể có dấu trừ ở đầu để rơi vào nhánh "giá âm" báo lỗi
// riêng thay vì gộp chung với "không phải số"). VNĐ không có phần lẻ nên không cần
// nhận số thập phân — nhờ vậy tránh luôn được ca mơ hồ "80.000" (thập phân 80 hay
// 80 nghìn theo cách viết phân cách nghìn kiểu VN?) và "80 000" (khoảng trắng phân cách).
const NUMERIC_PATTERN = /^-?\d+$/

// Giá gõ tay từ tờ menu giấy → phải chặn cả chữ lẫn số âm.
export function parseVariantInput(rawName: string, rawPrice: string): ParseResult {
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Nhập tên lựa chọn' }

  const trimmedPrice = rawPrice.trim()
  // Number('') === 0 và Number('   ') === 0 → phải tự chặn trước, không thì giá rỗng
  // âm thầm thành món miễn phí. Đồng thời chặn ký hiệu khoa học ("1e5"), dấu chấm/khoảng
  // trắng phân cách nghìn kiểu VN ("80.000", "80 000") — Number() hiểu sai các chuỗi này.
  if (!NUMERIC_PATTERN.test(trimmedPrice)) return { ok: false, error: 'Giá phải là số ≥ 0' }

  const price = Number(trimmedPrice)
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
    return { ok: false, error: 'Giá phải là số ≥ 0' }
  }
  return { ok: true, name, price: Math.round(price) }
}

export function displayPriceLabel(price: number, hasVariants: boolean): string {
  const formatted = `${price.toLocaleString('vi-VN')}đ`
  return hasVariants ? `Từ ${formatted}` : formatted
}
