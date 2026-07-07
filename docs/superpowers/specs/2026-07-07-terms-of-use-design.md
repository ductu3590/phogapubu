# Điều khoản sử dụng (Terms of Use) — Design

> Ngày: 2026-07-07
> Trạng thái: Đã duyệt hướng, chờ review spec → plan
> Phạm vi: mini-app (tab "Nhà hàng") + admin-web (Cài đặt quán) + 1 migration

## 1. Mục tiêu

Bổ sung vào mini-app một dòng **"Điều khoản sử dụng"** trong tab **"Nhà hàng"**
(`/store-info`). Khi khách bấm vào, mở một **bottom sheet** cao gần full màn hình
(giống ảnh mẫu "Điều Khoản Sử Dụng" có header + nút "Đóng", thân cuộn được) hiển thị
nội dung điều khoản.

Nội dung điều khoản **chủ quán tự chỉnh** trong admin web (`/admin/settings`) bằng tài
khoản `store_owner`. Nếu quán chưa nhập, mini-app hiển thị **một mẫu điều khoản mặc định
do MEVO soạn sẵn**.

Đây là tính năng dùng chung cho MỌI quán (Core code — tầng 1 theo CLAUDE.md §2), chỉ
nội dung là per-store (tầng 3, đọc runtime từ DB).

## 2. Quyết định thiết kế (đã chốt)

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Định dạng nội dung | **Markdown nhẹ** | Ảnh mẫu có tiêu đề đậm, gạch đầu dòng, khối liên hệ |
| Render Markdown | **Renderer tự viết**, KHÔNG thêm thư viện | `react-markdown` kéo remark/unified nặng cho mini-app; input do chủ quán (tin cậy) nhập; không dùng `dangerouslySetInnerHTML` → 0 KB bundle, không mặt XSS |
| Khi quán chưa nhập | **Luôn hiện dòng + fallback mẫu mặc định** | Quán mới vẫn có điều khoản hiển thị ngay, không phải dòng trống |
| Lưu trữ | **Cột riêng `stores.terms_of_use text`** | Chuẩn hoá, tách khỏi `about_text`; dễ query/độc lập |

## 3. Dữ liệu

### Migration mới: `supabase/migrations/026_terms_of_use.sql`
(số thứ tự lấy số kế tiếp thực tế trong thư mục `migrations/` lúc implement)

```sql
alter table stores
  add column if not exists terms_of_use text;

comment on column stores.terms_of_use is
  'Điều khoản sử dụng (Markdown nhẹ) hiển thị tab "Nhà hàng" mini-app. NULL/rỗng = dùng mẫu mặc định trong mini-app.';
```

- Kiểu `text`, nullable, không default.
- Áp prod qua Supabase MCP (được phép auto-apply theo memory `feedback_apply_sql_via_mcp`).
- Cập nhật `database.types.ts` ở CẢ `mini-app/src/types/` và `admin-web/types/` (thêm
  `terms_of_use: string | null` vào Row/Insert/Update của `stores`).

## 4. Admin web (`/admin/settings`)

### `admin-web/app/admin/settings/page.tsx`
- Thêm `terms_of_use` vào câu `select`.
- Truyền `termsOfUse={(store?.terms_of_use as string | null) ?? ''}` xuống `SettingsClient`.

### `admin-web/app/admin/settings/settings-client.tsx`
- Thêm prop `termsOfUse: string` vào `interface Props` + tham số destructure.
- Thêm 1 block `<textarea name="terms_of_use">` (đặt ngay dưới ô "Ghi chú / Lời nhắn"):
  - `defaultValue={termsOfUse}`, `rows={10}`, `className="input resize-none"`.
  - Placeholder: mẫu ngắn minh hoạ cú pháp.
  - Helper text (`<p class="mt-1 text-xs text-gray-400">`):
    *"Hiện ở tab \"Nhà hàng\" trên mini-app khi khách bấm \"Điều khoản sử dụng\".
    Hỗ trợ Markdown nhẹ: `# Tiêu đề`, `- gạch đầu dòng`, `**in đậm**`, `[chữ](link)`.
    Để trống = dùng mẫu điều khoản mặc định của MEVO."*
- `textarea` là uncontrolled (giống `about_text`) — không cần state.

### `admin-web/lib/actions/store.ts` — `updateStoreSettings`
- Thêm:
  ```ts
  const terms = (formData.get('terms_of_use') as string | null)?.trim()
  patch.terms_of_use = terms || null
  ```

## 5. Mini-app

### `mini-app/src/app.tsx`
- Thêm `terms_of_use` vào chuỗi `.select(...)` của `storeQuery`.
- Thêm `termsOfUse: storeRes.data.terms_of_use ?? ""` vào object `setStoreInfo`.

### `mini-app/src/stores/app.store.ts`
- Thêm field `termsOfUse: string` vào `interface AppStore` + tham số `setStoreInfo`.
- Giá trị khởi tạo `termsOfUse: ""`.

### `mini-app/src/utils/markdown.tsx` (MỚI) — renderer tự viết
Hàm `renderMarkdown(src: string): React.ReactNode` trả về mảng React elements. Tập cú
pháp hỗ trợ (đủ cho ảnh mẫu), xử lý theo dòng:

