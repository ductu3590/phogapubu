// ─── Quyết định đơn nào nằm ở cột "CHỜ XỬ LÝ" của bếp + khi nào báo bếp ─────────
// Hai trục KHÁC NHAU, đừng suy trục này ra trục kia (mig 039):
//   • storePaymentTiming = KHI NÀO thu tiền (prepay: có tiền rồi bếp mới làm;
//     postpay: ăn trước trả sau, thu khi khách ra về).
//   • paymentMethod      = THU BẰNG GÌ (kênh/phương tiện, chỉ để vận hành + báo cáo).
// Trước mig 039 luật cũ là `paymentMethod === 'cash'` -> quán TRẢ TRƯỚC mà bật tiền mặt
// cho nhân viên thì đơn QR tiền mặt của khách vẫn lọt vào bếp không cần tiền (PB3 của spec
// 2026-08-20) — đúng con lỗ hổng mig 037 mới vá được một nửa.
//
//  • Nếu quán bật cổng POS, `confirmed_at` là bằng chứng duy nhất đơn đã được duyệt.
//  • staff ở quán dùng policy automatic (nhân viên đứng cạnh khách) → vào bếp NGAY.
//  • khách tự đặt qua QR (customer_zalo) → vào bếp khi ĐÃ có tiền thật
//    (payment_received_at: ví callback / bếp / owner / nhân viên chốt bill),
//    HOẶC quán chạy trả sau (đơn phiên bàn, payment_method bị create_order ép về 'cash').
// Chống đơn "ma": QR bị chụp/share, người ở nhà đặt đơn chưa trả tiền → không cho vào bếp.
// Chỉ tính trạng thái "chờ làm" (pending/confirmed); cooking/ready đã ở cột riêng.

export type StorePaymentTiming = 'prepay' | 'postpay'
export type KitchenReleasePolicy = 'automatic' | 'pos_confirmation'

export type KitchenPredicateFields = {
  status: string
  orderSource: string
  confirmedAt: string | null
  kitchenReleasePolicy: KitchenReleasePolicy
  staffOrderReleasePolicy: KitchenReleasePolicy
  paymentReceivedAt: string | null
  paymentMethod: string
  storePaymentTiming: StorePaymentTiming
}

export function orderInKitchen(o: KitchenPredicateFields): boolean {
  // Món thu ngân ghi bổ sung là món đã phục vụ, tuyệt đối không tạo phiếu/loa bếp.
  if (o.orderSource === 'pos') return false
  if (o.status !== 'pending' && o.status !== 'confirmed') return false
  const requiresPosConfirmation =
    o.orderSource === 'staff'
      ? o.staffOrderReleasePolicy === 'pos_confirmation'
      : o.kitchenReleasePolicy === 'pos_confirmation'
  if (requiresPosConfirmation) return o.confirmedAt !== null
  if (o.orderSource === 'staff') return true
  if (o.paymentReceivedAt !== null) return true
  return o.storePaymentTiming === 'postpay' && o.paymentMethod === 'cash'
}

// Có nên "báo bếp" (chuông + loa đọc) cho sự kiện đơn này không?
// Chỉ báo LẦN ĐẦU đơn vào bếp — đã báo rồi thì thôi (chống báo lại khi đơn chuyển
// cooking/ready hay nhận nhiều event).
export function shouldAnnounceOrder(o: KitchenPredicateFields, alreadyAnnounced: boolean): boolean {
  if (alreadyAnnounced) return false
  return orderInKitchen(o)
}
