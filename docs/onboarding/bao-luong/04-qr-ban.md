# 04 — QR dán bàn

20 bàn, mỗi bàn một QR riêng. Khách quét bằng **camera Zalo** → Mini App mở đúng bàn đó.

## ⚠️ Đọc trước: khi nào mới được in QR chính thức

QR do MEVO sinh có dạng `https://zalo.me/s/<AppID>/?store=bia-lau-bao-luong&table=<id bàn>`.

- Khi app đang ở bản **Testing / Development**, link phải kèm thêm `env` và `version` — QR "trơn" **không mở được** ở bản này.
- Khi Zalo **duyệt Publish**, QR trơn mới mở được cho **mọi khách**.
- Biến `NEXT_PUBLIC_ZALO_ENV` và `NEXT_PUBLIC_ZALO_VERSION` trên Vercel **dùng chung mọi quán**. Khi Publish xong phải để **trống cả hai**, rồi mới in QR để dán. (Pubu đang tạm dừng nên đổi được; nếu Pubu chạy lại thì cân nhắc trước khi đổi.)
- Mini App Bảo Lương **chưa xác thực giấy tờ** ở thời điểm ghi chép trước: nếu Zalo vẫn chưa xong, **người ngoài chưa vào được**.

**Tóm lại: in thử 1–2 bàn ngay, nhưng chỉ in cả 20 bàn sau khi Publish được duyệt và hai biến Vercel đã để trống.**

## In QR (chủ quán / anh Tú)

1. Đăng nhập **chủ quán** → `Thêm → Bàn & QR`.
2. Thấy đủ 20 bàn, chia theo khu (màu nhận diện khu). Nếu bàn chưa có khu, tạo khu trước (`Tuỳ chỉnh khu`).
3. Nút **In QR hàng loạt** → chọn *Cả quán* / một khu / một bàn → mở trang in **A4, 3×4 thẻ mỗi trang**.
4. In → cắt rời. Mỗi thẻ ghi **tên bàn + khu** và mã QR.
5. Thiếu thẻ nào, in lại riêng bàn đó (chọn *một bàn*).

Cách khác: tải từng QR PNG ở cùng màn hình.

## Giấy và độ bền (quán nhậu vỉa hè — dễ ướt, dầu mỡ)

- In **giấy decal** hoặc giấy ảnh bóng, **ép plastic (cán màng)** hai mặt, hoặc dán trong **kệ mica để bàn**.
- Kích thước thẻ tối thiểu ~**7 × 7 cm** cho QR để camera quét nhanh ngoài sáng yếu.
- **Dán vị trí cố định** ở mép bàn phía khách ngồi, không dán ở chỗ nướng/lẩu nóng, không dán chỗ hay có nước đổ.
- Quán nhậu: cân nhắc dán **2 thẻ trên cùng một bàn dài** (hai đầu) để khách ngồi xa vẫn quét được. Cùng bàn thì QR giống nhau, không sao.
- Ghi dòng chữ gợi ý: **"Quét QR bằng Zalo để gọi món"** + biểu tượng Zalo.

## Kiểm sau khi dán (người đi từng bàn)

Dùng 1 điện thoại có Zalo, đi từng bàn:

| Bàn | Quét mở đúng tên bàn? | Thẻ còn nguyên? | Ghi chú |
|---|---|---|---|
| Bàn 1 | ☐ | ☐ | |
| Bàn 2 | ☐ | ☐ | |
| … | | | |
| Bàn 20 | ☐ | ☐ | |

Nếu quét ra **bàn khác** hoặc báo lỗi: dừng, chụp màn hình gửi anh Tú. Không tự dán chéo thẻ.

## Khách quét lần đầu thấy gì?

1. Zalo hỏi cho phép Mini App dùng thông tin → bấm đồng ý.
2. Hiện thực đơn quán, đầu trang ghi **Bàn mấy**.
3. Chọn món → **Gọi món** (không có bước thanh toán, đây là quán trả sau).
4. Gọi thêm lần sau thì cộng vào cùng bill.

## Lưu ý đặc biệt của trả sau (nói thẳng với chủ quán)

- **Người lạ chụp QR bàn có thể đặt từ xa.** Không phần mềm nào chặn hoàn toàn khi chưa thu tiền trước. MEVO giảm thiệt hại bằng: **thu ngân phải duyệt** mọi lượt trước khi in vào bếp, bàn lẻ **chỉ một người** (chủ phiên) gọi được, và có thể bấm **Từ chối** lượt lạ.
- Thu ngân thấy lượt gọi nghi ngờ (bàn đang trống mà có đơn) → **từ chối**, hoặc ra bàn hỏi.
- Tạm nghỉ: `Cài đặt → Tạm nghỉ nhận đơn` chặn mọi đơn ngoài giờ.
