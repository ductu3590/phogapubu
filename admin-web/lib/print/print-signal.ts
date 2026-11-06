// Tín hiệu trang in gửi cho phần mềm in (đặt trên <html>): data-print-ready="1" khi xong,
// data-print-error="<lý do>" khi lỗi, kèm data-print-retryable="1" nếu lỗi đọc tạm thời (thử lại có thể được).
// Thuần để test được.
export function printSignal(input: {
  error?: string
  retryable?: boolean
  alertText: string | null
}): { ready: true } | { error: string; retryable?: true } {
  if (input.error) return input.retryable ? { error: input.error, retryable: true } : { error: input.error }
  // Trang có khối role="alert" (vd PrintBill báo giảm giá lớn hơn tiền hàng) nghĩa là KHÔNG phải phiếu → không in tờ lỗi
  // và thử lại cũng không đổi được kết quả.
  if (input.alertText !== null) return { error: input.alertText.trim() || 'Phiếu bị lỗi' }
  return { ready: true }
}
