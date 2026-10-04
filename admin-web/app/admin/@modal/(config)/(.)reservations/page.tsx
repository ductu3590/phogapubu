import Page from '../../../reservations/page'

// Đặt bàn mở trong hộp thoại cấu hình đè lên POS (2026-10-04: bỏ khỏi thanh icon — việc hằng ngày
// đã làm trên POS; trang này còn lịch các ngày tới, đổi giờ / đổi bàn, duyệt yêu cầu đổi).
export default function Intercepted() {
  return <Page />
}
