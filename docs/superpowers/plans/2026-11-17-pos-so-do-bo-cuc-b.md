# POS tab Sơ đồ — Bố cục B "Màn quầy" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa tab Sơ đồ theo góp ý test tay của anh Tú: ô to có dải tên khu, cột phải cố định, bấm bàn trống ra gọi món ngay, ghép bàn trống bằng chế độ riêng.

**Architecture:** Chỉ đổi UI trong `admin-web/app/admin/pos/` + bảng màu khu `lib/area-colors.ts` + hàm thuần `lib/pos-grid-tile.ts`. Không đổi server action / DB. Ghép mâm dùng lại `createTraySession` và nhánh "≥2 bàn trống" sẵn có.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 (class phải là chuỗi nguyên vẹn, không ghép động), vitest (component test bằng `renderToStaticMarkup`, KHÔNG có jsdom), Playwright e2e trên Bảo Lương prod.

**Spec:** `docs/superpowers/specs/2026-11-17-pos-so-do-ban-design.md` — khối **"Bố cục B"** đầu §5.2 là luật cao nhất; chỗ nào bố cục A / §5.5 cũ mâu thuẫn thì B thắng. Mockup: `docs/superpowers/specs/2026-11-17-pos-so-do-1920-mockup.html` (cỡ "To", "Dải màu có tên khu").

## Global Constraints

- Màn đích 1920×1080. Màn nhỏ hơn chỉ cần không cuộn ngang trang.
- Ô: `minmax(156px, 1fr)`, cao 128px, khe 10px; tên bàn 18px đậm, tiền 17px đậm, giờ ngồi / Mâm / nhãn trạng thái 14px.
- Dải khu: cao 22px, hết bề ngang ô, nền `-100`, chữ `-800` in hoa 12px đậm, gạch đáy 3px `-400`; chưa phân khu = dải xám nhạt chữ "Chưa phân khu". Bỏ chấm màu khu. Vạch trái giữ cho màu mâm.
- Text UI tiếng Việt, comment tiếng Việt cho logic khó.
- Không đổi server action, RPC, DB. Không `test.skip` (hook chặn).
- Không chạy lệnh shell có chuỗi `.claude` (hook chặn) — dùng đường dẫn tương đối từ thư mục worktree.
- Không đọc / in `.env*`.

## Review Focus

- Bàn trống vừa có khách (QR) đúng lúc thu ngân bấm → hộp thoại gọi món mở trên bàn đã có phiên: phải giống luồng Khách lẻ hiện tại (server từ chối thì báo lỗi, không mở phiên trùng).
- Chế độ Ghép bàn trống mà bàn đã chọn bị khách QR chiếm → bàn đó tự rơi khỏi danh sách chọn (`effectivePickedTables` sẵn có), không gửi lên `createTraySession`.
- Đang mở bill rồi bấm "Ghép bàn trống" → bill đóng, cột phải sang bảng ghép; thoát ghép → về Việc cần xử lý.
- Gộp bill và Ghép bàn trống không bao giờ bật cùng lúc; Sắp xếp bàn / chọn bàn cho đặt bàn thì ẩn nút Ghép bàn trống.
- Tên khu dài / tên bàn dài: dải và tên `truncate` + `title`, không đẩy vỡ ô.

---

### Task 1: Ô To + dải tên khu

**Files:**
- Modify: `admin-web/lib/area-colors.ts` (thêm trường `band` cho 5 màu + hằng `NO_AREA_BAND`)
- Modify: `admin-web/app/admin/pos/floor-grid.tsx` (ô, lưới), `admin-web/app/admin/pos/pos-client.tsx` chỉ chỗ truyền màu khu xuống lưới nếu cần
- Test: `admin-web/app/admin/pos/floor-grid.test.tsx`, `admin-web/lib/area-colors.test.ts` (tạo nếu chưa có)

**Interfaces:**
- Produces: `AREA_COLORS[i].band: string` — chuỗi Tailwind nguyên vẹn, vd violet: `'bg-violet-100 text-violet-800 border-b-[3px] border-b-violet-400'` (tương tự indigo / purple / fuchsia / pink). `NO_AREA_BAND = 'bg-slate-100 text-slate-600 border-b-[3px] border-b-slate-300'`.
- Ô nhận tên khu + class dải thay cho `areaDot`. Giữ nguyên mọi `data-*`, `aria-label`, `title` mà e2e đang dùng (`data-table-id`, `data-visual-state`, aria-label "`<tên>: <trạng thái>`", "Đang gọi nhân viên").

