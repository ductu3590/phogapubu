# Mini App — chữ "Lưu ý quan trọng" khi đặt món trước (2026-11-19)

Chỉ đổi chữ ở màn **Xác nhận món đặt trước** (`mini-app/src/pages/reservations/preorder-checkout.tsx`), mọi quán.
Không đổi luật: món đặt trước vẫn khoá sau khi gửi (mig 071).

**Test 1.** Mini App → tab Đặt bàn → mở một đặt bàn còn hiệu lực → Chọn món đặt trước → thêm 1 món → sang màn xác nhận.
Khối vàng "Lưu ý quan trọng" ghi đúng:

> Món đặt trước khi gửi đi sẽ không sửa, huỷ được trên ứng dụng. Quý khách muốn thay đổi vui lòng liên hệ hotline quán.

Không bấm gửi nếu không muốn tạo món đặt trước thật.

**Test 2.** Cùng màn đó: nút dưới đáy ghi **"Xác nhận"** (thay "Khoá & gửi món đặt trước"). Bấm → hộp "Gửi món đặt trước?"
có nút **"Xác nhận"** (thay "Khoá & gửi") và "Xem lại". Bấm "Xem lại" để đóng nếu không muốn gửi thật.
