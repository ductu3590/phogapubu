// Phân loại kết quả thanh toán Zalo Checkout — logic THUẦN, không import gì.
//
// Nguồn: https://docs.zaloplatforms.com/docs/MA/checkoutSdk/integration-process/overview/maResult
//   resultCode  1 = thanh toán thành công
//   resultCode  0 = đang thực hiện hoặc chờ xử lý
//   resultCode -1 = thanh toán thất bại
//   resultCode -2 = người dùng KHÔNG chọn phương thức và thoát Checkout SDK
//
// NGUYÊN TẮC: mọi trường hợp không chắc chắn đều rơi về 'pending_confirm'. Không bao giờ suy đoán
// "khách chưa trả tiền" — báo nhầm cho người đã chuyển khoản là lỗi nặng nhất.

export type CheckoutOutcome =
  | 'success'          // đã trả tiền
  | 'abandoned'        // thoát không chọn phương thức → hiện banner
  | 'failed'           // thanh toán thất bại / chưa tạo được giao dịch → hiện banner
  | 'pending_confirm'  // chờ webhook hoặc quán xác nhận → đi đường cũ

export type TransactionResult = {
  resultCode?: number | string | null
  isCustom?: boolean | null
}

export function mapCheckoutResult(r: TransactionResult | null | undefined): CheckoutOutcome {
  if (!r) return 'pending_confirm'

  // resultCode đọc từ object SDK không có kiểu → chặn rác ở runtime, đừng tin TransactionResult.
  // Number(true)=1 và Number([-2])=-2 sẽ lọt thành 'success'/'abandoned' nếu không chặn ở đây.
  if (typeof r.resultCode !== 'number' && typeof r.resultCode !== 'string') {
    return 'pending_confirm'
  }

  const code = Number(r.resultCode)
  if (!Number.isFinite(code)) return 'pending_confirm'

  if (code === 1) return 'success'
  if (code === -2) return 'abandoned'
  // Chuyển khoản: Zalo KHÔNG thấy giao dịch bank→bank nên resultCode không đáng tin.
  // Kiểm isCustom TRƯỚC -1 để không kết luận thất bại cho đơn khách đang chuyển tiền.
  if (r.isCustom === true) return 'pending_confirm'
  if (code === -1) return 'failed'
  return 'pending_confirm'
}
