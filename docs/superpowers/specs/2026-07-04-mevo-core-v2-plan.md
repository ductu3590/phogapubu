# MEVO Core v2.0 — Kế hoạch nâng cấp: Wifi menu + Loa đọc đơn + Vòng quay

> **Dành cho Claude Code thực hiện.** Đọc `CLAUDE.md` trước. Làm tuần tự Sprint 1 → 2 → 3.
> **BẮT BUỘC:** xong mỗi Sprint phải DỪNG, bổ sung checklist vào **`TESTING-V2.md`**
> (file MỚI ở gốc repo — tạo ở Sprint v2.1, KHÔNG viết thêm vào `TESTING.md` cũ vì đã quá dài;
> giữ nguyên cấu trúc/format của TESTING.md cũ), báo
> *"Xong rồi anh, test theo TESTING-V2.md — Sprint vX.Y nhé"* và chờ anh Tú xác nhận PASS
> mới sang Sprint kế. Commit theo format `feat: [mô tả]`.
>
> Ngày lập: 2026-07-04 · Căn cứ: phân tích đối thủ `docs/research/2026-07-04-cola-vn-competitor-analysis.md`
> · Migration hiện tại mới nhất: `023_store_primary_color.sql` → v2 dùng **024, 025**.

## Phạm vi

| Sprint | Tính năng | Đụng tầng nào (theo quy tắc 3 tầng CLAUDE.md §2) |
|---|---|---|
| v2.1 | Wifi trên menu | DB (nội dung runtime) + Core mini-app UI + Admin web|
| v2.2 | Chuông + loa đọc đơn (TTS) Kitchen Display | Chỉ `admin-web` → deploy Vercel, KHÔNG đụng mini-app |
| v2.3 | Vòng quay sau thanh toán | DB + RPC + Core mini-app + Admin |

**Lưu ý deploy xuyên suốt:** Sprint v2.1 và v2.3 sửa core mini-app (`mini-app/src/` trên `main`)
→ sau khi PASS phải đồng bộ từng quán: `cd mini-app-instances/pho-ga-pubu && git fetch origin &&
git merge origin/main` rồi `zmp deploy` từ trong worktree đó. KHÔNG deploy từ `mini-app/` gốc.

---

## Sprint v2.1 — Chia sẻ wifi

**Mục tiêu:** khách quét QR thấy ngay tên + mật khẩu wifi trên menu, bấm là copy — quán khỏi
trả lời "pass wifi gì em" cả trăm lần/ngày. Nội dung per-store đọc runtime từ DB (đổi wifi
không cần build lại app).

### 1. Migration `supabase/migrations/024_store_wifi.sql`

```sql
-- Wifi hiển thị trên menu: NULL = không hiển thị
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS wifi_name     text,
  ADD COLUMN IF NOT EXISTS wifi_password text;
```

Kiểm tra: RLS/quyền đọc `stores` của anon hiện đã cho mini-app đọc profile quán (mig 011 dùng
`about_text` tương tự) — wifi đi cùng đường đó, không cần policy mới. Nếu mini-app đọc store
qua RPC/select có liệt kê cột thì bổ sung 2 cột này vào đúng chỗ đó.

### 2. Admin web — `/admin/settings` (CHỦ QUÁN cấu hình, không phải /mevo)

- File có sẵn: `admin-web/app/admin/settings/settings-client.tsx` — thêm mục **"Cấu hình Wifi"**
  với 2 input "Tên wifi" + "Mật khẩu wifi" cạnh nhóm thông tin quán hiện có.
- Cho phép để trống → mini-app không hiện gì.
- Lưu qua đúng đường update settings hiện tại (đã có RLS store-scoped mig 019, không cần quyền mới).

### 3. Mini-app (core, tầng 1) — CHỈ trang "Nhà hàng" (store-info)

- KHÔNG hiển thị ở trang chủ/menu. Chỉ sửa `mini-app/src/pages/store-info/`:
  thêm dòng **Wifi** ngay DƯỚI mục "Điện thoại", cùng kiểu dáng các dòng hiện có.
- Hiển thị: `📶 {wifi_name} · {wifi_password}` + nút **Sao chép** — bấm là copy mật khẩu
  (API clipboard của zmp-sdk; fallback `navigator.clipboard`), toast "Đã sao chép mật khẩu wifi".
- `wifi_name` NULL/rỗng → không render dòng này.
- Text tiếng Việt, ưu tiên ZaUI component (Snackbar).

### 4. Test checkpoint (ghi vào TESTING-V2.md — Sprint v2.1; tạo file ở sprint này)

