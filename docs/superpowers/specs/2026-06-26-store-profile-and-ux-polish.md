# Store Profile & UX Polish — Design Spec
**Ngày:** 2026-06-26
**Nhánh:** `feat/store-profile-ux`
**Trạng thái:** Approved ✅

---

## 1. Bối cảnh & Mục tiêu

Sau khi Takeaway Mode đã deploy và test thành công, sprint này hoàn thiện thêm:
- Nội dung quán (địa chỉ, SĐT, ghi chú) do admin tự quản lý
- Banner hình ảnh trong Takeaway Mode để quán promo
- Popup xin quyền chăm sóc khách hàng (ZNS + tên/SĐT) trong tab Nhà hàng
- UX nhỏ: ZaloPay-only cho takeaway, cancel đơn khi thanh toán thất bại, nút về trang chủ

---

## 2. DB Migration — `011_store_profile.sql`

```sql
ALTER TABLE stores
  ADD COLUMN takeaway_banner_url text,   -- Ảnh banner 2:1 hiện ở menu page (takeaway mode)
  ADD COLUMN about_text          text;   -- Ghi chú tự do: lời cảm ơn, hotline, chính sách...
```

**Lưu ý:**
- `orders.status = 'cancelled'` đã có từ `001_init.sql`
- RPC `cancel_order(uuid, text)` đã có từ `007a_kitchen_isolation.sql`
- Không cần thêm RPC hay thay đổi RLS

---

## 3. Admin Web — Settings Page

### 3.1 Các field cần thêm vào `settings/page.tsx`

Cập nhật query SELECT thêm `address, phone, about_text, takeaway_banner_url`:

```ts
const { data: store } = await supabase
  .from('stores')
  .select('name, logo_url, payment_methods, zalo_oa_url, address, phone, about_text, takeaway_banner_url')
  .eq('id', storeId)
  .single()
```

Props mới truyền vào `SettingsClient`: `address`, `phone`, `aboutText`, `takeawayBannerUrl`.

### 3.2 Form fields mới trong `settings-client.tsx`

Thêm sau field "Logo quán":

| Field | Loại | DB column |
|---|---|---|
| Địa chỉ quán | `<input type="text">` | `stores.address` |
| Số điện thoại | `<input type="tel">` | `stores.phone` |
| Ghi chú / Lời nhắn | `<textarea rows={3}>` | `stores.about_text` |
| Banner Mang về (2:1) | `<input type="file" accept="image/*">` | `stores.takeaway_banner_url` |

**Banner upload:** Không cần cropper. Admin upload ảnh đã cắt sẵn tỉ lệ 2:1. Upload vào bucket `menu-images` path `{storeId}/banner-{uuid}.{ext}`, cùng pattern với logo.

Helper text cho banner: *"Hiện phía dưới thông tin quán khi khách mở app không quét QR. Tỉ lệ 2:1 (ví dụ 1200×600). Để trống = không hiện."*

### 3.3 `updateStoreSettings` action

Thêm vào `patch`:
- `address` — từ `formData.get('address')`
- `phone` — từ `formData.get('phone')`
- `about_text` — từ `formData.get('about_text')`
- `takeaway_banner_url` — upload file + lưu public URL (tương tự logo)

---

## 4. Mini-App — App Store & App.tsx

### 4.1 `app.store.ts` — thêm 2 field mới

```ts
takeawayBannerUrl: string;
aboutText: string;
```

Và trong `setStoreInfo` action.

### 4.2 `app.tsx` — 3 thay đổi

1. Thêm `takeaway_banner_url, about_text` vào stores SELECT query
2. Pass vào `setStoreInfo({ ..., takeawayBannerUrl: data.takeaway_banner_url ?? "", aboutText: data.about_text ?? "" })`
3. **Xoá hoàn toàn** `OaFollowSheet` component và state `showOaSheet` / `handleOaSheetClose` (thay bằng PermissionSheet trong store-info)

---

