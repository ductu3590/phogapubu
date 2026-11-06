// Tín hiệu trang in gửi cho phần mềm in (đặt trên <html>): data-print-ready="1" khi xong,
// data-print-error="<lý do>" khi lỗi. Thuần để test được.
export function printSignal(input: { error?: string; alertText: string | null }): { ready: true } | { error: string } {
  if (input.error) return { error: input.error }
  // Trang có khối role="alert" (vd PrintBill báo giảm giá lớn hơn tiền hàng) nghĩa là KHÔNG phải phiếu → không in tờ lỗi
  if (input.alertText !== null) return { error: input.alertText.trim() || 'Phiếu bị lỗi' }
  return { ready: true }
}
