// Luật "đơn này đã có TIỀN THẬT chưa" — một chỗ duy nhất.
// Trước đây luật này bị chép ở admin/orders/page.tsx và admin/dashboard/page.tsx,
// thêm phương thức mới mà quên một chỗ là hai màn hình báo hai số khác nhau.
//
// Ba nhánh (tạm thời — Sprint PM-1 của spec multi-method payment sẽ gộp về
// payment_received_at, và đổi luôn 'zalopay' thành 'zalo_checkout'):
//   1. ZaloPay:  có zalopay_trans_id (callback thành công)
//   2. Legacy:   cash + status='paid' (dữ liệu cũ, code mới không ghi nữa)
//   3. Mới:      cash/bank_transfer + payment_received_at (owner đã xác nhận)
// Đơn cancelled không bao giờ tính.
//
// PHẢI khớp với luật SQL trong supabase/migrations/028_staff_assisted_ordering.sql
// mục 9 (hàm get_daily_revenue) — lệch nhau là dashboard và trang Đơn hàng báo
// hai số khác nhau.

export type MoneyFields = {
  payment_method: string
  status: string
  zalopay_trans_id: string | null
  payment_received_at: string | null
}

export function hasRealMoney(o: MoneyFields): boolean {
  if (o.status === 'cancelled') return false

  if (o.payment_method === 'zalopay') return o.zalopay_trans_id !== null

  if (o.payment_method === 'cash' && o.status === 'paid') return true

  if (o.payment_method === 'cash' || o.payment_method === 'bank_transfer') {
    return o.payment_received_at !== null
  }

  return false
}

// Đơn đã vào bếp/đang phục vụ nhưng chưa thu được tiền.
export function isAwaitingPayment(o: MoneyFields): boolean {
  if (o.status === 'cancelled' || o.status === 'paid') return false
  if (o.payment_method !== 'cash' && o.payment_method !== 'bank_transfer') return false
  return o.payment_received_at === null
}