## 5. Mini-App — Menu Page (Takeaway Banner)

Thêm component `TakeawayBannerCard` trong `menu/index.tsx`:

```tsx
function TakeawayBannerCard({ url }: { url: string }) {
  return (
    <div className="mx-3.5 mt-0 overflow-hidden rounded-xl">
      <img src={url} alt="Banner quán" className="w-full object-cover" style={{ aspectRatio: '2/1' }} />
    </div>
  );
}
```

Render ngay **sau** store-card (logo + tên), **trước** category tabs, chỉ khi `orderMode === 'takeaway' && takeawayBannerUrl`:

```tsx
{orderMode === 'takeaway' && takeawayBannerUrl && (
  <TakeawayBannerCard url={takeawayBannerUrl} />
)}
```

---

## 6. Mini-App — Store Info Page (Nhà hàng Tab)

### 6.1 Hiện `about_text`

Thêm card mới bên dưới card liên hệ (địa chỉ, SĐT), chỉ khi `aboutText` có giá trị:

```tsx
{aboutText && (
  <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
    <p className="text-small text-text-secondary whitespace-pre-line">{aboutText}</p>
  </div>
)}
```

### 6.2 Xoá silent permission calls

Xoá toàn bộ `useEffect` hiện tại trong store-info có gọi `followOA` và `authorize` ngầm.
Xoá state `followed`, `following`, `handleFollowOA` (thay bằng PermissionSheet).
Xoá hàng "Quan tâm OA" button hiện tại (thay bằng CTA card của PermissionSheet).

### 6.3 PermissionSheet — component mới

**File:** `mini-app/src/components/common/permission-sheet.tsx`

Props:
```ts
interface PermissionSheetProps {
  oaId: string;
  visible: boolean;
  onClose: () => void;
  onGranted: () => void;
}
```

Nội dung bottom sheet:
- Title: "Kết nối để nhận ưu đãi"
- Subtitle: "Cấp quyền một lần, dùng mãi mãi"
- 2 permission items:
  - 🔔 **Nhận thông báo Zalo (ZNS)** — "Biết ngay khi món xong. Miễn phí."
  - 👤 **Tên & Số điện thoại** — "Điền form mang về nhanh hơn. Không spam."
- Nút "Đồng ý & Kết nối" → gọi `followOA({ id: oaId })` rồi `authorize({ scopes: ["scope.userInfo", "scope.userPhonenumber"] })` → `onGranted()`
- Nút "Để sau" → `onClose()`

Lỗi từ `followOA` hoặc `authorize` bỏ qua (catch silently) — vẫn gọi `onGranted()` để không block UX.

### 6.4 Logic trigger trong `store-info/index.tsx`

localStorage keys:
- `mevo_perms_granted_{storeId}` — set `"1"` sau khi user bấm "Đồng ý"
- `mevo_perms_dismissed_{storeId}` — set `"1"` sau khi user bấm "Để sau"

State: `const [showPermSheet, setShowPermSheet] = useState(false)`

Trigger auto popup (Option C):
```ts
useEffect(() => {
  if (!storeId || !zaloOaId) return;
  const granted = localStorage.getItem(`mevo_perms_granted_${storeId}`);
  const dismissed = localStorage.getItem(`mevo_perms_dismissed_${storeId}`);
  if (!granted && !dismissed) setShowPermSheet(true);
}, [storeId, zaloOaId]);
```

`onGranted`: set `mevo_perms_granted_`, `setShowPermSheet(false)`
`onClose` (Để sau): set `mevo_perms_dismissed_`, `setShowPermSheet(false)`

**CTA card** — hiện khi `!granted` (kể cả sau khi dismiss):
```tsx
{zaloOaId && !isGranted && (
  <div className="mx-3.5 mt-3 rounded-xl bg-[#FBF4EF] border border-[#E8C9B3] px-4 py-3">
    <p className="font-semibold text-text-primary text-small-m">🔔 Kết nối để nhận ưu đãi</p>
    <p className="mt-0.5 text-xxsmall text-text-secondary">
      Thông báo khi món xong + điền form nhanh hơn.
    </p>
    <button
      onClick={() => setShowPermSheet(true)}
      className="mt-2 w-full rounded-xl bg-primary py-2 text-small font-semibold text-white"
    >
      Kết nối với {storeName}
    </button>
  </div>
)}
```

