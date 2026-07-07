# Điều khoản sử dụng (Terms of Use) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho khách xem "Điều khoản sử dụng" trong tab "Nhà hàng" của mini-app (bottom sheet), nội dung do chủ quán chỉnh trong admin bằng Markdown nhẹ, có mẫu mặc định khi để trống.

**Architecture:** Thêm cột `stores.terms_of_use text`. Admin thêm textarea Markdown → lưu qua `updateStoreSettings`. Mini-app đọc cột này lúc runtime vào `app.store`, render trong một bottom sheet mới bằng một Markdown renderer tự viết (không thêm thư viện). Fallback sang `DEFAULT_TERMS` khi rỗng.

**Tech Stack:** Supabase (Postgres), Next.js (admin-web), Zalo Mini App (React 18 + Vite + zustand + Tailwind), TypeScript.

**Lưu ý test:** Dự án KHÔNG dùng unit-test harness — kiểm thử bằng `tsc` (type-check) + test tay theo TESTING.md. Các bước "verify" trong plan dùng type-check và checklist tay thay cho unit test.

**Commands tham chiếu:**
- Type-check admin: `cd admin-web && npx tsc --noEmit`
- Type-check mini-app: `cd mini-app && npx tsc --noEmit`

---

### Task 1: Migration + cập nhật database types

**Files:**
- Create: `supabase/migrations/026_terms_of_use.sql`
- Modify: `admin-web/types/database.types.ts:7-24` (StoreRow)
- Modify: `mini-app/src/types/database.types.ts:10-30` (stores Row)

- [ ] **Step 1: Viết migration**

Create `supabase/migrations/026_terms_of_use.sql`:

```sql
-- Điều khoản sử dụng hiển thị tab "Nhà hàng" mini-app (Markdown nhẹ).
-- NULL/rỗng = mini-app dùng mẫu điều khoản mặc định (DEFAULT_TERMS).
alter table stores
  add column if not exists terms_of_use text;

comment on column stores.terms_of_use is
  'Điều khoản sử dụng (Markdown nhẹ) hiển thị tab "Nhà hàng" mini-app. NULL/rỗng = dùng mẫu mặc định trong mini-app.';
```

- [ ] **Step 2: Áp migration lên prod qua Supabase MCP**

Dùng tool `apply_migration` với name `terms_of_use` và nội dung SQL ở Step 1.
(Được phép auto-apply — memory `feedback_apply_sql_via_mcp`.)
Expected: thành công, không lỗi.

- [ ] **Step 3: Thêm `terms_of_use` vào admin StoreRow**

Trong `admin-web/types/database.types.ts`, thêm dòng vào `interface StoreRow` (ngay dưới `delivery_area_note`):

```ts
  delivery_area_note: string | null
  terms_of_use: string | null
  spin_enabled: boolean
```

- [ ] **Step 4: Thêm `terms_of_use` vào mini-app stores Row**

Trong `mini-app/src/types/database.types.ts`, thêm dòng vào `stores.Row` (ngay dưới `delivery_area_note`):

```ts
          delivery_area_note: string | null
          terms_of_use: string | null
          is_active: boolean
```

- [ ] **Step 5: Type-check cả hai**

Run: `cd admin-web && npx tsc --noEmit` → Expected: PASS (không lỗi mới)
Run: `cd mini-app && npx tsc --noEmit` → Expected: PASS (không lỗi mới)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/026_terms_of_use.sql admin-web/types/database.types.ts mini-app/src/types/database.types.ts
git commit -m "feat: cột stores.terms_of_use + database types"
```

---

### Task 2: Admin — đọc + hiển thị + lưu Điều khoản

**Files:**
- Modify: `admin-web/app/admin/settings/page.tsx:13-17,26-44`
- Modify: `admin-web/app/admin/settings/settings-client.tsx` (interface Props + destructure + block textarea)
- Modify: `admin-web/lib/actions/store.ts:45-46` (thêm xử lý `terms_of_use`)

- [ ] **Step 1: page.tsx — select thêm cột + truyền prop**

Trong `admin-web/app/admin/settings/page.tsx`, thêm `terms_of_use` vào chuỗi `.select(...)` (nối vào cuối, trước dấu nháy đóng):

```ts
    .select('name, logo_url, payment_methods, zalo_oa_url, address, phone, about_text, takeaway_banner_url, wifi_name, wifi_password, is_accepting_orders, serving_hours, delivery_area_note, terms_of_use')
