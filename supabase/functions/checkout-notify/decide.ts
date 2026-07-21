// Logic THUẦN cho checkout-notify — không network, không import Deno.
// index.ts (Deno) import lại; vitest test file này trực tiếp.
//
// Nền tảng (spec §1): Zalo có HAI URL.
//   • Callback (ví ZaloPay/Momo/VNPay): payload có resultCode → tiền ĐÃ bị trừ, tin được.
//   • Notify (chuyển khoản/COD, method="BANK"): KHÔNG có resultCode → chỉ là "khách vừa CHỌN
//     phương thức", KHÔNG phải bằng chứng trả tiền. Xác nhận tiền đến từ bếp/SePay sau.

export type NotifyPayload = {
  method?: string
  resultCode?: unknown
  amount?: unknown
  transId?: unknown
}

export type OrderRow = {
  status: string
  total_amount: number
  payment_received_at: string | null
  bank_handoff_at: string | null
}

export type Decision =
  | { action: 'ignore'; reason: string }
  | { action: 'reject'; reason: string }
  | { action: 'bank_handoff'; patch: { bank_handoff_at: string; payment_instrument: 'bank' } }
  | {
      action: 'wallet_confirm'
      patch: {
        status: 'confirmed'
        zalopay_trans_id: string
        payment_received_at: string
        payment_received_via: 'zalo_callback'
        payment_received_by: null
        payment_instrument: 'wallet' | 'momo' | 'vnpay' | null
      }
    }

// Momo/VNPay CHƯA test thật (Rủi ro #1) → cố ý chỉ map ví ZaloPay. Method lạ → instrument null,
// KHÔNG suy đoán.
const WALLET_METHODS: Record<string, 'wallet' | 'momo' | 'vnpay'> = {
  zalopay: 'wallet',
  wallet: 'wallet',
}

// p: payload Zalo đã verify MAC. order: đơn đã load (cùng store). nowIso: thời điểm ghi nhận.
export function decideNotify(p: NotifyPayload, order: OrderRow, nowIso: string): Decision {
  const isCustom = p.resultCode == null

  if (isCustom) {
    // Chỉ method BANK đã whitelist. Method lạ = fail-closed thật (Rủi ro #1): không mutation.
    if (p.method !== 'BANK') return { action: 'ignore', reason: 'unknown custom method' }
    if (order.status === 'cancelled') return { action: 'ignore', reason: 'order cancelled' }
    // Callback ví có thể tới TRƯỚC (khách trả ví) → KHÔNG ghi đè bằng handoff.
    if (order.payment_received_at !== null) return { action: 'ignore', reason: 'already paid' }
    if (order.status !== 'pending') return { action: 'ignore', reason: 'not pending' }
    if (order.bank_handoff_at !== null) return { action: 'ignore', reason: 'handoff already set' }
    return { action: 'bank_handoff', patch: { bank_handoff_at: nowIso, payment_instrument: 'bank' } }
  }

  // === Ví (có resultCode) ===
  if (Number(p.resultCode) !== 1) return { action: 'ignore', reason: 'payment failed' }
  if (Number(p.amount) !== Number(order.total_amount)) {
    return { action: 'reject', reason: 'amount mismatch' }
  }
  if (order.payment_received_at !== null) return { action: 'ignore', reason: 'already paid' }
  return {
    action: 'wallet_confirm',
    patch: {
      status: 'confirmed',
      zalopay_trans_id: String(p.transId),
      payment_received_at: nowIso,
      payment_received_via: 'zalo_callback',
      payment_received_by: null,
      payment_instrument: WALLET_METHODS[String(p.method ?? '').toLowerCase()] ?? null,
    },
  }
}
