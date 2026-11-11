// Mẫu điều khoản mặc định do MEVO soạn — dùng khi quán chưa nhập terms_of_use.
// Nội dung Markdown nhẹ, chung chung an toàn cho quán ăn.
// Có HAI mẫu theo mô hình quán; chọn mẫu nào do utils/terms.ts (resolveTerms) quyết định.
// DEFAULT_TERMS: quán trả trước (thanh toán online, mang về/ship, hoàn tiền).
export const DEFAULT_TERMS = `# Điều khoản sử dụng

Cảm ơn bạn đã đặt món qua ứng dụng. Vui lòng đọc các điều khoản dưới đây.

## Đặt món & thanh toán
- Món ăn, giá và khuyến mãi hiển thị tại thời điểm bạn đặt.
- Đơn hàng được xác nhận sau khi bạn hoàn tất thanh toán hoặc được nhân viên tiếp nhận.
- Vui lòng kiểm tra kỹ món và số lượng trước khi xác nhận đặt.

## Giao / nhận món
- Với đơn tại bàn: món được mang ra theo số bàn bạn đã quét.
- Với đơn mang về / giao: thời gian có thể thay đổi tuỳ tình hình quán và quãng đường.

## Huỷ & hoàn tiền
- Vui lòng liên hệ nhân viên hoặc hotline của quán ngay nếu cần chỉnh sửa hoặc huỷ đơn.
- Việc hoàn tiền thực hiện theo chính sách của quán và của kênh thanh toán.

## Liên hệ hỗ trợ
- Mọi thắc mắc về đơn hàng, vui lòng liên hệ trực tiếp nhân viên hoặc hotline của quán.
`;

// DEFAULT_TERMS_POSTPAY: quán trả sau (gọi món tại bàn bằng QR, trả tiền ở quầy sau khi dùng bữa).
// Không nhắc thanh toán online / mang về / hoàn tiền vì mô hình này không có.
// Mục "Thông tin cá nhân" lấy đúng ý phần Quyền riêng tư ở trang Tài khoản (pages/account).
export const DEFAULT_TERMS_POSTPAY = `# Điều khoản sử dụng

Cảm ơn bạn đã gọi món qua ứng dụng. Vui lòng đọc các điều khoản dưới đây.

## Gọi món tại bàn
- Bạn quét mã QR tại bàn để xem thực đơn và gọi món cho đúng bàn đó.
- Món và giá tính theo thực đơn hiển thị tại thời điểm bạn gọi.
- Món bạn gọi được nhân viên hoặc thu ngân của quán tiếp nhận và xác nhận.
- Vui lòng kiểm tra kỹ món và số lượng trước khi gửi. Cần sửa hoặc bỏ món, hãy báo nhân viên ngay.

## Thanh toán
- Ứng dụng không thu tiền. Bạn thanh toán tại quầy sau khi dùng bữa.
- Số tiền trong ứng dụng là tạm tính, số tiền cần trả theo hoá đơn của quán.

## Thông tin cá nhân
- Tên và số điện thoại chỉ lưu trên điện thoại của bạn để điền sẵn khi đặt bàn. Quán chỉ nhận khi bạn gửi yêu cầu đặt bàn.
- Bạn có thể xoá các thông tin này ở trang Tài khoản.

## Liên hệ hỗ trợ
- Mọi thắc mắc về món đã gọi hoặc hoá đơn, vui lòng liên hệ trực tiếp nhân viên hoặc hotline của quán.
`;
