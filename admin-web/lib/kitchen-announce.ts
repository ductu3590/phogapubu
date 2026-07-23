// ─── Quyết định đơn nào nằm ở cột "CHỜ XỬ LÝ" của bếp + khi nào báo bếp ─────────
// PM-3/§7: vào bếp theo AI ĐẶT (order_source), không theo status/payment_method:
//  • staff (nhân viên đứng cạnh khách = bằng chứng khách có mặt) → vào bếp NGAY.
//  • khách tự đặt qua QR (customer_zalo) → chỉ vào bếp khi ĐÃ có tiền thật
//    (payment_received_at: ví callback / bếp / owner xác nhận) HOẶC chọn tiền mặt.
// Chống đơn "ma": QR bị chụp/share, người ở nhà đặt đơn chưa trả tiền → không cho vào bếp.
// Chỉ tính trạng thái "chờ làm" (pending/confirmed); cooking/ready đã ở cột riêng.

export type KitchenPredicateFields = {
  status: string
  orderSource: string
  paymentReceivedAt: string | null
  paymentMethod: string
}

export function orderInKitchen(o: KitchenPredicateFields): boolean {
  if (o.status !== 'pending' && o.status !== 'confirmed') return false
  if (o.orderSource === 'staff') return true
  return o.paymentReceivedAt !== null || o.paymentMethod === 'cash'
}

// Có nên "báo bếp" (chuông + loa đọc) cho sự kiện đơn này không?
// Chỉ báo LẦN ĐẦU đơn vào bếp — đã báo rồi thì thôi (chống báo lại khi đơn chuyển
// cooking/ready hay nhận nhiều event).
export function shouldAnnounceOrder(o: KitchenPredicateFields, alreadyAnnounced: boolean): boolean {
  if (alreadyAnnounced) return false
  return orderInKitchen(o)
}
