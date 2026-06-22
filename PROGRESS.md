# MEVO — Tiến độ dự án

> Cập nhật: **22/06/2026**. So sánh tiến độ hiện tại với mục tiêu ban đầu (xem [CLAUDE.md](CLAUDE.md)).
> File này là bản theo dõi sống — cập nhật mỗi khi có mốc mới.

---

## 0. Bước ngoặt hướng đi — 22/06/2026

Sau trao đổi với tổng đài ZaloPay Merchant + nghiên cứu giới hạn thanh toán của Zalo Mini App, **chốt lại mô hình sản phẩm**:

- **Mỗi quán = một mini-app riêng + một merchant ZaloPay riêng** (multi-instance), bỏ ý "một app đa quán". Lý do: Zalo Mini App khoá thanh toán mượt về **một merchant/app** → muốn vừa mượt 1-2 chạm, vừa cho tiền về thẳng quán, vừa để MEVO không phải làm trung gian giữ tiền (tránh giấy phép NHNN) thì buộc phải 1-app-1-merchant.
- **Kiến trúc Core + Theme runtime (kiểu WordPress):** một bộ code lõi dùng chung, nhân bản thành N mini-app; theme/menu/banner đọc từ DB lúc chạy (đổi không cần build lại); chỉ nâng cấp lõi mới rebuild + deploy lại N app qua pipeline.
- **MEVO là đơn vị làm + vận hành mini-app cho quán**, không phải ví điện tử.
- **v1: mọi thay đổi (theme/menu/banner) do MEVO thực hiện** — quán chưa tự phục vụ (hoãn sang phase sau).
- 📄 Spec: [docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md](docs/superpowers/specs/2026-06-22-mevo-core-theme-architecture-design.md)

**Không ảnh hưởng timeline pilot:** Phở Gà Pubu vẫn go-live cash-first; phần per-store ZaloPay + tách theme/pipeline làm khi sẵn sàng (chi tiết mục 8 spec).

---

## 1. Mục tiêu ban đầu

Nền tảng **QR Order SaaS cho quán ăn Việt Nam, chạy trên Zalo Mini App**: khách quét QR → chọn món → thanh toán ZaloPay 1 chạm → bếp nhận đơn realtime → khách nhận thông báo qua Zalo. **MVP pilot 2–3 quán quen** (Phở Gà Pubu + quán nhậu Lào Cai).

---

## 2. Tiến độ tổng quan

| Khối | Trạng thái | % |
|---|---|---|
| Backend (Supabase: DB, realtime, edge functions) | ✅ Hoàn thành | 100% |
| Mini App khách (menu, giỏ, đặt đơn, theo dõi realtime) | ✅ Hoàn thành | 100% |
| Kitchen Display (bếp realtime + chuông) | ✅ Hoàn thành | 100% |
| Admin Web (login, menu, bàn/QR, đơn, doanh thu) | ✅ Hoàn thành | 100% |
| Thanh toán **Tiền mặt** | ✅ Hoàn thành + test | 100% |
| Thanh toán **ZaloPay** | 🟡 Code xong + verify, chờ ZaloPay duyệt merchant | 90% |
| Thông báo **ZNS** (Zalo OA) | 🟡 Đã code, chờ kiểm thử production | 80% |
| Deploy (Vercel + Zalo Mini App) | 🟡 Đã deploy bản Testing, chờ publish production | 80% |
| **Pilot thực tế tại Phở Gà Pubu** | 🔴 Chưa bắt đầu | 0% |

---

## 3. Đã hoàn thành (mốc chính)

- **Sprint 0–4** (PASS): schema + RLS + seed data; Mini App menu/giỏ/đặt đơn/theo dõi realtime; Kitchen Display 3 cột + chuông; Admin Web đầy đủ.
- **Deploy**: Admin Web lên Vercel (`mevo-tau.vercel.app`); Mini App lên Zalo (bản Testing, version 5).
- **Tiền mặt**: chạy trọn vẹn, đã test đầu-cuối (đặt → bếp → xong → đánh dấu đã thu).
- **ZaloPay → Zalo Checkout SDK**: phát hiện mô hình openapi cũ không chạy trên SDK 2.49.4; đã chuyển sang `Payment.createOrder`. Viết mới `checkout-create-mac` + `checkout-notify`; **MAC tạo đơn đã được Zalo chấp nhận** (sheet ZaloPay mở được trên máy thật); verify đầy-đủ các nhánh (mac sai / sai số tiền / thành công / thất bại / idempotent).
- **Bảo mật**: vá lỗ hổng RLS (anon không thể tự xác nhận đơn `confirmed` — chỉ server qua callback). Số tiền lấy từ DB, không tin client (chống sửa giá).

---

## 4. Việc còn lại để go-live

| # | Việc | Phụ thuộc | Ưu tiên |
|---|---|---|---|
| 1 | **Publish Mini App** (submit Zalo duyệt) để khách ngoài tester dùng được | Zalo duyệt | Cao |
| 2 | (Khuyến nghị) **Ẩn nút ZaloPay**, ra mắt **cash-only** trước | — | Cao |
| 3 | **Pilot tại Phở Gà Pubu**: lắp tablet bếp, dán QR bàn, tập nhân viên | Thiết bị tại quán | Cao |
| 4 | **ZaloPay production**: ZaloPay duyệt hồ sơ merchant → điền keys vào dashboard Zalo → đổi 1 secret method id | ZaloPay duyệt (ngoài tầm) | Trung bình |
| 5 | **Kiểm thử ZNS production** (thông báo Zalo thật tới khách) | Zalo OA | Trung bình |
| 6 | **Pilot quán thứ 2** (quán nhậu Lào Cai) | Sau khi quán 1 ổn | Thấp |

---

## 5. Đánh giá so với mục tiêu ban đầu

- **Phần mềm cốt lõi: ~95% xong.** Toàn bộ luồng kỹ thuật (đặt món → bếp → thông báo, cả tiền mặt lẫn ZaloPay) đã code và kiểm thử.
- **Điểm khác biệt với kế hoạch:** ZaloPay phải làm lại theo **Checkout SDK** (không phải openapi như dự tính ban đầu) — đã xong, chỉ chờ thủ tục duyệt merchant của ZaloPay (yếu tố ngoài tầm kiểm soát).
- **Nút thắt hiện tại KHÔNG phải kỹ thuật** mà là 2 thủ tục bên ngoài: (1) Zalo duyệt publish Mini App, (2) ZaloPay duyệt merchant. → Có thể **ra mắt pilot bằng tiền mặt ngay** mà không cần chờ.

---

## 6. Rủi ro / phụ thuộc

- **Internet tại quán**: cả hệ thống phụ thuộc mạng realtime — cần WiFi ổn định + 4G dự phòng.
- **Thời gian duyệt của Zalo / ZaloPay**: không chủ động được, nên không để nó chặn pilot.
- **Tài khoản test ZaloPay sandbox**: ví sandbox demo lỗi xác thực — đã chuyển hướng sang merchant thật.
