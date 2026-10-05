import type { OrderRejectReason } from '@/lib/actions/pos-order'

/** Lý do từ chối đơn trên POS — MỘT nguồn chữ cho hộp chọn lý do, tab Lịch sử và Mini App. */
export const REJECT_REASONS: { code: OrderRejectReason; label: string }[] = [
  { code: 'out_of_stock', label: 'Hết đồ' },
  { code: 'kitchen_overloaded', label: 'Bếp quá tải' },
  { code: 'duplicate', label: 'Đơn trùng' },
  { code: 'customer_requested', label: 'Khách yêu cầu huỷ' },
  { code: 'other', label: 'Lý do khác' },
]

export function rejectReasonLabel(code: string | null | undefined, note: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'other') return note?.trim() || 'Lý do khác'
  return REJECT_REASONS.find((r) => r.code === code)?.label ?? 'Lý do khác'
}

type OrderLike = { id: string; created_at: string; status: string }
type SessionLike = { session_id: string; orders: OrderLike[]; rejected_orders?: OrderLike[] }

/** Tab Lịch sử = MỌI lượt gọi của bàn, kể cả lượt bị từ chối (mig 089), mới nhất trên cùng.
 *  Tab Hoá đơn KHÔNG dùng hàm này — lượt bị từ chối không có tiền. */
export function billHistory<S extends SessionLike>(list: S[]): { s: S; o: S['orders'][number]; rejected: boolean }[] {
  type O = S['orders'][number]
  const rows: { s: S; o: O; rejected: boolean }[] = []
  for (const s of list) {
    for (const o of s.orders as O[]) rows.push({ s, o, rejected: false })
    for (const o of (s.rejected_orders ?? []) as O[]) rows.push({ s, o, rejected: true })
  }
  return rows.sort((a, b) => b.o.created_at.localeCompare(a.o.created_at))
}