---

## 7. Mini-App — Checkout Page (ZaloPay failure → cancel)

**Thay đổi trong `handleZaloPayPayment`:**

Khi `outcome !== 'success'` (ZaloPay thất bại/bị huỷ):
- **Nếu `isTakeaway`:**
  1. Gọi `orderService.cancelOrder(orderId, token ?? "")` (bỏ qua lỗi)
  2. `localStorage.removeItem("mevo_last_takeaway_order")`
  3. `openSnackbar({ text: "Thanh toán thất bại — đơn hàng đã bị huỷ.", type: "error" })`
  4. `navigate("/")` — về trang chủ
- **Nếu không phải takeaway:** giữ nguyên flow `setPendingZp` hiện tại (popup cash fallback)

```ts
} else {
  if (isTakeaway) {
    try { await orderService.cancelOrder(orderId, token ?? ""); } catch { /* ignore */ }
    localStorage.removeItem("mevo_last_takeaway_order");
    openSnackbar({ text: "Thanh toán thất bại — đơn hàng đã bị huỷ.", type: "error" });
    navigate("/");
  } else {
    setPendingZp({ id: orderId, token });
  }
}
```

Modal "Thanh toán chưa hoàn tất" giữ nguyên — chỉ hiện khi dine-in.

---

## 8. Mini-App — Order Status Page (nút Về trang chủ)

Thêm nút cuối trang, bên dưới `TakeawayInfoCard` (nếu có), chỉ hiện khi `order.orderType !== 'dine_in'` (đơn takeaway — cancelled chỉ xảy ra ở takeaway nên không cần điều kiện thêm):

```tsx
{order.orderType !== 'dine_in' && (
  <div className="mx-3.5 mt-4 mb-6">
    <button
      onClick={() => navigate('/')}
      className="w-full rounded-xl border border-neutral100 py-3 text-small font-medium text-text-secondary"
    >
      ← Về trang chủ
    </button>
  </div>
)}
```

---

## 9. Danh sách file thay đổi

| File | Thay đổi |
|---|---|
| `supabase/migrations/011_store_profile.sql` | ADD COLUMN takeaway_banner_url, about_text |
| `admin-web/app/admin/settings/page.tsx` | SELECT + pass thêm 4 props |
| `admin-web/app/admin/settings/settings-client.tsx` | Thêm 4 form fields |
| `admin-web/lib/actions/store.ts` | Handle 4 fields mới trong updateStoreSettings |
| `mini-app/src/stores/app.store.ts` | Thêm takeawayBannerUrl, aboutText |
| `mini-app/src/app.tsx` | SELECT + setStoreInfo + xoá OaFollowSheet |
| `mini-app/src/pages/menu/index.tsx` | TakeawayBannerCard |
| `mini-app/src/pages/store-info/index.tsx` | aboutText card + PermissionSheet + CTA card |
| `mini-app/src/components/common/permission-sheet.tsx` | Component mới |
| `mini-app/src/components/common/oa-follow-sheet.tsx` | Xoá file |
| `mini-app/src/pages/checkout/index.tsx` | ZaloPay fail → cancel khi takeaway |
| `mini-app/src/pages/order-status/index.tsx` | Nút "Về trang chủ" |

---

## 10. Out of Scope (v1)

- Cropper 2:1 cho banner (admin upload ảnh pre-sized)
- Multiple banner images / carousel
- Auto-fill tên/SĐT từ Zalo vào form takeaway (dùng permission sau khi grant, phase sau)
- Thông báo retry ZaloPay cho takeaway (hiện tại navigate về trang chủ ngay)