1. `/admin/settings` (đăng nhập chủ quán Pubu) nhập wifi → lưu OK.
2. Mở mini-app (KHÔNG build lại) → trang "Nhà hàng" thấy dòng Wifi dưới "Điện thoại".
3. Bấm Sao chép → paste ra đúng mật khẩu, có toast.
4. Trang chủ/menu KHÔNG có wifi ở đâu khác.
5. Xoá trống wifi trong `/admin/settings` → trang "Nhà hàng" không còn dòng Wifi.
6. Chủ quán A không sửa được wifi quán B (RLS).

**DỪNG — chờ PASS.** Sau PASS: merge vào worktree pho-ga-pubu + `zmp deploy`.

---

## Sprint v2.2 — Chuông + loa đọc đơn (TTS) cho Kitchen Display

**Mục tiêu:** quán ồn/không ai nhìn màn hình vẫn biết có đơn: giữ tiếng chuông hiện có, thêm
**giọng đọc tiếng Việt** nội dung đơn. Chỉ sửa `admin-web` → deploy Vercel là xong mọi quán.

### Hiện trạng (đã xác minh 2026-07-04)

`admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx` (~675 dòng) đã có:
- Chuông beep bằng Web Audio API (dòng ~8–11, không cần file ngoài).
- Supabase Realtime: channel `kitchen-{storeId}` (INSERT/UPDATE orders) + channel
  `service-requests-{storeId}`.

### Công nghệ TTS: Web Speech API — MIỄN PHÍ, không API ngoài

- Dùng **Web Speech API** (`window.speechSynthesis`) — API chuẩn **có sẵn trong trình duyệt**,
  chạy hoàn toàn phía client: **0đ, không API key, không gọi server nào, không giới hạn lượt**.
- Giọng đọc lấy từ hệ điều hành của thiết bị: Android/Chrome = giọng Google TTS tiếng Việt
  (có sẵn trên hầu hết máy Android VN); iPad/iPhone Safari = giọng Siri tiếng Việt
  (Cài đặt → Trợ năng → Nội dung được đọc nếu máy chưa tải giọng vi).
- Nhược điểm chấp nhận được: chất lượng giọng tuỳ thiết bị, hơi "máy móc". Nếu sau này muốn
  giọng tự nhiên hơn mới cân nhắc cloud TTS **trả phí** (FPT.AI / Google Cloud TTS / Zalo AI) —
  NGOÀI phạm vi v2, không làm bây giờ.
- Fallback đã tính: thiết bị không có giọng vi-VN → giữ nguyên chuông beep, không lỗi.

### Việc cần làm

1. **Module TTS** (`admin-web/lib/tts.ts` hoặc để cùng file nếu gọn):
   - Dùng `window.speechSynthesis` + `SpeechSynthesisUtterance`, chọn voice `vi-VN`
     (duyệt `getVoices()`, chú ý sự kiện `voiceschanged` load bất đồng bộ).
   - **Hàng đợi tuần tự**: nhiều đơn đến cùng lúc không được đọc chồng tiếng — enqueue,
     đọc xong câu này mới câu kế. Chuông beep kêu trước, đọc sau ~300ms.
   - Fallback: thiết bị không có voice vi-VN → chỉ chuông (không lỗi, không im lặng chuông).
2. **Nội dung đọc:**
   - Đơn mới (INSERT orders đã có tiền/confirmed — giữ đúng điều kiện đang dùng để beep):
     payload realtime chỉ có row `orders` → fetch `order_items` của đơn đó rồi đọc:
     *"Đơn mới, bàn 3: 2 phở gà đặc biệt, 1 nước cam."* (takeaway: *"Đơn mang về..."*).
     Giới hạn đọc tối đa ~4 món, còn lại đọc "và N món khác".
   - Service request: *"Bàn 5 gọi thanh toán"* / *"Bàn 5 cần hỗ trợ"*.
3. **Nút bật/tắt:** toggle 🔊 "Đọc đơn" trên header kitchen, lưu `localStorage`
   (key theo storeSlug). Mặc định TẮT — lần đầu bấm bật chính là user gesture để unlock audio
   (trình duyệt chặn autoplay). Bật xong đọc thử "Đã bật đọc đơn" để xác nhận có tiếng.
4. Không đụng schema, không đụng mini-app.

### Test checkpoint (TESTING-V2.md — Sprint v2.2)

1. Mở `/kitchen/pho-ga-pubu` trên tablet/điện thoại thật (Chrome + Safari) → bật toggle →
   nghe "Đã bật đọc đơn".
2. Đặt 1 đơn thật (2 món) → nghe chuông + đọc đúng bàn, đúng món, đúng số lượng.
3. Đặt 2 đơn sát nhau → đọc lần lượt, không chồng tiếng.
4. Bấm nút gọi nhân viên trên mini-app → nghe "Bàn X gọi thanh toán".
5. Tắt toggle → chỉ còn chuông, không đọc. Reload trang → toggle giữ nguyên trạng thái.

