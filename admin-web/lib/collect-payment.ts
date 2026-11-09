// Chia khoản thu ở màn Thanh toán (mig 112a, collect_table_bill). Hàm thuần — POS dùng để dựng p_lines gửi
// server và vẽ lại từng khoản trên hoá đơn / ngăn kéo A04. Số phải thu vẫn do SERVER tính và so; ở đây chỉ
// khoá nút thu khi hai ô chưa cộng đúng tổng đang thấy.
//
// Phương tiện khai ở MỘT chỗ (INSTRUMENT_LABELS): thêm phương tiện mới (vd. công nợ) = thêm một khoá vào bảng
// này + một nhánh PayMethod, không phải viết lại các hàm dưới.

export const INSTRUMENT_LABELS = {
  cash: 'Tiền mặt',
  bank: 'Chuyển khoản',
} as const

export type Instrument = keyof typeof INSTRUMENT_LABELS

/** Lựa chọn trên màn Thanh toán: một phương tiện, hoặc 'mixed' = Tiền mặt + Chuyển khoản. */
export type PayMethod = Instrument | 'mixed'

export type PaymentLine = { instrument: Instrument; amount: number }

const fmt = (n: number) => n.toLocaleString('vi-VN')

/** Gõ một ô, ô kia là phần còn lại của tổng; gõ quá tổng thì ô kia là 0. Ô trống → null. */
export function fillOtherSide(total: number, typed: number | null): number | null {
  if (typed === null) return null
  return Math.max(0, total - typed)
}

/**
 * Dựng p_lines cho collect_table_bill. Bill 0đ (tặng hết món): không dòng nào, không lỗi.
 * Kết hợp: hai ô phải cộng ĐÚNG tổng (số nguyên, không âm), ô bằng 0 thì bỏ dòng đó.
 * Lỗi → lines rỗng để UI khoá nút thu.
 */
export function buildPaymentLines(
  total: number,
  method: PayMethod,
  cashPart: number | null,
  bankPart: number | null,
): { lines: PaymentLine[]; error: string | null } {
  if (total <= 0) return { lines: [], error: null }
  if (method !== 'mixed') return { lines: [{ instrument: method, amount: total }], error: null }

  // Thứ tự tiền mặt trước chuyển khoản, khớp thứ tự server trả về (instrument DESC).
  const parts: PaymentLine[] = [
    { instrument: 'cash', amount: cashPart ?? 0 },
    { instrument: 'bank', amount: bankPart ?? 0 },
  ]
  const valid = parts.every((p) => Number.isSafeInteger(p.amount) && p.amount >= 0)
  const sum = parts.reduce((s, p) => s + p.amount, 0)
  if (!valid || sum !== total) return { lines: [], error: `Tổng hai khoản phải đúng ${fmt(total)}đ` }
  return { lines: parts.filter((p) => p.amount > 0), error: null }
}

/** Phần tiền mặt của lần thu: tiền khách đưa / tiền thối so với phần này, không so cả bill. */
export function cashPartOf(lines: PaymentLine[]): number {
  return lines.reduce((s, l) => (l.instrument === 'cash' ? s + l.amount : s), 0)
}

/** Các dòng in dưới tổng hoá đơn / hiện trong ngăn kéo A04: từng khoản, khách đưa, tiền thối (0 thì bỏ). */
export function paymentRows(p: {
  payments?: PaymentLine[]
  cashGiven?: number | null
  changeAmount?: number | null
}): { label: string; amount: number }[] {
  const rows = (p.payments ?? []).map((l) => ({
    // Server mới hơn UI (phương tiện chưa có nhãn) thì hiện mã phương tiện, không mất dòng tiền.
    label: (INSTRUMENT_LABELS as Record<string, string>)[l.instrument] ?? l.instrument,
    amount: l.amount,
  }))
  if (p.cashGiven != null) rows.push({ label: 'Khách đưa', amount: p.cashGiven })
  if (p.changeAmount != null && p.changeAmount > 0) rows.push({ label: 'Tiền thối', amount: p.changeAmount })
  return rows
}
