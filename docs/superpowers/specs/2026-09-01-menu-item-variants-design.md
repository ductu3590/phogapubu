# Tuỳ chọn quyết định giá cho món (menu item variants)

- **Ngày:** 2026-09-01
- **Trạng thái:** Spec — chờ anh Tú duyệt
- **Người viết:** Claude Code (theo yêu cầu của Đỗ Đức Tú)
- **Liên quan:** [2026-08-20-prepay-postpay-table-session-design.md](2026-08-20-prepay-postpay-table-session-design.md),
  [2026-07-15-staff-assisted-ordering-design.md](2026-07-15-staff-assisted-ordering-design.md)
- **Migration dự kiến:** `042_menu_item_variants.sql`

---

## 1. Yêu cầu gốc

Nhập menu Bia lẩu Bảo Lương xong thì lộ ra vấn đề: nhiều món có **cùng tên, khác cỡ, khác giá**.

- Bia hơi: **Tháp / Ca / Cốc** — ba giá khác nhau
- Bia lon: **333 12k/lon, Hà Nội 13k/lon** — cùng nhóm, khác hãng, khác giá
- Món ăn: **đĩa to 80k / đĩa nhỏ 50k**

Nếu tách thành từng món riêng thì menu phình gấp đôi và khách phải cuộn qua một rừng dòng na ná
nhau. Cần cơ chế: **một dòng menu, khách bấm vào chọn loại, giá đổi theo loại đã chọn**.

---

## 2. Vì sao không dùng topping có sẵn

MEVO đã có hệ topping (mig 015 → 016). Nhưng topping trả lời một câu hỏi khác hẳn:

| | Topping (đã có) | Tuỳ chọn giá (cần làm) |
|---|---|---|
| Cách chọn | Tích **nhiều**, hoặc không tích cái nào | Chọn **đúng một**, **bắt buộc** |
| Ý nghĩa giá | **Cộng thêm** vào giá món | **Thay** giá món |
| Phạm vi | Kho **dùng chung cả quán**, gán nhiều-nhiều | **Riêng từng món** |
| Không chọn thì sao | Vẫn đặt được | **Không đặt được** |

Chỗ chí mạng là dòng cuối bảng: giá tuyệt đối khiến kho dùng chung trở nên vô nghĩa — "đĩa to"
của *Trâu xào tỏi* là 150k còn của *Lòng xào dưa* là 90k, không thể là cùng một dòng dữ liệu.

Nên: **làm mới, chạy song song, không đụng vào topping.** Topping của Phở Gà Pubu đang chạy prod
giữ nguyên không sửa một dòng nào.

---

## 3. Quyết định của anh Tú (2026-09-01)

Bốn quyết định chốt trong lúc brainstorm, ghi lại để sau không phải suy đoán lại:

1. **Giá tuyệt đối, không phải phụ thu.** Anh gõ thẳng "Tháp 200.000, Ca 40.000, Cốc 15.000" đúng
   như tờ menu giấy, không phải tự trừ nhẩm ra số chênh lệch. Đây là quyết định *vận hành*, không
   phải kỹ thuật: người nhập liệu là anh Tú và (sau này) chủ quán lớn tuổi.
2. **Mỗi món đúng MỘT nhóm tuỳ chọn quyết định giá.** Ban đầu anh cân nhắc nhiều nhóm mỗi món
   (vừa chọn cỡ vừa chọn vị), nhưng hai nhóm cùng đòi quyết định giá thì hệ thống không biết nghe
   ai. Chốt lại: đúng một nhóm.
3. **Nhóm "chọn 1 trong N nhưng không đổi giá"** (cay / không cay, nước chấm) **dùng topping 0đ**,
   không làm thêm loại nhóm thứ hai.
   ⚠️ Đánh đổi đã nói rõ và anh chấp nhận: topping tích được nhiều và không bắt buộc, nên khách có
   thể tích cả "cay" lẫn "không cay", hoặc không tích gì. Hệ thống **không chặn** — bếp tự hiểu.
4. **Tên biến thể ghép thẳng vào `item_name`** khi tạo đơn (`"Bia hơi (Tháp)"`).

