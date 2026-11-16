// Màu biểu đồ lấy từ token --chart-1..6 (globals.css).
export const CHART_COLORS = [1, 2, 3, 4, 5, 6].map((i) => `var(--chart-${i})`)

/** Tiền mặt = xanh lá, chuyển khoản = xanh da trời, ghi nợ = vàng, ví/khác = tím. */
export const PAYMENT_COLORS: Record<'cash' | 'bank' | 'debt' | 'other', string> = {
  cash: 'var(--chart-3)',
  bank: 'var(--chart-4)',
  debt: 'var(--chart-2)',
  other: 'var(--chart-5)',
}
