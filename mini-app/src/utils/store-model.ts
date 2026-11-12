// Hai mô hình quán dùng chung một bộ code lõi (stores.payment_timing):
//   prepay  — trả trước qua Zalo Checkout: có mã giảm giá, vòng quay, mang về/ship.
//   postpay — quán nhậu gọi món tại bàn, trả tiền ở quầy: KHÔNG có mã giảm giá.
// Luật "tính năng nào thuộc mô hình nào" gom về đây để màn hình không tự so chuỗi.
export type StorePaymentTiming = "prepay" | "postpay";

// Mã giảm giá chỉ thuộc quán trả trước. Chưa tải xong quán (storeId rỗng) thì CHƯA biết mô hình
// (store mặc định "prepay") → coi như chưa bật, kẻo quán trả sau vẫn gọi get_my_vouchers
// trong khoảnh khắc đầu.
export function vouchersEnabled(input: {
  storeId: string | null | undefined;
  paymentTiming: StorePaymentTiming;
}): boolean {
  return !!input.storeId && input.paymentTiming === "prepay";
}

// Mã thật sự đi kèm đơn. Quán không dùng mã thì luôn là null, kể cả khi state còn sót một mã
// (vd. cấu hình quán đổi giữa chừng) — không gửi p_voucher_code, không trừ tiền ở màn hình.
export function voucherForOrder<T>(enabled: boolean, voucher: T | null): T | null {
  return enabled ? voucher : null;
}