---

## 4. Mô hình dữ liệu

### 4.1 Bảng mới `menu_item_variants`

```sql
CREATE TABLE menu_item_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL,
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         text NOT NULL,                          -- 'Tháp' | 'Đĩa to' | 'Bia 333'
  price        int  NOT NULL CHECK (price >= 0),       -- giá TUYỆT ĐỐI, VNĐ
  is_available boolean NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT miv_item_store_fkey
    FOREIGN KEY (menu_item_id, store_id)
    REFERENCES menu_items (id, store_id) ON DELETE CASCADE
);
CREATE INDEX idx_miv_lookup ON menu_item_variants (menu_item_id, is_available, sort_order);
```

Khoá ngoại **ghép `(menu_item_id, store_id)`** chứ không chỉ `menu_item_id` — dùng lại đúng thủ
pháp của mig 015: chặn ở tầng CSDL việc gán biến thể của quán này sang món quán khác, kể cả khi
code phía trên có lỗi.

**Không có cột cờ `has_variants`.** Món có biến thể ⟺ có dòng trong bảng này. Một nguồn sự thật,
không có trạng thái lệch nhau.

### 4.2 Cột mới trên `menu_items`

```sql
ALTER TABLE menu_items ADD COLUMN variant_group_name text;   -- NULL → hiện 'Chọn loại'
```

Nhãn hiện cho khách: `'Chọn cỡ'`, `'Chọn hãng'`, `'Chọn loại'`. Chỉ dùng để hiển thị.

### 4.3 Trigger đồng bộ giá hiển thị

```
Sau mỗi INSERT/UPDATE/DELETE trên menu_item_variants:
  menu_items.price := MIN(price) của các biến thể CÒN BÁN của món đó
  Nếu không còn biến thể nào còn bán → GIỮ NGUYÊN price cũ (không ghi đè)
```

Mục đích: mọi câu truy vấn đang đọc `menu_items.price` (card menu, màn đặt hộ, kết quả tìm kiếm)
**tự có sẵn con số đúng để hiện "Từ 15.000đ"** mà không phải sửa và cũng không phải join thêm.

Khi món có biến thể, `menu_items.price` chỉ còn là **số để hiển thị**; giá thật khi tính tiền luôn
lấy từ biến thể khách chọn (§6).

⚠️ **Giá gốc của món mất vĩnh viễn từ lúc thêm biến thể đầu tiên.** Ví dụ: Bia 50k → thêm Cốc 20k
và Tháp 200k → `price` thành 20k → xoá Cốc → thành 200k → xoá Tháp → **kẹt ở 200.000đ** cho món
đáng lẽ 50k. Không có chỗ nào lưu 50k để khôi phục. Hai lớp chắn: admin cảnh báo khi xoá biến thể
cuối cùng (§8.2), và `create_order` từ chối đơn của món có biến thể mà không chọn (§6) nên không
ai bị tính nhầm 200k khi nhóm biến thể vẫn còn. Nhưng sau khi xoá sạch biến thể thì món trở lại
món thường với giá sai — **chủ quán phải tự đặt lại giá**. Nếu về sau thấy đây là lỗi hay gặp thì
thêm cột `menu_items.base_price` (chụp lại lúc thêm biến thể đầu tiên, trả về lúc xoá cái cuối);
chưa làm ở v1 vì xoá sạch biến thể là thao tác hiếm.

### 4.4 RLS

Sao khuôn `toppings` **bản đã được mig 019 viết lại**, KHÔNG phải bản gốc ở mig 016:

- `anon` → `SELECT` mở (mini-app đọc menu công khai)
- `authenticated` → `SELECT` khi **`is_store_scoped_operator(store_id)`**
- **Không** tạo policy INSERT/UPDATE/DELETE — admin ghi qua service-role (bypass RLS)
- **Không** tạo policy cho role `kitchen` — bếp chỉ đọc snapshot trong `order_items`

