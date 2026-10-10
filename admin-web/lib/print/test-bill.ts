import type { SessionsBill } from '@/lib/actions/table-session'
import { cleanStoreText } from './store-lines'

// Phiếu in thử (PA-5): cùng khuôn với hoá đơn thật để chủ quán canh khổ giấy/máy in,
// nhưng dữ liệu là mẫu dựng tại chỗ — KHÔNG tạo đơn, KHÔNG mở phiên, KHÔNG ghi DB.
// Chỉ phần đầu phiếu (tên/địa chỉ/SĐT) là thật, vì đó chính là thứ chủ quán muốn soát.
export function buildTestBill(
  store: { name: string | null; address: string | null; phone: string | null },
  now: Date,
): SessionsBill {
  const items = [
    { name: 'Món mẫu 1', quantity: 2, price: 25000 },
    { name: 'Món mẫu 2 (tên dài để thử xuống dòng trên giấy 80mm)', quantity: 1, price: 150000 },
  ].map((it) => ({ ...it, line_total: it.quantity * it.price }))
  const subtotal = items.reduce((n, it) => n + it.line_total, 0)
  const at = now.toISOString()
  return {
    store: { name: cleanStoreText(store.name) ?? 'Quán', address: cleanStoreText(store.address), phone: cleanStoreText(store.phone) },
    printed_at: at,
    sessions: [{ session_id: 'in-thu', opened_at: at, is_open_ordering: false, tables: 'Bàn mẫu', subtotal, items }],
    grand_total: subtotal,
  }
}