- [ ] **Step 1: Test thất bại** trong `floor-grid.test.tsx`: lưới có `minmax(156px, 1fr)` và `gap` 10px; ô có `h-[128px]`; ô bàn thuộc khu "Sân vườn" màu violet render dải chứa chữ "Sân vườn" với class `bg-violet-100` và `border-b-violet-400`, có `title="Sân vườn"`; ô bàn chưa phân khu render dải "Chưa phân khu" với `bg-slate-100`; không còn chấm `size-[7px]`; tên bàn có `text-[18px]`, tiền `text-[17px]`; ô vừa chờ duyệt vừa gọi NV vẫn có đủ "Chờ duyệt · 2" và icon aria-label "Đang gọi nhân viên". `area-colors.test.ts`: mỗi màu có `band` chứa `bg-<key>-100`, `text-<key>-800`, `border-b-<key>-400`.
- [ ] **Step 2:** `npm --prefix admin-web test -- floor-grid area-colors` → FAIL.
- [ ] **Step 3: Cài đặt.** Dải là phần tử đầu trong nút ô, `aria-hidden` (aria-label của nút đã đủ — KHÔNG thêm tên khu vào aria-label để không vỡ e2e), `truncate`, `uppercase`, `text-[12px] font-bold`, `h-[22px]`, chạy sát mép (ô `overflow-hidden`, dải âm lề hoặc đặt ngoài vùng đệm). Bốn dòng nội dung (tên · tiền · giờ ngồi + Mâm · nhãn trạng thái) dưới dải, không chữ nào bị cắt ở 156px. Quyết định 8 (chờ duyệt + gọi NV → chỉ icon chuông) giữ nguyên.
- [ ] **Step 4:** test file trên PASS; `npm --prefix admin-web test` toàn bộ PASS; `npx --prefix admin-web tsc --noEmit -p admin-web` 0 lỗi; `npm --prefix admin-web run lint` không thêm lỗi.
- [ ] **Step 5: Commit** `feat: POS Sơ đồ ô To 156×128 + dải tên khu ở đỉnh ô`

### Task 2: Cột phải cố định, bấm bàn trống ra gọi món, chế độ Ghép bàn trống

**Files:**
- Modify: `admin-web/app/admin/pos/pos-client.tsx`, `admin-web/app/admin/pos/bill-panel.tsx`, `admin-web/lib/pos-grid-tile.ts` (+ `.test.ts`), hộp thoại chọn món (`ManualOrderSheet`, tìm file bằng grep) để nhận dòng nhắc
- Test: `admin-web/lib/pos-grid-tile.test.ts`, `admin-web/app/admin/pos/free-table-panel.test.tsx` (sửa / thay), test component mới cho bảng ghép + dòng nhắc

**Interfaces:**
- `gridTileAction` thêm tham số `freeMerge: boolean` trong context và kết quả mới:
  - bàn trống, không `freeMerge`, không modifier → `{ kind: 'order-free', tableId }`
  - bàn trống + modifier (ngoài Gộp bill) → `{ kind: 'pick-free', tableId, enterFreeMerge: true }`
  - `freeMerge` bật: bàn trống → `{ kind: 'pick-free', tableId, enterFreeMerge: false }`; bàn có phiên / bàn đang giữ → `{ kind: 'none' }`
  - Gộp bill (`mergeMode`) và chọn bàn cho đặt bàn: giữ nguyên như hiện tại.
- `ManualOrderSheet` thêm prop tuỳ chọn `notice?: string | null` hiện một dòng vàng dưới tiêu đề.

- [ ] **Step 1: Test thất bại** cho `gridTileAction` theo bảng trên (đủ 6 nhánh: trống thường, trống + Ctrl, trống trong freeMerge, có phiên trong freeMerge, đang giữ trong freeMerge, có phiên thường vẫn `session`). Test component: bảng ghép với 0 / 1 / 2 bàn — tiêu đề "Ghép bàn trống thành một mâm", nút "Ghép thành một mâm" disabled khi <2, có "Thoát ghép bàn"; `ManualOrderSheet` với `notice` hiện đúng chữ, không có `notice` thì không có dòng vàng.
- [ ] **Step 2:** chạy các test đó → FAIL.
- [ ] **Step 3: Cài đặt.**
  - Bỏ `workDrawerOnly` và mọi nhánh của nó: aside Việc cần xử lý ở tab Sơ đồ cư xử y như Timeline (cột cố định từ `xl` khi `panel === 'work'`, sheet dưới `xl`); nút "Việc cần xử lý" lại `xl:hidden`. Giữ nhánh `view === null ? 'hidden'` (không chớp khi tải lại). Giữ dải đỏ bàn hết hạn còn nợ.
  - `order-free` → `setWalkIn({ step: 'menu', tableId, tableNumber })`, tiêu đề hộp thoại "`<tên bàn>` · Gọi món" khi mở từ lưới (nút Khách lẻ giữ "Khách lẻ · …"); nếu bàn có `laterReservationAt` (từ `moveTargets`) truyền `notice` "Bàn này có khách đặt lúc HH:mm. Vẫn mở bàn được, nhớ báo khách." Đồng thời bỏ chọn bill / đặt bàn đang mở như `pickFreeTable` đang làm.
  - Bỏ panel `'free'`, `pickedFreeTable(Info)`, nhánh 1 bàn trống trong `bill-panel.tsx`, prop `freeTable` / `onWalkInTable` / `onBookTable` / `reservationsEnabled` của bill panel nếu không còn ai dùng, tuỳ chọn `nonModal` của `Khung` nếu không còn ai dùng. Xoá / viết lại `free-table-panel.test.tsx` cho đúng.
  - State `freeMerge` (boolean). Nút "Ghép bàn trống" (icon `Layers` hoặc tương đương) ở thanh trên cạnh nút Gộp bill, chỉ khi `view === 'floor'`, `freeTables.length >= 2`, không `arrange` / `reservationPick` / `mergeMode` / `freeMerge`. Bấm: `dongBill()`, bỏ chi tiết đặt bàn, `setWorkOpen(false)`, bật `freeMerge`. `beginMerge` (Gộp bill) tắt `freeMerge`. Rời tab Sơ đồ, vào Sắp xếp bàn, vào chọn bàn cho đặt bàn → tắt `freeMerge` + bỏ chọn.
  - Khi `freeMerge`: dải trạng thái kiểu `mergeMode` ("Đang ghép bàn trống: bấm các bàn trống để chọn · đã chọn N"); ô không phải bàn trống mờ + không bấm được (dùng `disabledReason` sẵn có của ô, lý do "Đang ghép bàn trống"); cột phải là bảng ghép (panel mới, ưu tiên ngang 'bill', ngay sau 'reservation'): danh sách bàn đã chọn, "Ghép thành một mâm" (gọi `createTraySession([...effectivePicked])` như `onCreateTray` hiện tại, xong thì tắt `freeMerge` + bỏ chọn), "Thoát ghép bàn". Có thể dùng lại nhánh "Đã chọn N bàn trống" của `bill-panel.tsx` nếu sửa cho đủ 0/1/≥2.
  - Ô bàn trống đã chọn trong `freeMerge` có viền cam (thứ tự viền §5.3 giữ nguyên).