⚠️ **Không được dùng `is_operator()`.** Hàm đó (mig 006) chỉ hỏi "có phải người vận hành nào đó
không", không hỏi "của quán nào" — chủ quán A cầm JWT gọi thẳng Supabase sẽ đọc được menu và giá
của quán B. Mig 019 sinh ra chính để vá lớp lỗi này và đã đổi policy `toppings` +
`menu_item_toppings` sang `is_store_scoped_operator(store_id)` (019 dòng 73–78). Bản spec đầu
tiên của tài liệu này chép nhầm khuôn mig 016 đã bị thay thế — lỗi bị bắt ở vòng soát chất lượng
Task 1, ghi lại đây để bảng nào chép từ tài liệu này về sau không dính lại.

---

## 5. Snapshot vào đơn hàng

```sql
ALTER TABLE order_items
  ADD COLUMN variant_id   uuid,   -- không FK: snapshot phải sống sót khi biến thể bị xoá
  ADD COLUMN variant_name text,
  -- Hai cột phải cùng NULL hoặc cùng có giá trị. Snapshot nửa vời (có id, thiếu tên)
  -- in ra phiếu bếp thành dòng trống → nấu sai món, và không dựng lại được vì không có FK.
  ADD CONSTRAINT order_items_variant_pair_check
    CHECK ((variant_id IS NULL) = (variant_name IS NULL));
```

Và khi tạo đơn:

| Cột | Giá trị | Ghi chú |
|---|---|---|
| `item_price` | **giá biến thể** khách chọn | không phải `menu_items.price` |
| `item_name` | `'Bia hơi (Tháp)'` | ghép sẵn `tên món (tên biến thể)` |
| `variant_id`, `variant_name` | `'Tháp'` | giữ riêng để thống kê |

**Vì sao ghép vào `item_name`:** màn bếp, loa đọc đơn TTS, bill 80mm, tab "Món đã gọi", trang
trạng thái đơn, `/admin/orders`, `/staff/orders` — bảy chỗ, tất cả đều đọc `item_name`. Ghép sẵn
một lần lúc tạo đơn thì **cả bảy chạy đúng ngay, không sửa dòng nào**. Đây là đánh đổi có chủ ý:
`order_items` vốn đã là bảng snapshot phi chuẩn hoá (đã snapshot cả tên lẫn giá từ mig 001).

**Vì sao vẫn giữ `variant_id`/`variant_name` riêng:** để sau này trả lời được "tháng này bán bao
nhiêu tháp bia" bằng `GROUP BY`, không phải bóc chuỗi trong `item_name`.

Đơn cũ và món không có biến thể: hai cột này `NULL`, `item_name` giữ nguyên tên món.

---

## 6. Chặn ở server — không tin client

Hai RPC phải sửa, cùng một luật:

- `create_order(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text)` — 12 tham số, bản
  hiện hành do mig 040 định nghĩa (khách tự đặt qua mini-app)
- `staff_create_order(uuid,jsonb,text,uuid,text)` — 5 tham số (nhân viên đặt hộ)

Trong vòng lặp từng món, **sau** khi tra `menu_items` và **trước** khi xử lý topping:

```
v_variant_id := (v_item->>'variant_id')::uuid       -- có thể NULL

Đếm TỔNG số biến thể của món (KHÔNG lọc is_available):
  = 0  → món thường:
           nếu client vẫn gửi variant_id  → LỖI 'Món X không có tuỳ chọn'
           ngược lại: giá = menu_items.price, tên = menu_items.name
  > 0  → món có biến thể:
           nếu variant_id IS NULL         → LỖI 'Món X cần chọn loại'
           tra biến thể theo (id, menu_item_id, store_id, is_available = true)
           không thấy                     → LỖI 'Lựa chọn không hợp lệ hoặc đã hết: X'
           giá = variant.price
           tên = menu_items.name || ' (' || variant.name || ')'
```

⚠️ Phải đếm **tổng** biến thể chứ không phải biến thể *còn bán* — nếu đếm bản còn bán thì món đã
tắt hết mọi lựa chọn sẽ rơi vào nhánh "món thường" và **bán được ở giá `menu_items.price` cũ**,
trong khi mini-app đã ẩn món đi. Đếm tổng thì món đó chỉ có một kết cục: bị từ chối ở dòng tra
biến thể còn bán. Đây là ca test số 10 ở §12.

