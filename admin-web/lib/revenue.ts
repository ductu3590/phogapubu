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
  bank_handoff_at?: string | null
  payment_instrument?: string | null
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

// Đơn CHƯA thu tiền nhưng có thể xác nhận TAY (bếp/owner bấm "Đã nhận tiền"):
//  • tiền mặt, chuyển khoản nhân viên (bank_transfer);
//  • KHÁCH tự đặt chuyển khoản (zalo_checkout đã sang app ngân hàng = bank_handoff_at, không phải ví).
// Đơn ví (instrument 'wallet') do callback tự xác nhận → KHÔNG nằm nhóm này.
export function isAwaitingPayment(o: MoneyFields): boolean {
  if (o.status === 'cancelled' || o.status === 'paid') return false
  if (o.payment_received_at !== null) return false
  if (o.payment_method === 'cash' || o.payment_method === 'bank_transfer') return true
  if (
    o.payment_method === 'zalo_checkout' &&
    o.bank_handoff_at != null &&
    o.payment_instrument !== 'wallet'
  ) {
    return true
  }
  return false
}
