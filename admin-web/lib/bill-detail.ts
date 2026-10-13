// Ngăn kéo "Xem bill" (A04-2): đọc các đơn (lượt gọi) của một dòng trang Hoá đơn & Báo cáo + quyết định nút nào
// hiện. Luật nút giữ NGUYÊN trang Đơn hàng cũ (sắp xoá ở A04-4) — chỉ đổi chỗ hiển thị, không đổi hành vi.
import { billCode } from '@/lib/bills-report'
import { hasRealMoney, isAwaitingPayment, type MoneyFields } from '@/lib/revenue'
import { paymentBadge, type PaymentBadge } from '@/lib/order-payment-badge'
import { orderTags, type OrderTag } from '@/lib/order-tags'
import { rejectReasonLabel } from '@/lib/pos-bill-history'

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', cooking: 'Đang làm',
  ready: 'Xong món', paid: 'Hoàn tất', cancelled: 'Đã huỷ',
}

export type BillDetailItem = {
  id: string; name: string; quantity: number; unitPrice: number; lineTotal: number
  toppings: string[]; voidType: 'cancelled' | 'gift' | null; voidReason: string | null; note: string | null
}

export type BillDetailSpin = { id: string; label: string; type: string; status: string }

export type BillDetailActions = { confirm: boolean; complete: boolean; cancel: boolean; redeem: boolean }

export type BillDetailOrder = {
  id: string; code: string; createdAt: string; status: string; statusLabel: string; tableLabel: string
  total: number; discount: number; voucherCode: string | null; note: string | null
  customerName: string | null; customerPhone: string | null; deliveryAddress: string | null
  tags: OrderTag[]; payment: PaymentBadge; inSession: boolean
  rejected: boolean; rejectReason: string | null
  items: BillDetailItem[]; spin: BillDetailSpin | null; actions: BillDetailActions
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Nút của một đơn — điều kiện trang Đơn hàng cũ, TRỪ lượt thuộc phiên bàn. `canManage` (chỉ chủ quán) xét ở UI. */
export function orderActions(o: MoneyFields & { status: string }, spin: BillDetailSpin | null): BillDetailActions {
  const active = o.status !== 'paid' && o.status !== 'cancelled'
  // Lượt thuộc PHIÊN BÀN (trả sau): quán thu CẢ BÀN một lần lúc khách về (anh Tú 2026-10-13) → thu bằng nút
  // "Đã nhận tiền" của cả bill (close_table_session, như POS). Thu/hoàn tất từng lượt để lại bàn "thu một nửa".
  const inSession = Boolean(o.session_id)
  return {
    confirm: active && !inSession && isAwaitingPayment(o),
    complete: active && !inSession,
    // Đơn đã có tiền thật KHÔNG huỷ ở đây (huỷ đơn đã thu là lỗ đối soát — như trang cũ).
    cancel: active && !hasRealMoney(o),
    redeem: spin !== null && spin.type === 'gift' && spin.status === 'won',
  }
}

export function parseBillDetail(rows: unknown, spins: unknown): BillDetailOrder[] {
  const spinByOrder = new Map<string, BillDetailSpin>()
  for (const s0 of arr(spins)) {
    const s = obj(s0)
    const orderId = str(s.order_id)
    if (orderId) spinByOrder.set(orderId, { id: str(s.id), label: str(s.reward_label), type: str(s.reward_type), status: str(s.status) })
  }
  return arr(rows).map((r0) => {
    const r = obj(r0)
    const id = str(r.id)
    const status = str(r.status) || 'pending'
    const money: MoneyFields & { status: string } = {
      payment_method: str(r.payment_method), status, zalopay_trans_id: strOrNull(r.zalopay_trans_id),
      payment_received_at: strOrNull(r.payment_received_at), bank_handoff_at: strOrNull(r.bank_handoff_at),
      payment_instrument: strOrNull(r.payment_instrument), session_id: strOrNull(r.session_id),
    }
    const spin = spinByOrder.get(id) ?? null
    return {
      id, code: billCode([], id ? [id] : []), createdAt: str(r.created_at), status,
      statusLabel: ORDER_STATUS_LABEL[status] ?? status,
      tableLabel: strOrNull(obj(r.tables).table_number) ?? (r.order_type === 'pickup' ? 'Mang về' : r.order_type === 'delivery' ? 'Ship' : '—'),
      total: num(r.total_amount), discount: num(r.discount_amount), voucherCode: strOrNull(obj(r.vouchers).code),
      note: strOrNull(r.note), customerName: strOrNull(r.customer_name), customerPhone: strOrNull(r.customer_phone),
      deliveryAddress: strOrNull(r.delivery_address),
      tags: orderTags(strOrNull(r.order_source), strOrNull(r.order_type)),
      payment: paymentBadge(money.payment_method, hasRealMoney(money), money.session_id !== null),
      inSession: money.session_id !== null,
      rejected: strOrNull(r.rejected_at) !== null,
      rejectReason: rejectReasonLabel(strOrNull(r.rejection_reason_code), strOrNull(r.rejection_reason_note)),
      items: arr(r.order_items).map((i0) => {
        const i = obj(i0)
        const toppings = arr(i.selected_toppings).map(obj)
        const unitPrice = num(i.item_price) + toppings.reduce((s, t) => s + num(t.price), 0)
        const quantity = num(i.quantity)
        const voidType = i.void_type === 'gift' ? 'gift' : i.void_type === 'cancelled' ? 'cancelled' : null
        return {
          id: str(i.id), name: str(i.item_name) || 'Món', quantity, unitPrice,
          lineTotal: voidType ? 0 : unitPrice * quantity,
          toppings: toppings.map((t) => str(t.name)).filter(Boolean),
          voidType, voidReason: strOrNull(i.void_reason), note: strOrNull(i.note),
        }
      }),
      spin,
      actions: orderActions(money, spin),
    }
  })
}