Giá **luôn đọc từ CSDL**, không bao giờ lấy số client gửi lên — y hệt cách topping đang làm.
Tổng dòng vẫn là `(giá + tổng topping) × số lượng`, chỉ khác chỗ lấy `giá`.

Vì mọi con đường tạo đơn đều đi qua hai hàm này, khách **không thể** lách qua bằng cách gọi thẳng
API: món có biến thể mà không chọn thì đơn bị từ chối ở tầng CSDL.

---

## 7. Mini-app (khách)

### 7.1 Đọc menu

`categoryService.getMenuByStore` thêm `menu_item_variants(...)` vào câu select đang có. Kiểu
`Product` thêm `variants: Variant[]` và `variantGroupName: string | null`, lọc sẵn biến thể còn
bán — đúng khuôn `mapToppings` hiện tại.

### 7.2 Card món

- Có biến thể → hiện **"Từ 15.000đ"** (lấy `menu_items.price` đã được trigger đồng bộ)
- Bấm `+` → mở sheet. Dùng lại đúng nhánh `hasToppings` đang có ở
  [mini-app/src/pages/menu/index.tsx](../../../mini-app/src/pages/menu/index.tsx), mở rộng thành
  `hasOptions = variants.length > 0 || toppings.length > 0`
- **Hết sạch biến thể còn bán → món hiển thị "Tạm hết"**, không bấm được (khớp cách `is_available`
  đang xử lý)

### 7.3 Sheet chọn

`ToppingSheet` đổi tên thành `OptionSheet`, gánh cả hai phần trong **một** sheet — không đẻ sheet
thứ hai bắt khách bấm hai lần:

```
┌─────────────────────────────┐
│ [ảnh]  Bia hơi              │
│        Từ 15.000đ           │
├─────────────────────────────┤
│ Chọn cỡ  (bắt buộc)         │
│  ○ Tháp            200.000đ │
│  ● Ca               40.000đ │
│  ○ Cốc              15.000đ │
│  ○ Vại (hết)   ← xám, khoá  │
├─────────────────────────────┤
│ Chọn thêm topping           │
│  ☑ Đá                +0đ    │
├─────────────────────────────┤
│ [ Thêm vào giỏ — 40.000đ ]  │
└─────────────────────────────┘
```

- Radio, **chọn một, bắt buộc**. Nút xác nhận **khoá** cho tới khi chọn xong
- Không tự chọn sẵn cái đầu tiên: bắt khách nhìn giá rồi mới bấm, tránh cảnh vô ý đặt tháp bia 200k
- Biến thể hết hàng: xám mờ, nhãn "(hết)", không bấm được
- Tổng tiền trên nút cập nhật theo lựa chọn

### 7.4 Giỏ hàng

`CartItem` thêm `variant?: { id, name, price }`. `basePrice` của dòng giỏ = **giá biến thể**, nên
`calculateTotals` **không phải sửa**.

`generateCartItemId` hiện chỉ gộp theo tổ hợp topping → thêm `variant.id` vào khoá:

```
productId | variantId | toppingId,toppingId,...
```

Hệ quả: **cùng món khác cỡ = hai dòng giỏ riêng**, cùng cỡ cùng topping thì cộng dồn số lượng.

Giỏ lưu qua lần mở app (`mevo_cart`, TTL 6h) tự nhớ luôn biến thể vì `variant` nằm trong `items`.
⚠️ Sau 6h giá có thể đã đổi hoặc biến thể đã tắt bán — `create_order` sẽ từ chối với thông báo
"Lựa chọn không hợp lệ hoặc đã hết", đúng hành vi mong muốn (thà báo lỗi rõ còn hơn tính sai tiền).

### 7.5 Hiển thị dòng giỏ / checkout

Dòng giỏ hiện `Bia hơi` + dòng phụ `Ca` (giống cách đang hiện topping), giá dòng dùng
`basePrice + topping`. Trang checkout không phải sửa công thức.

---

## 8. Admin