- `# ...` → `<h2>` (tiêu đề lớn)
- `## ...` → `<h3>` (tiêu đề nhỏ)
- Dòng bắt đầu `- ` hoặc `* ` → gom thành `<ul><li>`
- Dòng trống → ngắt đoạn
- Dòng thường → `<p>`
- Inline trong mỗi dòng: `**đậm**` → `<strong>`, `[text](url)` → link (bấm mở bằng
  `openWebview` hoặc `<a>` — chốt ở plan; ưu tiên `openWebview` cho URL http/https).
- Cú pháp không nhận dạng → render như văn bản thường (an toàn, không vỡ layout).
- **Không** `dangerouslySetInnerHTML`. Escape mặc định của React lo phần an toàn.
- Style bằng class Tailwind sẵn có (`text-text-primary`, `text-text-secondary`,
  spacing), không cần plugin `@tailwindcss/typography`.

### `mini-app/src/constants/terms.ts` (MỚI hoặc đặt trong markdown util/terms-sheet)
- Hằng `DEFAULT_TERMS: string` — mẫu điều khoản MEVO soạn sẵn (tiếng Việt, Markdown),
  nội dung chung chung an toàn cho quán ăn: theo dõi đơn, giao/nhận, liên hệ hỗ trợ,
  ... (soạn ở bước implement, không copy nguyên văn của "Lam Trà" trong ảnh).

### `mini-app/src/components/common/terms-sheet.tsx` (MỚI)
Bottom sheet hiển thị điều khoản, dựng theo pattern `permission-sheet.tsx`:
- Props: `{ visible: boolean; content: string; onClose: () => void }`.
- Overlay `bg-black/40` bấm ra ngoài để đóng.
- Panel `rounded-t-2xl bg-white`, cao gần full (VD `max-h-[85vh]` / `h-[85vh]`).
- **Header dính** (`sticky top-0`): tiêu đề "Điều khoản sử dụng" (căn giữa/trái) + nút
  "Đóng" bên phải; có `padding-top` cộng safe-area-inset-top.
- **Thân cuộn** (`overflow-y-auto`): `renderMarkdown(content)`; padding-bottom cộng
  safe-area-inset-bottom.
- Không render gì khi `!visible`.

### `mini-app/src/pages/store-info/index.tsx`
- Lấy thêm `termsOfUse` từ `useAppStore()`.
- State `const [showTerms, setShowTerms] = useState(false)`.
- `const termsContent = termsOfUse.trim() || DEFAULT_TERMS`.
- Thêm 1 **card mới** (sau card OA / trước hoặc sau card "Ghi chú") chứa 1 nút dòng
  "📄 Điều khoản sử dụng" kèm mũi tên `›` (dùng lại markup nút của card OA:
  `flex w-full items-center gap-3 px-4 py-3 ... active:bg-neutral50`). **Luôn hiện.**
- Bấm → `setShowTerms(true)`.
- Cuối component render `<TermsSheet visible={showTerms} content={termsContent}
  onClose={() => setShowTerms(false)} />`.

## 6. Luồng

```
[Chủ quán] /admin/settings → nhập Markdown vào ô "Điều khoản sử dụng" → Lưu
     → updateStoreSettings → stores.terms_of_use

[Khách] mini-app → tab "Nhà hàng" → thấy dòng "📄 Điều khoản sử dụng"
     → bấm → TermsSheet mở
     → nội dung = terms_of_use (nếu có) HOẶC DEFAULT_TERMS (nếu rỗng)
     → renderMarkdown → hiển thị có tiêu đề/bullet/đậm
     → "Đóng" hoặc bấm nền → đóng sheet
```

## 7. Ngoài phạm vi (YAGNI)

- Không WYSIWYG editor trong admin (textarea Markdown là đủ).
- Không versioning/lịch sử điều khoản, không "yêu cầu khách đồng ý".
- Không đa ngôn ngữ.
- Không thêm thư viện Markdown; không `@tailwindcss/typography`.
- Không thêm tab mới — tái dùng tab "Nhà hàng".

## 8. Kiểm thử (tay, theo quy tắc TESTING của dự án)

1. Admin: nhập Markdown có `#`, `-`, `**`, link → Lưu → reload thấy giữ nguyên.
2. Mini-app (quán ĐÃ nhập): tab Nhà hàng → dòng điều khoản → sheet hiện đúng định dạng.
3. Mini-app (quán CHƯA nhập / `terms_of_use` null): sheet hiện `DEFAULT_TERMS`.
4. Nút "Đóng" + bấm nền đóng sheet; thân cuộn được khi nội dung dài; safe-area đúng.
5. Cú pháp Markdown lạ không làm vỡ layout (hiện như text thường).
6. `tsc` mini-app + admin-web không lỗi type mới.

## 9. Phạm vi động chạm (checklist file)

**Mới:**
- `supabase/migrations/0xx_terms_of_use.sql`
- `mini-app/src/utils/markdown.tsx`
- `mini-app/src/components/common/terms-sheet.tsx`
- `mini-app/src/constants/terms.ts` (DEFAULT_TERMS)

**Sửa:**
- `mini-app/src/app.tsx`
- `mini-app/src/stores/app.store.ts`
- `mini-app/src/pages/store-info/index.tsx`
- `mini-app/src/types/database.types.ts`
- `admin-web/app/admin/settings/page.tsx`
- `admin-web/app/admin/settings/settings-client.tsx`
- `admin-web/lib/actions/store.ts`
- `admin-web/types/database.types.ts`
