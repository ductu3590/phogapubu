// Luật "đơn này đã có TIỀN THẬT chưa" — một chỗ duy nhất.
// Trước đây luật này bị chép ở admin/orders/page.tsx và admin/dashboard/page.tsx,
// thêm phương thức mới mà quên một chỗ là hai màn hình báo hai số khác nhau.
//
// PM-1 (mig 030): gộp về MỘT luật — payment_received_at là nguồn sự thật duy nhất.
//   • payment_received_at != null  → đã có tiền (ví callback / bếp / owner / SePay / legacy backfill)
//   • cash + status='paid'         → legacy (đơn tiền mặt cũ chưa có payment_received_at)
//   • cancelled                    → không bao giờ tính
// zalopay_trans_id GIỮ trong type (đối soát ví) nhưng KHÔNG còn là căn cứ tính tiền —
// notify BANK không phải bằng chứng trả tiền (§1.1).
//
// PHẢI khớp với luật SQL trong supabase/migrations/030_multi_method_payment.sql mục 7
// (hàm get_daily_revenue) — lệch nhau là dashboard và trang Đơn hàng báo hai số khác nhau.

export type MoneyFields = {
  payment_method: string
  status: string
  zalopay_trans_id: string | null
  payment_received_at: string | null
}

export function hasRealMoney(o: MoneyFields): boolean {
  if (o.status === 'cancelled') return false
  // Nguồn sự thật DUY NHẤT (§4). Notify của Zalo (trans_id BANK:...) KHÔNG còn là bằng chứng
  // trả tiền — callback ví và xác nhận tay đều ghi payment_received_at.
  if (o.payment_received_at !== null) return true
  // Legacy: đơn tiền mặt cũ đánh dấu status='paid' mà chưa có payment_received_at.
  if (o.payment_method === 'cash' && o.status === 'paid') return true
  return false
}

// Đơn đã vào bếp/đang phục vụ nhưng chưa thu được tiền.
export function isAwaitingPayment(o: MoneyFields): boolean {
  if (o.status === 'cancelled' || o.status === 'paid') return false
  if (o.payment_method !== 'cash' && o.payment_method !== 'bank_transfer') return false
  return o.payment_received_at === null
}
