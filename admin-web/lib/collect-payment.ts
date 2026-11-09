// Chia khoản thu ở màn Thanh toán (mig 112a, collect_table_bill). Hàm thuần — POS dùng để dựng p_lines gửi
// server và vẽ lại từng khoản trên hoá đơn / ngăn kéo A04. Số phải thu vẫn do SERVER tính và so; ở đây chỉ
// khoá nút thu khi hai ô chưa cộng đúng tổng đang thấy.
//
// Phương tiện khai ở MỘT chỗ (INSTRUMENT_LABELS): thêm phương tiện mới (vd. công nợ) = thêm một khoá vào bảng
// này + một nhánh PayMethod, không phải viết lại các hàm dưới.

import type { DebtCustomerChoice, NewDebtCustomer } from '@/lib/debts'
import { formatVND } from '@/lib/utils'

// Thứ tự khoá = thứ tự hiện trên màn / hoá đơn và thứ tự server trả (mig 123: cash, bank, debt).
export const INSTRUMENT_LABELS = {
  cash: 'Tiền mặt',
  bank: 'Chuyển khoản',
  debt: 'Ghi nợ',
} as const

export type Instrument = keyof typeof INSTRUMENT_LABELS
/** Tên theo plan công nợ; cùng kiểu với Instrument. */
export type PaymentInstrument = Instrument

/**
 * Lựa chọn trên màn Thanh toán: một phương tiện, 'mixed' = Tiền mặt + Chuyển khoản (thêm phần ghi nợ còn lại khi
 * debtRest), hoặc 'debt' = ghi nợ cả bill.
 */
export type PayMethod = 'cash' | 'bank' | 'mixed' | 'debt'

export type PaymentLine = { instrument: PaymentInstrument; amount: number }

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
 * Kết hợp + debtRest (mig 123): hai ô cộng KHÔNG vượt tổng, phần còn lại là ghi nợ (0 thì không có dòng nợ).
 * Ghi nợ: một dòng 'debt' bằng tổng. Lỗi → lines rỗng để UI khoá nút thu.
 */
export function buildPaymentLines(
  total: number,
  method: PayMethod,
  cashPart: number | null,
  bankPart: number | null,
  debtRest = false,
): { lines: PaymentLine[]; error: string | null } {
  if (total <= 0) return { lines: [], error: null }
  if (method !== 'mixed') return { lines: [{ instrument: method, amount: total }], error: null }

  // Thứ tự tiền mặt, chuyển khoản, ghi nợ — khớp thứ tự server trả về (mig 123).
  const parts: PaymentLine[] = [
    { instrument: 'cash', amount: cashPart ?? 0 },
    { instrument: 'bank', amount: bankPart ?? 0 },
  ]
  const valid = parts.every((p) => Number.isSafeInteger(p.amount) && p.amount >= 0)
  const sum = parts.reduce((s, p) => s + p.amount, 0)
  if (debtRest) {
    if (!valid) return { lines: [], error: 'Số tiền không hợp lệ' }
    if (sum > total) return { lines: [], error: `Tiền mặt và chuyển khoản vượt số cần thu ${formatVND(total)}` }
    parts.push({ instrument: 'debt', amount: total - sum })
    return { lines: parts.filter((p) => p.amount > 0), error: null }
  }
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

/** Phần ghi nợ của lần thu (mig 123): > 0 thì phải chọn khách nợ. */
export function debtPartOf(lines: PaymentLine[]): number {
  return partOf(lines, 'debt')
}

/**
 * Tham số khách nợ gửi kèm collectTableBill. Không có dòng nợ thì KHÔNG gửi khách dù đã chọn (thu ngân chọn khách
 * ở Ghi nợ rồi đổi sang Tiền mặt): server từ chối 'Không có phần ghi nợ để gắn khách' và thu ngân kẹt.
 */
export function buildCollectPayload(
  lines: PaymentLine[],
  choice: DebtCustomerChoice | null,
): { debtCustomerId: string | null; newDebtCustomer: NewDebtCustomer | null } {
  if (debtPartOf(lines) <= 0 || !choice) return { debtCustomerId: null, newDebtCustomer: null }
  return choice.kind === 'existing'
    ? { debtCustomerId: choice.id, newDebtCustomer: null }
    : { debtCustomerId: null, newDebtCustomer: choice.customer }
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
  debtRest = false,
): { lines: PaymentLine[]; error: string | null; cash: number; bank: number; debt: number } {
  const { lines, error } = buildPaymentLines(total, method, cashTyped, bankTyped, debtRest)
  // Đang lệch: chưa có phần ghi nợ nào chốt (debt 0) → chưa bắt chọn khách, nút thu vẫn khoá vì có lỗi.
  if (error) return { lines, error, cash: cashTyped ?? 0, bank: bankTyped ?? 0, debt: 0 }
  return { lines, error, cash: cashPartOf(lines), bank: bankPartOf(lines), debt: debtPartOf(lines) }
}

const INSTRUMENT_ORDER: readonly string[] = Object.keys(INSTRUMENT_LABELS)

/**
 * Các dòng in dưới tổng hoá đơn / hiện trong ngăn kéo A04: từng khoản (Tiền mặt, Chuyển khoản, Ghi nợ), khách đưa,
 * tiền thối (0 thì bỏ). Dòng nợ kèm tên khách nếu có: 'Ghi nợ — <tên>'.
 */
export function paymentRows(p: {
  payments?: PaymentLine[]
  cashGiven?: number | null
  changeAmount?: number | null
  debtCustomerName?: string | null
}): { label: string; amount: number }[] {
  const rank = (i: string) => { const k = INSTRUMENT_ORDER.indexOf(i); return k < 0 ? INSTRUMENT_ORDER.length : k }
  const name = p.debtCustomerName?.trim()
  const rows = [...(p.payments ?? [])].sort((a, b) => rank(a.instrument) - rank(b.instrument)).map((l) => {
    // Server mới hơn UI (phương tiện chưa có nhãn) thì hiện mã phương tiện, không mất dòng tiền.
    const label = (INSTRUMENT_LABELS as Record<string, string>)[l.instrument] ?? l.instrument
    return { label: l.instrument === 'debt' && name ? `${label} — ${name}` : label, amount: l.amount }
  })
  if (p.cashGiven != null) rows.push({ label: 'Khách đưa', amount: p.cashGiven })
  if (p.changeAmount != null && p.changeAmount > 0) rows.push({ label: 'Tiền thối', amount: p.changeAmount })
  return rows
}
