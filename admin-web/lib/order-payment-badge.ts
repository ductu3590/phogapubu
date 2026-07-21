// Nhãn trạng thái thanh toán của đơn — dùng chung cho /staff/orders và /admin.
// "received" (đã có tiền thật) do PHÍA GỌI quyết định, để mỗi màn dùng đúng luật của mình:
//   - /staff/orders: chỉ đơn active → received = có payment_received_at hoặc zalopay_trans_id.
//   - /admin: có cả đơn legacy → received = hasRealMoney(order) (gồm cash+status='paid').
// Giữ nhãn ở một chỗ để hai màn không lệch chữ.

export type PaymentBadge = {
  label: string
  tone: 'pending' | 'received'
}

export function paymentBadge(paymentMethod: string, received: boolean): PaymentBadge {
  if (received) return { label: '✓ Đã nhận tiền', tone: 'received' }
  if (paymentMethod === 'cash') return { label: '💵 Tiền mặt · chưa thu', tone: 'pending' }
  if (paymentMethod === 'bank_transfer') return { label: '🏦 Chuyển khoản · chưa nhận', tone: 'pending' }
  // ZaloPay chưa có trans_id = chưa trả tiền
  return { label: 'Chờ thanh toán', tone: 'pending' }
}
