// Màu biểu đồ lấy từ token --chart-1..6 (globals.css).
export const CHART_COLORS = [1, 2, 3, 4, 5, 6].map((i) => `var(--chart-${i})`)

/**
 * Màu của một khoá trong danh sách lát donut (theo vị trí lát). Khoá đã bị gộp vào lát "Khác" (`__rest`) lấy màu lát
 * gộp — để ô chữ cái / chấm màu ngoài donut luôn trùng màu lát chứa nó.
 */
export function shareColor(shares: { key: string }[], key: string): string {
  let i = shares.findIndex((s) => s.key === key)
  if (i < 0) i = shares.findIndex((s) => s.key === '__rest')
  return CHART_COLORS[i >= 0 ? i : 5]
}

/** Nền nhạt pha từ một màu biểu đồ (chữ đậm vẫn đọc rõ trên nền này). */
export const tintBg = (color: string) => `color-mix(in srgb, ${color} 18%, white)`

/** Tiền mặt = xanh lá, chuyển khoản = xanh da trời, ghi nợ = vàng, ví/khác = tím. */
export const PAYMENT_COLORS: Record<'cash' | 'bank' | 'debt' | 'other', string> = {
  cash: 'var(--chart-3)',
  bank: 'var(--chart-4)',
  debt: 'var(--chart-2)',
  other: 'var(--chart-5)',
}
