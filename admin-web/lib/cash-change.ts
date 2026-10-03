// Tiền khách đưa / tiền thối ở màn Thanh toán (/admin/pos). CHỈ để hiển thị cho thu ngân đếm tiền:
// số tiền thu vẫn là tổng bill do server tính, không gửi con số nào ở đây lên server.

/**
 * "500.000" / "500,000" / "500k" / "500 000đ" → 500000. Bỏ mọi dấu ngăn nghìn trước khi đọc
 * (Number('80.000') ra 80 — bẫy đã vấp ở mig 042). "k" = nghìn. Rỗng / không có số → null.
 */
export function parseVnd(input: string): number | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null
  const thousands = /k$/.test(raw.replace(/[\sđd]/g, ''))
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isSafeInteger(n)) return null
  return thousands ? n * 1000 : n
}

/** Các mệnh giá khách hay đưa: vừa đủ + làm tròn lên 50k / 100k / 500k / 1 triệu, không trùng, tối đa 4. */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return []
  const out = [total]
  for (const step of [50_000, 100_000, 500_000, 1_000_000]) {
    const v = Math.ceil(total / step) * step
    if (!out.includes(v)) out.push(v)
  }
  return out.sort((a, b) => a - b).slice(0, 4)
}

export type ChangeResult =
  | { kind: 'empty' }
  | { kind: 'short'; missing: number }
  | { kind: 'ok'; change: number }

export function cashChange(total: number, given: number | null): ChangeResult {
  if (given === null) return { kind: 'empty' }
  if (given < total) return { kind: 'short', missing: total - given }
  return { kind: 'ok', change: given - total }
}

/**
 * Định dạng lại ô tiền khi đang gõ: chỉ giữ chữ số, chèn dấu chấm ngăn nghìn ("1200000" → "1.200.000").
 * Gõ "k" ở cuối = nghìn ("500k" → "500.000"). Rỗng → rỗng.
 */
export function formatVndInput(input: string): string {
  const thousands = /k\s*$/i.test(input)
  const digits = input.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (!digits) return ''
  const n = Number(digits) * (thousands ? 1000 : 1)
  if (!Number.isSafeInteger(n)) return input
  return n.toLocaleString('vi-VN')
}