### 8.1 `/admin/menu` — khối "Tuỳ chọn quyết định giá"

Trong khung sửa món, thêm một khối **sao đúng khuôn khối topping đang có** (anh không phải học lại
thao tác mới):

- Ô nhập **tên nhóm** (`variant_group_name`), gợi ý sẵn: Chọn cỡ / Chọn loại / Chọn hãng
- Danh sách biến thể: **tên · giá · công tắc còn bán · nút xoá**, kéo thả đổi thứ tự
  (dùng lại cơ chế `reorderMenuItems` sẵn có)
- Nút "Thêm lựa chọn"

Server actions mới trong [admin-web/lib/actions/menu.ts](../../../admin-web/lib/actions/menu.ts),
đặt tên theo lối `addPoolTopping`/`updatePoolTopping` đang dùng:
`addItemVariant`, `updateItemVariant`, `deleteItemVariant`, `reorderItemVariants`,
`setVariantGroupName`.

### 8.2 Ô "Giá" của món khi đã có biến thể

Chuyển sang **chỉ đọc**, hiện `Từ 15.000đ` kèm câu giải thích: *"Giá đang do tuỳ chọn quyết định.
Sửa giá ở danh sách lựa chọn bên dưới."* Tránh cảnh anh sửa giá món rồi tưởng đã đổi giá bán.

⚠️ Phải là `readOnly`, **không phải `disabled`**. `updateMenuItem` ghi thẳng `price` từ form lên
DB mỗi lần lưu món (kể cả khi chỉ đổi tên hay ảnh). Ô `readOnly` vẫn gửi giá trị hiện tại — tức
giá đã đồng bộ, ghi đè lại chính nó, vô hại. Ô `disabled` **không gửi gì**, `parseInt(undefined)`
ra `NaN` và giá món hỏng. Trigger chỉ chạy khi bảng biến thể đổi nên sẽ không sửa lại giúp.

⚠️ Xoá hết biến thể của một món → món quay về món thường, giá giữ ở mức biến thể rẻ nhất cuối
cùng (do trigger không ghi đè khi rỗng). Admin phải hiện cảnh báo lúc xoá cái cuối cùng.

### 8.3 `/staff/order` — đặt hộ

Nhân viên gọi hộ cũng **phải chọn biến thể** mới thêm được món vào đơn. Nếu bỏ qua màn này thì
`staff_create_order` sẽ từ chối đơn và nhân viên không hiểu vì sao — nên đây là **việc bắt buộc**,
không phải phần mở rộng tuỳ chọn.

---

## 9. Không đụng tới

Topping · voucher / mã giảm giá · vòng quay may mắn · MAC thanh toán Zalo Checkout · doanh thu ·
phiên bàn & lớp Mâm · loa đọc đơn TTS · bill 80mm.

Lý do gọn: tất cả đều tính trên `orders.total_amount` do server cộng, mà công thức cộng không đổi
(`(giá + topping) × số lượng`), chỉ khác chỗ lấy `giá`. Còn mọi màn hiển thị đều đọc `item_name`,
mà `item_name` đã ghép sẵn tên biến thể.

---

## 10. Điều kiện tiên quyết — GỘP NHÁNH TRƯỚC

⚠️ **Việc này phải xong trước khi viết dòng migration đầu tiên.**

Hiện trạng phát hiện lúc rà soát:

| Nơi | Có gì |
|---|---|
| Prod DB | mig 038 + **039 + 040** + **041** — đủ cả |
| Nhánh `main` | 038, **041** — *thiếu 039, 040* |
| Nhánh `feat/postpay-table-session` | 038, **039, 040** — *thiếu 041* |

Hai nhánh **đã rẽ đôi**: `main` đi trước 3 commit (mig 041 + module tài khoản `/mevo/accounts`),
`feat/postpay-table-session` đi trước 3 commit khác (phiên bàn + lớp Mâm).

`create_order` trên prod đang là **bản 12 tham số** của mig 040. Nếu viết migration 042 dựa trên
file `create_order` có trên `main` (bản 10 tham số, cũ), thì `CREATE OR REPLACE` sẽ **ghi đè hàm
prod bằng bản cũ và xoá mất toàn bộ logic phiên bàn / lớp Mâm của Bảo Lương**.