```

Và thêm prop khi render `<SettingsClient ... />` (ngay dưới `deliveryAreaNote=...`):

```tsx
          deliveryAreaNote={(store?.delivery_area_note as string | null) ?? ''}
          termsOfUse={(store?.terms_of_use as string | null) ?? ''}
```

- [ ] **Step 2: settings-client.tsx — thêm prop vào interface + destructure**

Trong `interface Props`, thêm dòng dưới `deliveryAreaNote: string`:

```ts
  deliveryAreaNote: string
  termsOfUse: string
}
```

Trong dòng destructure tham số của `export default function SettingsClient({ ... })`, thêm `termsOfUse` vào cuối danh sách (trước `}: Props`):

```ts
export default function SettingsClient({ name, logoUrl, paymentMethods, zaloOaUrl, address, phone, aboutText, takeawayBannerUrl, wifiName, wifiPassword, isAcceptingOrders, servingHours, deliveryAreaNote, termsOfUse }: Props) {
```

- [ ] **Step 3: settings-client.tsx — thêm block textarea Điều khoản**

Chèn block sau ngay dưới block "Ghi chú / Lời nhắn" (sau thẻ `</div>` đóng của block `about_text`, trước block "Giờ phục vụ"):

```tsx
      {/* Điều khoản sử dụng — Markdown nhẹ, hiện ở tab "Nhà hàng" khi khách bấm */}
      <div>
        <label className="label">Điều khoản sử dụng</label>
        <textarea
          name="terms_of_use"
          defaultValue={termsOfUse}
          placeholder={"# Điều khoản sử dụng\n\n## Đặt món\n- Khách chọn món và thanh toán ngay trên Zalo\n\n## Liên hệ\n- Hotline: 0901 234 567"}
          rows={10}
          className="input resize-none font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở tab &quot;Nhà hàng&quot; trên mini-app khi khách bấm &quot;Điều khoản sử dụng&quot;.
          Hỗ trợ Markdown nhẹ: <code># Tiêu đề</code>, <code>## Tiêu đề nhỏ</code>,{' '}
          <code>- gạch đầu dòng</code>, <code>**in đậm**</code>, <code>[chữ](link)</code>.
          Để trống = dùng mẫu điều khoản mặc định của MEVO.
        </p>
      </div>
```

- [ ] **Step 4: store.ts — lưu terms_of_use**

Trong `admin-web/lib/actions/store.ts`, sau block xử lý `about_text` (sau dòng `patch.about_text = aboutText || null`), thêm:

```ts
  // terms_of_use — điều khoản sử dụng (Markdown), optional; rỗng = null (mini-app dùng mẫu mặc định)
  const termsOfUse = (formData.get('terms_of_use') as string | null)?.trim()
  patch.terms_of_use = termsOfUse || null
```

- [ ] **Step 5: Type-check admin**

Run: `cd admin-web && npx tsc --noEmit`
Expected: PASS (không lỗi mới)

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/settings/page.tsx admin-web/app/admin/settings/settings-client.tsx admin-web/lib/actions/store.ts
git commit -m "feat: admin chỉnh Điều khoản sử dụng trong Cài đặt quán"
```

---

### Task 3: Mini-app — Markdown renderer tự viết

**Files:**
- Create: `mini-app/src/utils/markdown.tsx`

- [ ] **Step 1: Viết renderer**

Create `mini-app/src/utils/markdown.tsx`:

```tsx
// Markdown renderer tối giản cho Điều khoản sử dụng — KHÔNG dùng thư viện ngoài,
// KHÔNG dùng dangerouslySetInnerHTML (React tự escape → an toàn XSS).
// Cú pháp hỗ trợ (đủ cho nhu cầu điều khoản): # / ## tiêu đề, - hoặc * bullet,
// **in đậm**, [chữ](url), đoạn văn. Cú pháp lạ → render như văn bản thường.
import { ReactNode } from "react";
import { openWebview } from "zmp-sdk";

// Parse inline: **đậm** và [text](url). Trả về mảng ReactNode.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(text.slice(lastIndex, m.index));
    }
    if (m[1] !== undefined) {
      // **đậm**
      nodes.push(
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-text-primary">
          {m[1]}
        </strong>,
      );
    } else {
      // [text](url)
      const label = m[2];
      const url = m[3];
      const isHttp = /^https?:\/\//i.test(url);
      nodes.push(
        <button
          key={`${keyBase}-l-${i}`}
          onClick={() => {
            if (isHttp) void openWebview({ url });
          }}
          className="text-primary underline"
        >
          {label}
        </button>,
      );
    }
    lastIndex = re.lastIndex;
    i += 1;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// Chuyển Markdown nhẹ thành React elements.
export function renderMarkdown(src: string): ReactNode {
  const lines = (src ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-1.5 list-disc space-y-1 pl-5">
        {items.map((it, idx) => (
          <li key={idx} className="text-small text-text-secondary">
            {renderInline(it, `li-${key}-${idx}`)}
          </li>
        ))}
      </ul>,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      listBuffer.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim() === "") {
      continue;
    }
    if (/^#\s+/.test(line)) {
      blocks.push(
        <h2 key={`h2-${key++}`} className="mb-1 mt-3 text-medium-m font-bold text-text-primary first:mt-0">
          {renderInline(line.replace(/^#\s+/, ""), `h2-${key}`)}
        </h2>,
      );
    } else if (/^##\s+/.test(line)) {
      blocks.push(
        <h3 key={`h3-${key++}`} className="mb-1 mt-2.5 text-small-m font-semibold text-text-primary">
          {renderInline(line.replace(/^##\s+/, ""), `h3-${key}`)}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-1.5 text-small text-text-secondary">
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div>{blocks}</div>;
}
```

Lưu ý: kiểm tra `##` TRƯỚC `#`? Không — regex `^#\s+` cũng khớp `## x` sai. Sửa: đảo thứ tự
kiểm tra — test `^##\s+` trước. **Đã xử lý ở Step 2.**

- [ ] **Step 2: Sửa thứ tự kiểm tra heading (bug h2 vs h3)**

`/^#\s+/` sẽ KHÔNG khớp `## abc` (vì sau `#` là `#`, không phải khoảng trắng) — nên thứ tự
hiện tại thực ra AN TOÀN. Xác nhận lại: với `## abc`, `line = "## abc"`, `/^#\s+/.test` =
false (ký tự thứ 2 là `#`), rơi xuống nhánh `/^##\s+/` = true → h3. Đúng. **Không cần đổi.**
(Bước này chỉ để xác nhận; không sửa code.)

- [ ] **Step 3: Type-check mini-app**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS (không lỗi mới)

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/utils/markdown.tsx
git commit -m "feat: markdown renderer tối giản cho mini-app"
```

---

### Task 4: Mini-app — hằng DEFAULT_TERMS

**Files:**
- Create: `mini-app/src/constants/terms.ts`

- [ ] **Step 1: Viết mẫu điều khoản mặc định**

Create `mini-app/src/constants/terms.ts`:

```ts
// Mẫu điều khoản mặc định do MEVO soạn — dùng khi quán chưa nhập terms_of_use.
// Nội dung Markdown nhẹ, chung chung an toàn cho quán ăn.
export const DEFAULT_TERMS = `# Điều khoản sử dụng

Cảm ơn bạn đã đặt món qua ứng dụng. Vui lòng đọc các điều khoản dưới đây.

## Đặt món & thanh toán
- Món ăn, giá và khuyến mãi hiển thị tại thời điểm bạn đặt.
- Đơn hàng được xác nhận sau khi bạn hoàn tất thanh toán hoặc được nhân viên tiếp nhận.
- Vui lòng kiểm tra kỹ món và số lượng trước khi xác nhận đặt.

## Giao / nhận món
- Với đơn tại bàn: món được mang ra theo số bàn bạn đã quét.
- Với đơn mang về / giao: thời gian có thể thay đổi tuỳ tình hình quán và quãng đường.

## Huỷ & hoàn tiền
- Vui lòng liên hệ nhân viên hoặc hotline của quán ngay nếu cần chỉnh sửa hoặc huỷ đơn.
- Việc hoàn tiền thực hiện theo chính sách của quán và của kênh thanh toán.

## Liên hệ hỗ trợ
- Mọi thắc mắc về đơn hàng, vui lòng liên hệ trực tiếp nhân viên hoặc hotline của quán.
`;
```

- [ ] **Step 2: Commit**

```bash
git add mini-app/src/constants/terms.ts
git commit -m "feat: mẫu điều khoản mặc định DEFAULT_TERMS"
```

---

### Task 5: Mini-app — TermsSheet component

**Files:**
- Create: `mini-app/src/components/common/terms-sheet.tsx`

- [ ] **Step 1: Viết bottom sheet**

Create `mini-app/src/components/common/terms-sheet.tsx`:

```tsx
// Bottom sheet hiển thị Điều khoản sử dụng — header dính + nút Đóng, thân cuộn được.
// Dựng theo pattern permission-sheet.tsx.
import { renderMarkdown } from "@/utils/markdown";

interface TermsSheetProps {
  visible: boolean;
  content: string;
  onClose: () => void;
}

export default function TermsSheet({ visible, content, onClose }: TermsSheetProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-[85vh] flex-col rounded-t-2xl bg-white">
        {/* Header dính */}
        <div
          className="flex items-center justify-between border-b border-neutral100 px-4 pb-3"
          style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 12px)" }}
        >
          <span className="w-12" />
          <p className="text-medium-m font-bold text-text-primary">Điều khoản sử dụng</p>
          <button
            onClick={onClose}
            className="w-12 text-right text-small font-semibold text-primary active:opacity-60"
          >
            Đóng
          </button>
        </div>
        {/* Thân cuộn */}
        <div
          className="flex-1 overflow-y-auto px-4 pt-3"
          style={{ paddingBottom: "calc(var(--zaui-safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {renderMarkdown(content)}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check mini-app**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS (không lỗi mới)

- [ ] **Step 3: Commit**

```bash
git add mini-app/src/components/common/terms-sheet.tsx
git commit -m "feat: TermsSheet bottom sheet điều khoản"
```

---

### Task 6: Mini-app — plumbing store data (app.tsx + app.store)

**Files:**
- Modify: `mini-app/src/stores/app.store.ts:7-46,52-74`
- Modify: `mini-app/src/app.tsx:29,53-78`

- [ ] **Step 1: app.store.ts — thêm field termsOfUse**

Trong `interface AppStore`, thêm dưới `deliveryAreaNote: string;`:

```ts
  deliveryAreaNote: string;
  termsOfUse: string;
```

Trong object tham số của `setStoreInfo` (trong interface), thêm dưới `deliveryAreaNote: string;`:

```ts
    deliveryAreaNote: string;
    termsOfUse: string;
  }) => void;
```

Trong giá trị khởi tạo `create<AppStore>((set) => ({ ... }))`, thêm dưới `deliveryAreaNote: "",`:

```ts
  deliveryAreaNote: "",
  termsOfUse: "",
```

- [ ] **Step 2: app.tsx — select cột + set vào store**

Trong `mini-app/src/app.tsx`, thêm `terms_of_use` vào `.select(...)` của `storeQuery` (nối cuối chuỗi, trước `)`):

```ts
      .select("id, name, slug, logo_url, address, phone, zalo_oa_id, zalo_oa_url, payment_methods, takeaway_banner_url, about_text, wifi_name, wifi_password, primary_color, is_accepting_orders, serving_hours, delivery_area_note, terms_of_use")
```

Trong object truyền cho `setStoreInfo`, thêm dưới `deliveryAreaNote: storeRes.data.delivery_area_note ?? "",`:

```ts
          deliveryAreaNote: storeRes.data.delivery_area_note ?? "",
          termsOfUse: storeRes.data.terms_of_use ?? "",
```

- [ ] **Step 3: Type-check mini-app**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS (không lỗi mới)

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/stores/app.store.ts mini-app/src/app.tsx
git commit -m "feat: nạp terms_of_use vào app store mini-app"
```

---

### Task 7: Mini-app — dòng "Điều khoản sử dụng" + mở sheet trong tab Nhà hàng

**Files:**
- Modify: `mini-app/src/pages/store-info/index.tsx:1-5,33-35,203-239`

- [ ] **Step 1: Import + lấy state**

Ở đầu file `mini-app/src/pages/store-info/index.tsx`, thêm import:

```tsx
import PermissionSheet from "@/components/common/permission-sheet";
import TermsSheet from "@/components/common/terms-sheet";
import { DEFAULT_TERMS } from "@/constants/terms";
```

Trong dòng `const { ... } = useAppStore();`, thêm `termsOfUse`:

```tsx
  const { storeId, storeName, storeLogoUrl, storeAddress, storePhone, zaloOaId, zaloOaUrl, aboutText, wifiName, wifiPassword, deliveryAreaNote, termsOfUse } =
    useAppStore();
```

- [ ] **Step 2: State + nội dung điều khoản**

Ngay sau dòng `const [showPermSheet, setShowPermSheet] = useState(false);`, thêm:

```tsx
  const [showTerms, setShowTerms] = useState(false);
  const termsContent = termsOfUse.trim() || DEFAULT_TERMS;
```

- [ ] **Step 3: Thêm card "Điều khoản sử dụng" (luôn hiện)**

Chèn block sau ngay dưới block "Ghi chú / Lời nhắn" (`{aboutText && ( ... )}`), trước comment `{/* Permission bottom sheet */}`:

```tsx
      {/* Điều khoản sử dụng — luôn hiện; rỗng thì dùng DEFAULT_TERMS */}
      <div className="mx-3.5 mt-3 overflow-hidden rounded-xl bg-white">
        <button
          onClick={() => setShowTerms(true)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral50"
        >
          <span className="text-xl">📄</span>
          <div className="flex-1">
            <p className="text-small text-text-primary">Điều khoản sử dụng</p>
          </div>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-neutral300"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
```

- [ ] **Step 4: Render TermsSheet**

Ngay trước `{/* Permission bottom sheet */}` (hoặc sau block card vừa thêm), thêm:

```tsx
      {/* Sheet điều khoản sử dụng */}
      <TermsSheet
        visible={showTerms}
        content={termsContent}
        onClose={() => setShowTerms(false)}
      />
```

- [ ] **Step 5: Type-check mini-app**

Run: `cd mini-app && npx tsc --noEmit`
Expected: PASS (không lỗi mới)

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/pages/store-info/index.tsx
git commit -m "feat: dòng Điều khoản sử dụng trong tab Nhà hàng mini-app"
```

---

### Task 8: Kiểm thử tay + đóng gói

**Files:** không sửa code (chỉ verify).

- [ ] **Step 1: Type-check toàn bộ lần cuối**

Run: `cd admin-web && npx tsc --noEmit` → Expected: PASS
Run: `cd mini-app && npx tsc --noEmit` → Expected: PASS

- [ ] **Step 2: Test admin (dev server)**

- Đăng nhập `store_owner` → `/admin/settings`.
- Nhập vào ô "Điều khoản sử dụng":
  ```
  # Điều khoản sử dụng
  ## Đặt món
  - Thanh toán trước khi bếp làm
  - **Không** hoàn tiền sau khi món đã nấu
  Liên hệ [Zalo quán](https://zalo.me/phogapubu)
  ```
- Bấm Lưu → thấy "✓ Đã lưu" → reload trang → nội dung giữ nguyên.

- [ ] **Step 3: Test mini-app (quán ĐÃ nhập)**

- Mở mini-app (dev) với quán vừa nhập → tab "Nhà hàng".
- Thấy dòng "📄 Điều khoản sử dụng" với mũi tên ›.
- Bấm → sheet mở cao ~85% màn, header "Điều khoản sử dụng" + "Đóng".
- Kiểm tra: `#` ra tiêu đề lớn, `##` ra tiêu đề nhỏ, `-` ra bullet, `**Không**` in đậm,
  `[Zalo quán](...)` là link bấm mở webview.
- Thân cuộn được; bấm "Đóng" và bấm nền đều đóng sheet.

- [ ] **Step 4: Test mini-app (quán CHƯA nhập)**

- Xoá nội dung điều khoản trong admin (để trống) → Lưu (DB = null).
- Mở lại mini-app → bấm dòng điều khoản → thấy nội dung DEFAULT_TERMS hiển thị.

- [ ] **Step 5: Báo anh Tú test theo quy tắc CLAUDE.md**

Dừng lại, báo: *"Xong rồi anh, test tab Nhà hàng → Điều khoản sử dụng (cả khi quán đã nhập
và chưa nhập) + chỉnh trong /admin/settings. OK thì em zmp deploy + redeploy admin."*

- [ ] **Step 6: (sau khi PASS) Deploy**

- Admin: Vercel tự deploy khi push, hoặc theo quy trình hiện tại.
- Mini-app: `cd mini-app-instances/pho-ga-pubu && git fetch origin && git merge origin/main`
  rồi `cd mini-app && npm run dev` kiểm tra, cuối cùng `zmp deploy` cho ĐÚNG quán Pubu.

---

## Self-review notes

- **Spec coverage:** DB cột (Task 1) ✓ · admin edit (Task 2) ✓ · renderer tự viết (Task 3) ✓
  · DEFAULT_TERMS (Task 4) ✓ · TermsSheet (Task 5) ✓ · plumbing (Task 6) ✓ · row + luôn hiện
  + fallback (Task 7) ✓ · type-check + test tay (Task 8) ✓.
- **Type consistency:** `renderMarkdown` (util) dùng trong TermsSheet ✓ · `DEFAULT_TERMS`
  export/import khớp ✓ · `termsOfUse` field xuyên suốt app.store → app.tsx → store-info ✓ ·
  prop `termsOfUse: string` admin page→client khớp ✓ · `terms_of_use` cột DB → cả 2 database.types ✓.
- **Placeholder scan:** không có TBD/TODO; mọi bước có code cụ thể.