**DỪNG — chờ PASS.** Sau PASS: chỉ cần deploy Vercel.

---

## Sprint v2.3 — Vòng quay sau thanh toán

**Mục tiêu:** khách thanh toán xong được quay thưởng 1 lần/đơn → vui, quay lại quán.
**Nguyên tắc chống gian lận:** kết quả quay do **server quyết định** (RPC), client chỉ chạy
animation dừng đúng ô server trả về. Chỉ đơn CÓ TIỀN THẬT mới được quay (đúng triết lý mig 014:
ZaloPay có `zalopay_trans_id`, hoặc cash đã `paid`).

### ⚠️ Nguyên tắc an toàn — KHÔNG được ảnh hưởng hệ thống hiện tại

Module này phức tạp nhất v2, và không phải quán nào cũng cần, nên thiết kế theo kiểu **cắm thêm,
tắt là như chưa từng tồn tại**:

1. **Feature flag per-store:** cột `stores.spin_enabled boolean DEFAULT false` — **mặc định TẮT
   cho MỌI quán** (kể cả Pubu). Chỉ quán được bật trong `/admin` mới thấy vòng quay.
2. **Không sửa bất kỳ bảng/RPC/luồng hiện có nào:** không ALTER `orders`/`order_items`, không đụng
   RPC tạo đơn, không đụng callback ZaloPay. Toàn bộ là bảng mới + RPC mới + UI mới.
3. **Mini-app gọi `spin_wheel` bọc try/catch:** RPC lỗi/timeout → im lặng bỏ qua, trang
   order-success hiển thị y như hiện tại. Vòng quay chết KHÔNG được làm chết luồng đặt món.
4. **Regression test bắt buộc** (ghi trong checklist): khi `spin_enabled=false`, chạy lại
   trọn luồng đặt món + thanh toán + kitchen như trước v2.3, xác nhận không khác biệt.

### 1. Migration `supabase/migrations/025_spin_wheel.sql`

```sql
-- Feature flag: mặc định TẮT cho mọi quán, chỉ bật trong /admin
ALTER TABLE stores ADD COLUMN IF NOT EXISTS spin_enabled boolean NOT NULL DEFAULT false;

-- Cấu hình phần thưởng per-store
CREATE TABLE spin_rewards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id),
  label      text NOT NULL,              -- 'Giảm 10k đơn sau', 'Tặng 1 trà đá', 'Chúc may mắn lần sau'
  type       text NOT NULL DEFAULT 'gift' CHECK (type IN ('gift','none')),  -- none = không trúng
  weight     int  NOT NULL DEFAULT 1 CHECK (weight > 0),   -- tỉ trọng random
  sort_order int  NOT NULL DEFAULT 0,    -- vị trí ô trên vòng quay
  is_active  boolean NOT NULL DEFAULT true
);

-- Kết quả quay: 1 đơn = tối đa 1 lượt (UNIQUE order_id)
CREATE TABLE spin_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      uuid NOT NULL REFERENCES stores(id),
  order_id      uuid NOT NULL UNIQUE REFERENCES orders(id),
  zalo_user_id  text,
  reward_id     uuid REFERENCES spin_rewards(id),
  reward_label  text NOT NULL,           -- snapshot (phòng quán sửa/xoá reward)
  reward_type   text NOT NULL,
  status        text NOT NULL DEFAULT 'won' CHECK (status IN ('won','redeemed')),
  created_at    timestamptz DEFAULT now(),
  redeemed_at   timestamptz
);
```

- RLS theo đúng pattern store-scoped hiện có (mig 019): operator scope theo `store_id`;
  **anon KHÔNG select/insert trực tiếp** — mọi thứ qua RPC.