**Bước 0 của kế hoạch:** gộp `feat/postpay-table-session` vào `main`, chạy `next build` + bộ test,
xác nhận `create_order` trong file khớp bản đang chạy trên prod. Anh Tú đã đồng ý (2026-09-01).

---

## 11. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Migration 042 ghi đè `create_order` bằng bản cũ, mất phiên bàn | §10 — gộp nhánh trước, đối chiếu định nghĩa hàm trên prod trước khi viết |
| Mini-app quán chưa `zmp deploy` → khách đặt món có biến thể bị lỗi | Server từ chối đơn với thông báo rõ. Bản mini-app cũ **không** thấy biến thể nên không tạo được đơn hỏng — nhưng cũng không thấy đúng giá → **phải deploy mini-app trước khi bật biến thể cho quán đó** |
| Đơn cũ có `variant_id` NULL | Mọi chỗ đọc phải chịu được NULL; `item_name` cũ vẫn đúng |
| Anh sửa giá món mà không hiểu vì sao không đổi | §8.2 — ô giá chỉ đọc + câu giải thích |
| Trigger đồng bộ giá chạy sai khi tắt hết biến thể | Giữ nguyên giá cũ, không ghi đè; test riêng ca này |
| Giỏ 6h giữ biến thể đã tắt bán | Server từ chối, thông báo rõ; khách chọn lại |

---

## 12. Kiểm thử

Thêm mục `2026-09-01 — Tuỳ chọn quyết định giá` vào `TESTING.md`. Các ca bắt buộc:

**Tầng CSDL (chạy trực tiếp trên prod bằng SQL, không cần UI):**
1. Món có biến thể + không gửi `variant_id` → đơn bị từ chối
2. Gửi `variant_id` của món khác → bị từ chối
3. Gửi `variant_id` của quán khác → bị từ chối
4. Gửi `variant_id` đã tắt bán → bị từ chối
5. Món thường + gửi `variant_id` → bị từ chối
6. Đặt đúng → `item_price` = giá biến thể, `item_name` = `'Món (Biến thể)'`, `total_amount` khớp
7. Đặt kèm topping → tiền = `giá biến thể + topping`
8. Cùng ca 1–7 nhưng qua `staff_create_order`
9. Trigger: thêm/sửa/xoá/tắt biến thể → `menu_items.price` = min giá còn bán
10. Tắt hết biến thể → `menu_items.price` giữ nguyên, và **đơn đặt món đó bị từ chối** (không
    được rơi về giá món cũ — xem cảnh báo ở §6)

**Mini-app (sau `zmp deploy`):**
11. Card hiện "Từ …đ"; bấm `+` mở sheet
12. Chưa chọn → nút thêm vào giỏ bị khoá
13. Biến thể hết hàng bị xám và không bấm được
14. Cùng món hai cỡ → hai dòng giỏ riêng; cùng cỡ → cộng dồn
15. Thoát app mở lại trong 6h → giỏ còn đúng biến thể
16. Đặt đơn thật → bếp và bill hiện `Bia hơi (Tháp)`, loa đọc đúng

**Admin:**
17. Thêm/sửa/xoá/kéo thả biến thể; ô giá món chuyển chỉ đọc
18. Đặt hộ ở `/staff/order` bắt chọn biến thể

**Không hồi quy:** đặt một đơn món thường có topping ở Pubu → không đổi gì.

---

## 13. Việc dữ liệu làm sau (ngoài phạm vi spec này)

Sau khi tính năng chạy, gộp lại menu Bảo Lương:

- **Cơm rang / Mì xào to-nhỏ**: 8 món → 4 món × 2 biến thể
- **Chó chặt đĩa**, **Lợn quay**: khoảng 200–400k hiện đang ghi trong mô tả → thành biến thể thật
- **Bia hơi / Bia lon**: tách theo cỡ và theo hãng (anh Tú vừa cập nhật giá 2026-09-01)

Làm bằng SQL trên prod, không phải việc của code.