- [ ] **Step 4:** test file trên PASS; `npm --prefix admin-web test` toàn bộ; tsc 0 lỗi; lint không thêm lỗi.
- [ ] **Step 5: Commit** `feat: POS Sơ đồ cột phải cố định, bấm bàn trống ra gọi món, chế độ Ghép bàn trống`

### Task 3: E2E + checklist + tài liệu

**Files:**
- Modify: `admin-web/e2e/pos-so-do.spec.ts`, `admin-web/playwright.config.ts` (nếu cần đổi project), `docs/testing/pos-so-do-ban/POS-SO-DO-BAN.md`, `docs/decisions.md` (1 dòng cuối bảng chính)

- [ ] **Step 1: Sửa e2e cho bố cục B:** bỏ các bài đo 43/43 ở 1366 và bài "1366 chưa chọn gì không có cột phải"; thêm 1920×1080: thấy đủ 43/43 ô khi chưa chọn bàn VÀ cột phải "Việc cần xử lý" đang hiện; hàng lọc ở 1920 có cột phải không xuống dòng (cao hơn ~1 dòng thì chuyển nút Sắp xếp bàn lên thanh trên — sửa code + test); ô có dải tên khu "Khu E2E"; bấm bàn trống → hộp thoại "`<bàn>` · Gọi món" mở ngay → chọn món → gửi → bill hiện ở cột phải (ghi bàn vào `touchedTableIds` TRƯỚC khi gửi như hiện nay); "Ghép bàn trống" → bấm 2 bàn trống → "Ghép thành một mâm" bấm được (KHÔNG bấm) → "Thoát ghép bàn"; Ctrl+bấm bàn trống vào chế độ ghép; bài "Đặt bàn cho bàn này" đổi thành tạo đặt bàn qua "Đặt bàn mới" chọn bàn đó (hoặc seed đặt bàn bằng service key theo id đã ghi, dọn sau) rồi kiểm ô "Đặt HH:mm" + bấm mở chi tiết; bài tablet 1024 đổi sang luồng Ghép bàn trống hoặc bỏ nếu chỉ trùng 1920; phone chỉ kiểm không cuộn ngang. Không `test.skip`.
- [ ] **Step 2:** bật dev server worktree trước (cổng 3000 có thể bị worktree khác chiếm → `E2E_BASE_URL`), chạy `npm --prefix admin-web run e2e` → PASS hết; kiểm DB sạch theo id đã ghi.
- [ ] **Step 3:** Checklist: bỏ T3 (giữ ý 3.4 "tải lại không chớp" chuyển vào T1); T1 viết lại cho màn quầy 1920 (đọc từ 1m, phân biệt khu bằng dải, chữ không cắt); T2 bỏ máy tính bảng, giữ "Gộp bill" + thêm "Ghép bàn trống" bằng chạm nếu màn quầy cảm ứng; T5 đổi bước 5.1 thành bấm bàn trống → gọi món → gửi; T6.1 kiểm dòng vàng trong hộp thoại gọi món; bảng "Đã tự động" theo e2e mới + số đo. Ghi T4/T5/T6 đã PASS 2026-11-17 cho phần không đổi.
- [ ] **Step 4:** `docs/decisions.md`: MỘT dòng — bố cục B màn quầy 1920 (ô To + dải tên khu, cột phải cố định, bấm bàn trống ra gọi món, Ghép bàn trống), lý do (MEVO tư vấn phần cứng, POS chỉ một máy).
- [ ] **Step 5: Commit** `test: e2e POS Sơ đồ bố cục B` + `docs: checklist POS Sơ đồ bố cục B`