- RPC `spin_wheel(p_order_id uuid)` SECURITY DEFINER (theo pattern các RPC anon hiện có,
  lưu ý mục BACKLOG #10):
  1. Load order; kiểm tra **có tiền thật** (`zalopay_trans_id IS NOT NULL` OR (cash AND
     `status='paid'`)); chưa có tiền → lỗi "chưa đủ điều kiện quay".
  2. `stores.spin_enabled = false` HOẶC quán không có reward active → trả `disabled`.
  3. Đã có `spin_results` cho order → trả lại kết quả cũ (idempotent, khách mở lại không quay lần 2).
  4. Random theo `weight` phía SQL, insert `spin_results`, trả `{reward_id, label, type,
     danh sách rewards theo sort_order}` để client vẽ vòng + dừng đúng ô.
- RPC `redeem_spin_result(p_result_id uuid)` cho **operator** (admin/kitchen): set
  `status='redeemed', redeemed_at=now()`.

### 2. Mini-app (core, tầng 1)

- **Điểm móc:** trang `order-success` (hiện chỉ 37 dòng, ảnh + text) và/hoặc `order-status`
  khi đơn chuyển sang có tiền thật. Chọn `order-success` làm chính; với luồng ZaloPay callback
  về `order-status` thì hiện nút "🎁 Quay thưởng" khi đơn đủ điều kiện.
- Gọi `spin_wheel(order_id)` **trước khi** chạy animation → vẽ vòng quay (CSS transform
  `rotate` + easing, các ô từ danh sách rewards) → dừng đúng ô trúng → hiện kết quả.
- Màn kết quả: *"Bạn trúng: Tặng 1 trà đá 🎉 — đưa màn hình này cho nhân viên khi đổi"* +
  mã ngắn (6 ký tự đầu `result_id`). Kết quả xem lại được ở trang chi tiết đơn.
- `type='none'`: "Chúc may mắn lần sau" — không có nút đổi.
- Vòng quay chỉ hiện khi RPC không trả `disabled` (quán tắt = khách không thấy gì).

### 3. Admin — `/admin` (CHỦ QUÁN tự bật/tắt + cấu hình quà)

- `/admin/settings` (hoặc trang riêng `/admin/spin` nếu form dài): mục **"Vòng quay may mắn"**:
  - **Toggle Bật/Tắt** vòng quay (`stores.spin_enabled`) — mô tả rõ "Tắt = khách không thấy gì".
  - **CRUD quà tặng**: label, type (`gift`/`none`), weight, sort_order, is_active.
    Lần đầu bật gợi ý bộ mặc định 6 ô (2 ô "Chúc may mắn lần sau" weight cao) để quán khỏi
    nhập từ đầu.
  - Cảnh báo khi bật mà chưa có reward active: "Cần ít nhất 1 quà đang bật".
- Kitchen Display hoặc trang đơn admin: badge 🎁 trên đơn có kết quả `won` + nút
  **"Đã đổi thưởng"** gọi `redeem_spin_result` (chống khách dùng 1 kết quả đổi 2 lần).

### 4. Test checkpoint (TESTING-V2.md — Sprint v2.3)

1. **Regression khi TẮT (quan trọng nhất):** `spin_enabled=false` → chạy trọn luồng
   quét QR → đặt món → ZaloPay sandbox → kitchen → món xong, xác nhận y hệt trước v2.3,
   order-success không có gì lạ.
2. `/admin` bật vòng quay + tạo 4 quà cho Pubu (1 ô weight rất cao để test trúng ổn định).
3. Đặt đơn ZaloPay sandbox thanh toán xong → thấy vòng quay → quay → trúng ô hợp lệ.
4. Mở lại trang → KHÔNG được quay lần 2, thấy lại đúng kết quả cũ.
5. Đơn chưa thanh toán → không thấy vòng quay / RPC từ chối.
6. Kitchen bấm "Đã đổi thưởng" → status `redeemed`; bấm lại không đổi được nữa.
7. Đang bật, tắt toggle → khách thanh toán đơn mới không thấy vòng quay; kết quả cũ vẫn xem/đổi được.
8. Kiểm tra chéo quán: operator quán A không thấy/sửa được rewards + results quán B; quán B
   (chưa bật) hoàn toàn không bị ảnh hưởng.
9. Giả lập RPC lỗi (tạm đổi tên RPC/ngắt mạng) → order-success vẫn hiển thị bình thường,
   không crash.

**DỪNG — chờ PASS.** Sau PASS: merge worktree pho-ga-pubu + `zmp deploy`, chạy
`get_advisors` (Supabase) soát RLS trước khi đóng version.

---

## Định nghĩa hoàn thành v2.0

- [ ] 3 Sprint PASS theo **TESTING-V2.md** (file mới, checklist do Claude Code bổ sung từng sprint).
- [ ] Migrations 024, 025 đã apply, `get_advisors` không WARN mới về RLS.
- [ ] `spin_enabled` mặc định `false` trên mọi quán — chỉ bật thủ công quán nào muốn dùng.
- [ ] `mini-app-instances/pho-ga-pubu` đã merge `origin/main` + `zmp deploy` bản có v2.1, v2.3.
- [ ] Cập nhật `CLAUDE.md` §10 (lịch sử quyết định): thêm dòng v2.0 + nguyên tắc
      "kết quả vòng quay do server quyết định".
- [ ] Dọn `docs/BACKLOG.md` nếu có mục liên quan phát sinh trong lúc làm.
