# Dọn POS cũ — xoá /admin/cashier (bước cuối Pha 3)

Nhánh `feat/pos-timeline`. Sau POS-1..4 PASS (2026-10-03).

## Đã làm

| Việc | Chi tiết |
|---|---|
| Xoá trang | `/admin/cashier` (page + cashier-client + bill cũ + dải Đơn mới + khối đặt bàn cũ + test của chúng) |
| Chuyển file dùng tiếp sang `app/admin/pos/` | Sơ đồ bàn (floor-map, area-controls, use-floor-layout), sheet ghi tay, sheet từ chối, khối món đặt trước, trạng thái chọn bàn đặt trước, **trang in `print-order`** (+ test) — chuyển bằng `git mv`, giữ lịch sử |
| Khối Gọi nhân viên của màn nhân viên | `app/staff/tables/service-request-queue.tsx` (chỉ `/staff/tables` còn dùng) |
| Đường dẫn in | `/admin/pos/print-order?id=…` / `?job=…` |
| Menu trái | Còn một mục **Thu ngân (POS)** → `/admin/pos` |
| URL cũ | `/admin/cashier` và `/admin/cashier/print-order?...` **chuyển hướng** về trang mới (giữ nguyên tham số) — dấu trang / máy thu ngân đang mở URL cũ vẫn chạy |
| Trang Đặt bàn | Nút "mở phiên" giờ đưa sang `/admin/pos` |

Không đổi API / RPC / database. Build production qua; 422 test qua.

## Test

1. Menu trái chỉ còn **Thu ngân (POS)**, bấm vào mở trang Timeline.
2. Gõ tay `/admin/cashier` → tự sang `/admin/pos`.
3. Duyệt một lượt món → tab in mở `/admin/pos/print-order?id=…`, in đủ 2 liên.
4. In món đặt trước (Việc cần xử lý → Món đặt trước) → phiếu in mở đúng.
5. `/staff/tables` (nhân viên): khối Gọi nhân viên vẫn hiện + Đã xử lý chạy.
6. Trang Đặt bàn → đặt bàn đã đến → nút mở phiên đưa về `/admin/pos`.

**→ Báo:** `CLEANUP PASS`
