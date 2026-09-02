// Tiền VNĐ trong admin web — MỘT bộ hàm dùng chung cho mọi ô nhập số tiền.
//
// Người Việt chép giá từ tờ menu giấy in "80.000đ" luôn gõ kèm dấu chấm ngăn nghìn:
// đây là cách gõ MẶC ĐỊNH, không phải ca hiếm. Mà Number('80.000') trả về 80 —
// giá món âm thầm bị chia 1000. Nên mọi chỗ đọc số tiền từ ô nhập PHẢI đi qua
// parseVnd, đừng bao giờ gọi thẳng Number()/parseInt() lên chuỗi người dùng gõ.

// Dấu chấm, dấu phẩy, khoảng trắng bên trong một chuỗi tiền Việt chỉ có một nghĩa:
// ngăn nghìn. Bỏ hết trước khi kiểm tra.
const SEPARATORS_PATTERN = /[.,\s]/g

// Sau khi bỏ dấu ngăn nghìn, phần còn lại phải là chuỗi số nguyên thuần tuý.
const DIGITS_ONLY_PATTERN = /^\d+$/

/**
 * Định dạng lúc GÕ: giữ lại chữ số, chèn dấu chấm ngăn nghìn.
 * '80000' → '80.000' · '1200000' → '1.200.000' · '' → '' · '80k' → '80'
 *
 * Chỉ giữ chữ số nên dấu trừ và mọi ký tự khác bị loại — không ai gõ được giá âm
 * vào ô tiền. KHÔNG cắt số 0 đứng đầu ('08' → '08') để ô không nhảy về rỗng ngay
 * lúc người dùng vừa gõ chữ số '0' đầu tiên; parseVnd('08') vẫn ra 8 nên vô hại.
 *
 * Dấu chấm thập phân bị coi là dấu ngăn nghìn ('80.5' → '805'). Cố ý: VNĐ không
 * có đơn vị nhỏ hơn đồng, không ai gõ giá món kiểu thập phân — đừng tưởng là lỗi.
 */
export function formatVndTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  // Chèn dấu chấm sau mỗi nhóm 3 chữ số tính từ bên PHẢI.
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Đọc ngược ô tiền ra số. Bỏ dấu ngăn nghìn ('.', ',', khoảng trắng) rồi phần còn
 * lại phải là chữ số thuần tuý, không thì trả null.
 * '80.000' → 80000 · '80000' → 80000 · '' → null · '80k' → null · '-5' → null
 *
 * Trả null (chứ không phải NaN hay 0) để bên gọi buộc phải xử lý ca sai — NaN lọt
 * xuống DB là hỏng giá món im lặng.
 *
 * KHÔNG đặt trần giá ở đây: mỗi ô có ngưỡng hợp lý riêng (giá món khác mức giảm
 * giá voucher), bên gọi tự chặn.
 */
export function parseVnd(raw: string): number | null {
  const digitsOnly = raw.replace(SEPARATORS_PATTERN, '')
  if (!DIGITS_ONLY_PATTERN.test(digitsOnly)) return null
  return Number(digitsOnly)
}
