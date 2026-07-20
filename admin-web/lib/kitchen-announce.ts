// ─── Quyết định thời điểm "báo bếp" đơn hàng (Sprint v2.2 fix) ──────────────
// Đơn được tạo (create_order) ở status 'pending' NGAY khi khách bấm "Đặt món và
// thanh toán" — TRƯỚC khi trả tiền. Với ZaloPay, đơn chỉ thực sự vào bếp sau khi
// thanh toán thành công (zalopay-callback UPDATE → 'confirmed'). Vì vậy chuông +
// loa đọc đơn phải kêu đúng lúc đơn VÀO BẾP, không phải lúc mới tạo.

// Đơn đang ở trạng thái "trong bếp" (đã trả tiền hoặc tiền mặt chờ làm)?
// Khớp đúng điều kiện cột "CHỜ XỬ LÝ": ZaloPay pending chưa trả tiền KHÔNG tính.
export function orderInKitchen(status: string, paymentMethod: string): boolean {
  // Đơn staff tiền mặt / chuyển khoản vào bếp NGAY ở 'pending' (chưa thu tiền, thu tại quầy sau —
  // spec staff §8.1). ZaloPay (ví) vẫn phải 'confirmed'. Khách tự đặt không tạo đơn bank_transfer
  // (create_order chỉ nhận zalopay/cash) nên mở predicate này chỉ ảnh hưởng đơn staff.
  return (
    status === 'confirmed' ||
    (status === 'pending' && (paymentMethod === 'cash' || paymentMethod === 'bank_transfer'))
  )
}

// Có nên "báo bếp" (chuông + đọc) cho sự kiện đơn này không?
// Chỉ báo LẦN ĐẦU đơn vào bếp — đã báo rồi thì thôi (chống báo lại khi
// đơn chuyển cooking/ready hay nhận nhiều event).
export function shouldAnnounceOrder(
  status: string,
  paymentMethod: string,
  alreadyAnnounced: boolean,
): boolean {
  if (alreadyAnnounced) return false
  return orderInKitchen(status, paymentMethod)
}
