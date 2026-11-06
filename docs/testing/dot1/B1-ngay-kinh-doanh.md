# B1 — Ngày kinh doanh

Báo cáo A04, Excel và phiếu cuối ngày cắt theo giờ bắt đầu ngày của quán. Mặc định 00:00 thì mọi thứ như cũ.

## Trước khi test

- **Controller áp mig 111 (`supabase/migrations/111_business_day.sql`) lên prod và deploy Vercel trước.** Chưa áp thì nút lưu ở bài 2 báo lỗi và không có nhãn khoảng giờ.
- Test trên **Bia lẩu Bảo Lương**, làm **buổi sáng trước 12:00**, vì giờ bắt đầu chỉ chọn được tới 12:00.
- Cần hai tài khoản: chủ quán và thu ngân.
- **Xong phải đặt lại 00:00 (bài 8).**

Giờ bắt đầu ngày nằm ở ⚙ Cài đặt → Cài đặt chung → khối **Ngày kinh doanh**, ngay trên "Quy trình vận hành".

## Bài 1. Quán để 00:00

1. Khối Ngày kinh doanh hiện `00:00`, nút Lưu đang tắt.
2. Mở Báo cáo (A04): số tiền và số bill hôm nay đúng như trước khi áp mig. Ghi lại Tổng thực thu để so ở bài 4.
3. Đầu trang chỉ có ngày và "Hôm nay", **không có** dòng khoảng giờ.
4. Xuất Excel: sheet Tổng hợp **không có** dòng "Khoảng giờ", số khớp màn hình.
5. In báo cáo cuối ngày: **không có** dòng khoảng giờ dưới "Ngày …", số khớp màn hình.

## Bài 2. Đặt giờ muộn hơn giờ hiện tại

Ví dụ đang 10:20 thì đặt 11:00.

1. Chọn giờ, bấm **Lưu giờ bắt đầu ngày**. Không báo lỗi, nút Lưu tắt lại.
2. Mở A04: tiêu đề là **ngày hôm trước**, vẫn có nhãn "Hôm nay".
3. Cạnh tiêu đề có nhãn khoảng giờ, ví dụ `11:00 05/11 – 11:00 06/11`.
4. Ô chọn ngày **không chọn được** ngày lịch hôm nay.

## Bài 3. Đặt giờ sớm hơn giờ hiện tại

Ví dụ đang 10:20 thì đặt 05:00.

1. Lưu, mở lại A04: tiêu đề về **ngày lịch hôm nay**, có nhãn "Hôm nay" và nhãn khoảng giờ `05:00 … – 05:00 …`.
2. Quay lại đặt giờ như bài 2 để làm tiếp bài 4, 5, 6.

## Bài 4. Excel và phiếu cuối ngày cùng số với màn hình

Giữ cài đặt của bài 2.

1. Xuất Excel: sheet Tổng hợp có dòng **Khoảng giờ** ngay dưới **Ngày**, ngày và Tổng thực thu khớp màn hình.
2. In báo cáo cuối ngày: dưới "Ngày …" có dòng khoảng giờ, ngày và Tổng thực thu khớp màn hình.

## Bài 5. Thu ngân

Giữ cài đặt của bài 2, đăng nhập thu ngân.

1. Mở A04: cùng ngày, cùng nhãn khoảng giờ, cùng số với chủ quán.
2. Không thấy khối Ngày kinh doanh. Gõ thẳng `/admin/settings` thì bị chuyển đi.

## Bài 6. Gõ tay ngày trên URL

Giữ cài đặt của bài 2.

1. Gõ `/admin/bills?date=<ngày lịch hôm nay>`: trang kẹp về ngày kinh doanh, tức ngày hôm trước.
2. Gõ `/admin/bills/export?date=<ngày lịch hôm nay>`: file Excel ra ngày kinh doanh, không phải ngày lịch.

## Bài 7. Những phần không đổi

Giữ cài đặt của bài 2.

1. POS Timeline vẫn đúng giờ thật, các bàn đang có khách hiện bình thường.
2. Đặt bàn: danh sách và lịch 7 ngày như cũ.
3. Giờ phục vụ: Mini App mở và chặn đặt đúng theo giờ phục vụ cũ.

## Bài 8. Đặt lại 00:00

1. Chọn `00:00`, lưu.
2. Mở A04: về ngày lịch, không còn nhãn khoảng giờ, số khớp với bài 1.
