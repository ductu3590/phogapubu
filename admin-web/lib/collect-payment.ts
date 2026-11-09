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

/** Giới hạn số tiền một ô (khớp server: 2.000.000.000 — p_cash_given là integer). */
export const MAX_VND = 2_000_000_000

/**
 * Đọc mảng khoản thu từ JSON server (get_bills_report, collect_table_bill 'already'). Chỉ giữ phương tiện có nhãn
 * (Object.hasOwn — khoá kế thừa như 'toString' không lọt), số ép kiểu. Thêm phương tiện = thêm nhãn ở bảng trên.
 */
export function parsePaymentLines(v: unknown): PaymentLine[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((p0) => {
    const p = p0 && typeof p0 === 'object' ? (p0 as Record<string, unknown>) : {}
    const i = p.instrument
    const amount = Number(p.amount)
    return typeof i === 'string' && Object.hasOwn(INSTRUMENT_LABELS, i) && Number.isFinite(amount)
      ? [{ instrument: i as Instrument, amount }]
      : []
  })
}

/** Tiền khách đưa vượt giới hạn → lỗi tiếng Việt (không để server báo tràn số integer). */
export function cashGivenError(given: number | null): string | null {
  return given !== null && given > MAX_VND ? 'Tiền khách đưa quá lớn — kiểm tra lại số' : null
}

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

const partOf = (lines: PaymentLine[], instrument: Instrument) =>
  lines.reduce((s, l) => (l.instrument === instrument ? s + l.amount : s), 0)

/** Phần tiền mặt của lần thu: tiền khách đưa / tiền thối so với phần này, không so cả bill. */
export function cashPartOf(lines: PaymentLine[]): number {
  return partOf(lines, 'cash')
}

/** Phần chuyển khoản của lần thu: số loa báo tiền / mã QR phải khớp. */
export function bankPartOf(lines: PaymentLine[]): number {
  return partOf(lines, 'bank')
}

/**
 * MỘT nguồn cho màn Thanh toán: dòng gửi server + phần tiền mặt / chuyển khoản đang thấy.
 * Hợp lệ → phần lấy từ CHÍNH các dòng sẽ gửi (bill 0đ ở chế độ Kết hợp: không có phần nào, dù ô còn chữ cũ).
 * Đang lệch (chỉ Kết hợp) → phần theo số đang gõ để ô khách đưa bám theo; nút thu vẫn khoá vì có lỗi.
 */
export function paymentDraft(
  total: number,
  method: PayMethod,
  cashTyped: number | null,
  bankTyped: number | null,
): { lines: PaymentLine[]; error: string | null; cash: number; bank: number } {
  const { lines, error } = buildPaymentLines(total, method, cashTyped, bankTyped)
  if (error) return { lines, error, cash: cashTyped ?? 0, bank: bankTyped ?? 0 }
  return { lines, error, cash: cashPartOf(lines), bank: bankPartOf(lines) }
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
