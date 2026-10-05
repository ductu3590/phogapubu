# Mini App Stitch — MA-4 (Chọn món trước m04 + Xác nhận m05 + rà soát cuối) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Đặt món trước khi đến (m04) và xác nhận gửi (m05) theo ngôn ngữ mới, sửa 2 lỗi sẵn có của trang xác nhận, rồi rà toàn bộ app ở 360/390.

**Architecture:** Dùng lại `ProductCard`, `CategoryChips`, `SectionHeading`, `SectionCard`, `StickyActionBar`, `ConfirmSheet`, `matchesQuery`, `pickProductLayout`. Logic giỏ món đặt trước (`preorder-cart.store`) và `submitPreorder` giữ nguyên; thêm ghi chú (`p_note`, server lưu `orders.note`, POS in "Ghi chú đơn").

**Spec:** `docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md` §4 MA-4.

## Global Constraints
Như MA-1..3. Chỉ kiểm trên Bảo Lương. Không `window.alert/confirm`.

## Lỗi sẵn có phải sửa
1. `preorder-checkout.tsx`: tiền từng dòng = `basePrice × SL` (bỏ topping) trong khi tổng có topping → dùng `calculateCartItemPrice` (utils/cart) cho cả dòng lẫn tổng.
2. Câu lỗi server bị che (`cause instanceof Error`) → `errorMessage()`.

## Review Focus
1. Món có loại/topping trong món đặt trước → dòng + tổng khớp nhau. Test hàm tổng.
2. Bấm "Khoá & gửi" 2 lần nhanh → chỉ gửi 1 lần (requestId idempotent + nút khoá).
3. Đặt bàn chưa xác nhận / hết hạn chọn món → trang báo rõ, không hiện menu.
4. Ghi chú > 1000 ký tự → chặn ở ô nhập.
5. Giỏ món đặt trước rỗng mà vào thẳng /checkout → không gửi, có nút quay lại chọn món.

### Task 1: `preorderTotals(items)` (+test) — dòng + tổng dùng `calculateCartItemPrice`.
### Task 2: Trang Chọn món trước m04 — thẻ lịch hẹn (tên, giờ, số khách), ô tìm + chip dính, `ProductCard` lưới/danh sách, thanh tối "N món đặt trước · tổng · Xem món đặt trước"; trạng thái không chọn được món → `CenterState` + nút về chi tiết đặt bàn. Route: `hideBottomTabs`, title "Chọn món đặt trước".
### Task 3: Trang Xác nhận m05 — thẻ lịch hẹn · thẻ cảnh báo "chỉ gửi MỘT lần, gửi xong không sửa trên app" · danh sách món (loại/topping, `×SL · tiền`, nút −/+) · ô ghi chú cho bếp (≤1000) · tạm tính + dòng thanh toán theo `paymentTiming` · `StickyActionBar` "Khoá & gửi món đặt trước" → `ConfirmSheet` → gửi → snackbar + về chi tiết đặt bàn (replace).
### Task 4: Rà soát cuối — chụp 360/390 mọi màn cả hai lối vào; sửa lỗi lộ ra; checklist `MA-4.md`; reviewer độc lập toàn MA-4; dừng chờ `MA-4 PASS`.
