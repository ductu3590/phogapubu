// Nhãn trạng thái thanh toán của đơn — dùng chung cho /staff/orders (và có thể admin sau).
// Nguồn sự thật "đã có tiền thật": lib/revenue.ts. Ở đây chỉ để HIỂN THỊ badge, gồm cả trạng
// thái "chưa thu" mà revenue không quan tâm.

export type PaymentBadge = {
  label: string
  // pending = chưa nhận tiền (vàng), received = đã có tiền thật (xanh)
  tone: 'pending' | 'received'
}

export function paymentBadge(order: {
  paymentMethod: string
  paymentReceivedAt: string | null
  zalopayTransId: string | null
}): PaymentBadge {
  // Đã có tiền thật: quầy xác nhận tiền mặt/chuyển khoản (payment_received_at) HOẶC ZaloPay/CK-qua-Zalo
  // đã có trans_id.
  if (order.paymentReceivedAt || order.zalopayTransId) {
    return { label: '✓ Đã nhận tiền', tone: 'received' }
  }
  if (order.paymentMethod === 'cash') return { label: '💵 Tiền mặt · chưa thu', tone: 'pending' }
  if (order.paymentMethod === 'bank_transfer') return { label: '🏦 Chuyển khoản · chưa nhận', tone: 'pending' }
  // ZaloPay chưa có trans_id = chưa trả tiền
  return { label: 'Chờ thanh toán', tone: 'pending' }
}
