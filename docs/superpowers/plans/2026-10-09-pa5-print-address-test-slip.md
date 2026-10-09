# PA-5 — Địa chỉ quán trên phiếu in + nút In thử — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phiếu bàn 80mm in thêm địa chỉ quán. Tab Cấu hình quán có khối "In ấn" với nút **In thử**, mở một phiếu mẫu 80mm mà không tạo đơn và không ghi DB.

**Architecture:** Không có migration. Hoá đơn thanh toán (`/staff/tables/print`, RPC `get_sessions_bill` mig 040/047) **đã in địa chỉ sẵn**, nên chỉ phiếu bàn của `print-order` còn thiếu. In thử dùng lại nguyên component `PrintBill` (cùng CSS 80mm với hoá đơn thật), có thêm cờ `testMode`. Dữ liệu mẫu sinh bằng một hàm thuần `buildTestBill()` từ tên/địa chỉ/SĐT thật của quán. Trang in thử đặt ở `/print/test-slip`, nằm ngoài khung `/admin` giống `/print/table-qr`.

**Tech Stack:** Next.js 16 App Router (server component + client component in), React 19, Vitest (`renderToStaticMarkup`), Supabase (chỉ đọc `stores`).

**Spec:** `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` — mục "PA-5 — Vá nhỏ in ấn".

## Global Constraints

- Chữ người dùng thấy bằng **tiếng Việt**. Comment logic bằng tiếng Việt.
- **Không migration**, không RPC mới, không ghi DB ở bất kỳ bước nào của In thử.
- Khổ in giữ đúng CSS hiện có: `@page { size: 80mm auto; margin: 3mm; }`, vùng in rộng `72mm`.
- Trang in thử **chỉ chủ quán** (`requireAdminPageOrRedirect('owner')`), vì tab Cài đặt quán chỉ dành cho chủ quán (PA-2).
- Địa chỉ/SĐT rỗng hoặc chỉ có khoảng trắng thì **không in dòng đó** (không để lại dòng trống).
- Liên PHIẾU BẾP **không** in địa chỉ (bếp không cần); chỉ liên PHIẾU BÀN in.
- Commit format: `feat: …` / `fix: …` / `docs: …`, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Chạy test admin-web từ gốc repo: `npm --prefix admin-web exec -- vitest run --root admin-web <đường dẫn tương đối trong admin-web>`.

## Review Focus

1. **Địa chỉ rỗng / chỉ có khoảng trắng** (quán mới chưa nhập địa chỉ) → phiếu không có dòng trống thừa. Test ở Task 1 và Task 2.
2. **Địa chỉ dài** (như Bảo Lương: "236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai") → phải xuống dòng trong 72mm, không tràn khổ giấy. Cần style `overflow-wrap: anywhere`. Test ở Task 1 kiểm style có mặt; kiểm thật trên giấy ở checklist bài 2.
3. **Phiếu in thử bị nhầm với hoá đơn thật** → tiêu đề "PHIẾU IN THỬ", có dòng "Không phải hoá đơn — không tạo đơn", và **không** in "Cảm ơn quý khách". Test ở Task 2.
4. **Thu ngân mở thẳng `/print/test-slip`** → bị chuyển hướng như mọi trang chỉ dành cho chủ quán. Kiểm ở checklist bài 6 (guard dùng lại `requireAdminPageOrRedirect('owner')`, đã có test riêng).
5. **Phiếu đặt trước (`?job=`)** cũng in phiếu bàn → nhánh `job` của trang `print-order` cũng phải đọc địa chỉ, không riêng nhánh `id`. Task 1 sửa cả hai câu `select`.

---

## File Structure

| File | Việc |
|---|---|
| `admin-web/lib/print/store-lines.ts` (mới) | `cleanStoreText()` — chuẩn hoá chuỗi địa chỉ/SĐT (trim, rỗng → `null`). Dùng chung cho cả 2 trang in. |
| `admin-web/lib/print/store-lines.test.ts` (mới) | Test hàm trên |
| `admin-web/app/admin/pos/print-order/print-order.tsx` | `OrderSlip.storeAddress`, in dưới tên quán ở liên PHIẾU BÀN |
| `admin-web/app/admin/pos/print-order/page.tsx` | `select('name, phone, address')` ở cả nhánh `job` lẫn `id`, chuẩn hoá bằng `cleanStoreText` |
| `admin-web/app/admin/pos/print-order/print-order.test.tsx` | Thêm test địa chỉ |
| `admin-web/lib/print/test-bill.ts` (mới) | `buildTestBill(store, now)` → `SessionsBill` mẫu (2 món) |
| `admin-web/lib/print/test-bill.test.ts` (mới) | Test hàm trên |
| `admin-web/app/staff/tables/print/print-bill.tsx` | Prop `testMode?: boolean`: đổi tiêu đề + chân phiếu; bỏ trống địa chỉ/SĐT rỗng |
| `admin-web/app/staff/tables/print/print-bill.test.tsx` (mới) | Test hai chế độ |
| `admin-web/app/print/test-slip/page.tsx` (mới) | Trang In thử, chỉ chủ quán, chỉ đọc `stores` |
| `admin-web/app/admin/settings/page.tsx` | Khối "In ấn" + nút In thử |
| `docs/testing/pos-admin-complete/PA-5.md` (mới) | Checklist test tay |

---

### Task 1: Địa chỉ quán trên phiếu bàn

**Files:**
- Create: `admin-web/lib/print/store-lines.ts`, `admin-web/lib/print/store-lines.test.ts`
- Modify: `admin-web/app/admin/pos/print-order/print-order.tsx` (type `OrderSlip` + liên 2)
- Modify: `admin-web/app/admin/pos/print-order/page.tsx` (2 câu select `stores` + 2 chỗ dựng `slip`)
- Test: `admin-web/app/admin/pos/print-order/print-order.test.tsx`

**Interfaces:**
- Produces: `cleanStoreText(v: string | null | undefined): string | null` trong `@/lib/print/store-lines`. Task 2 dùng lại.
- Produces: `OrderSlip.storeAddress?: string | null`. Để optional cho các chỗ dựng `OrderSlip` khác (test cũ) không phải sửa.

- [ ] **Step 1: Viết test hỏng cho `cleanStoreText`**

`admin-web/lib/print/store-lines.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { cleanStoreText } from './store-lines'

describe('cleanStoreText', () => {
  it('giữ chữ, bỏ khoảng trắng hai đầu', () => {
    expect(cleanStoreText('  236 Bảo Lương, Lào Cai ')).toBe('236 Bảo Lương, Lào Cai')
  })
  it('rỗng / chỉ khoảng trắng / null / undefined → null (không in dòng trống)', () => {
    expect(cleanStoreText('')).toBeNull()
    expect(cleanStoreText('   \n ')).toBeNull()
    expect(cleanStoreText(null)).toBeNull()
    expect(cleanStoreText(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web lib/print/store-lines.test.ts`
Expected: FAIL, lỗi không tìm thấy module `./store-lines`.

- [ ] **Step 3: Viết hàm**

`admin-web/lib/print/store-lines.ts`:
```ts
// Chuẩn hoá địa chỉ / SĐT quán trước khi in: quán mới hay để trống hoặc gõ toàn dấu cách,
// in ra sẽ thành một dòng trắng giữa đầu phiếu. Rỗng → null để component bỏ hẳn dòng đó.
export function cleanStoreText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web lib/print/store-lines.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Viết test hỏng cho phiếu bàn**

Thêm vào cuối `admin-web/app/admin/pos/print-order/print-order.test.tsx` (giữ nguyên `slip` và test cũ):
```tsx
describe('PrintOrder — địa chỉ quán (PA-5)', () => {
  const lienBan = (s: OrderSlip) => renderToStaticMarkup(<PrintOrder slip={s} />).split('<div class="lien">')[2]
  const lienBep = (s: OrderSlip) => renderToStaticMarkup(<PrintOrder slip={s} />).split('<div class="lien">')[1]

  it('phiếu bàn in địa chỉ dưới tên quán; phiếu bếp thì không', () => {
    const s = { ...slip, storeAddress: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai', storePhone: '0826325523' }
    const ban = lienBan(s)
    expect(ban).toContain('236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai')
    expect(ban.indexOf('Bia lẩu Bảo Lương')).toBeLessThan(ban.indexOf('236 Bảo Lương'))
    expect(ban.indexOf('236 Bảo Lương')).toBeLessThan(ban.indexOf('ĐT: 0826325523'))
    expect(lienBep(s)).not.toContain('236 Bảo Lương')
  })

  it('địa chỉ dài được phép xuống dòng trong khổ 72mm', () => {
    const ban = lienBan({ ...slip, storeAddress: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai' })
    expect(ban).toMatch(/class="diachi"/)
    expect(renderToStaticMarkup(<PrintOrder slip={slip} />)).toContain('.diachi { text-align: center; overflow-wrap: anywhere; }')
  })

  it('không có địa chỉ → không có dòng địa chỉ rỗng', () => {
    expect(lienBan({ ...slip, storeAddress: null })).not.toMatch(/class="diachi"/)
  })
})
```

- [ ] **Step 6: Chạy test, phải FAIL**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web app/admin/pos/print-order/print-order.test.tsx`
Expected: FAIL. Lỗi TS/khẳng định ở test đầu: thiếu chuỗi địa chỉ; `storeAddress` không có trong `OrderSlip`.

- [ ] **Step 7: Sửa `print-order.tsx`**

Trong type `OrderSlip`, ngay dưới `storePhone: string | null`, thêm:
```ts
  storeAddress?: string | null
```
Trong chuỗi `<style>`, ngay dưới dòng `.ghichu { font-style: italic; }`, thêm:
```css
        .diachi { text-align: center; overflow-wrap: anywhere; }
```
Ở liên 2 (PHIẾU BÀN), thay:
```tsx
        {slip.storePhone && <p style={{ textAlign: 'center' }}>ĐT: {slip.storePhone}</p>}
```
bằng:
```tsx
        {slip.storeAddress && <p className="diachi">{slip.storeAddress}</p>}
        {slip.storePhone && <p style={{ textAlign: 'center' }}>ĐT: {slip.storePhone}</p>}
```
Liên 1 (PHIẾU BẾP) giữ nguyên.

- [ ] **Step 8: Sửa `print-order/page.tsx`**

Thêm import:
```ts
import { cleanStoreText } from '@/lib/print/store-lines'
```
Nhánh `job`: đổi
```ts
    const { data: store } = await supabase.from('stores').select('name, phone').eq('id', operator.storeId).single()
```
thành
```ts
    const { data: store } = await supabase.from('stores').select('name, phone, address').eq('id', operator.storeId).single()
```
và trong object `slip` của nhánh này đổi `storeName: store?.name ?? 'Quán', storePhone: store?.phone ?? null,` thành
```ts
      storeName: store?.name ?? 'Quán', storePhone: cleanStoreText(store?.phone), storeAddress: cleanStoreText(store?.address),
```
Nhánh `id`: đổi `.select('name, phone')` thành `.select('name, phone, address')`, và trong object `slip` đổi
```ts
    storePhone: store?.phone ?? null,
```
thành
```ts
    storePhone: cleanStoreText(store?.phone),
    storeAddress: cleanStoreText(store?.address),
```

- [ ] **Step 9: Chạy test + kiểm kiểu**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web app/admin/pos/print-order lib/print`
Expected: PASS hết (test cũ "in giá trên liên bếp" vẫn xanh).
Run: `npm --prefix admin-web exec -- tsc --noEmit -p admin-web`
Expected: không có lỗi mới ở `print-order/`.

- [ ] **Step 10: Commit**

```bash
git add admin-web/lib/print/store-lines.ts admin-web/lib/print/store-lines.test.ts admin-web/app/admin/pos/print-order
git commit -m "feat: phieu ban in dia chi quan (PA-5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Nút In thử trong Cài đặt quán

**Files:**
- Create: `admin-web/lib/print/test-bill.ts`, `admin-web/lib/print/test-bill.test.ts`
- Modify: `admin-web/app/staff/tables/print/print-bill.tsx`
- Create: `admin-web/app/staff/tables/print/print-bill.test.tsx`
- Create: `admin-web/app/print/test-slip/page.tsx`
- Modify: `admin-web/app/admin/settings/page.tsx`
- Create: `docs/testing/pos-admin-complete/PA-5.md`

**Interfaces:**
- Consumes: `cleanStoreText` (Task 1); type `SessionsBill` từ `@/lib/actions/table-session` (dùng `import type`, không kéo code server vào).
- Produces: `buildTestBill(store: { name: string | null; address: string | null; phone: string | null }, now: Date): SessionsBill`; `PrintBill` nhận thêm `testMode?: boolean`.

- [ ] **Step 1: Viết test hỏng cho `buildTestBill`**

`admin-web/lib/print/test-bill.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildTestBill } from './test-bill'

const now = new Date('2026-10-09T12:00:00.000Z')

describe('buildTestBill', () => {
  it('dùng tên/địa chỉ/SĐT thật của quán, 2 món mẫu, tổng khớp', () => {
    const b = buildTestBill({ name: 'Bia lẩu Bảo Lương', address: ' 236 Bảo Lương ', phone: '0826325523' }, now)
    expect(b.store).toEqual({ name: 'Bia lẩu Bảo Lương', address: '236 Bảo Lương', phone: '0826325523' })
    expect(b.printed_at).toBe('2026-10-09T12:00:00.000Z')
    expect(b.sessions).toHaveLength(1)
    const items = b.sessions[0].items
    expect(items).toHaveLength(2)
    for (const it of items) expect(it.line_total).toBe(it.quantity * it.price)
    const sum = items.reduce((n, it) => n + it.line_total, 0)
    expect(b.sessions[0].subtotal).toBe(sum)
    expect(b.grand_total).toBe(sum)
  })

  it('quán chưa nhập địa chỉ/SĐT/tên → null / "Quán", không phải chuỗi rỗng', () => {
    const b = buildTestBill({ name: null, address: '  ', phone: '' }, now)
    expect(b.store).toEqual({ name: 'Quán', address: null, phone: null })
  })
})
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web lib/print/test-bill.test.ts`
Expected: FAIL, không tìm thấy module `./test-bill`.

- [ ] **Step 3: Viết hàm**

`admin-web/lib/print/test-bill.ts`:
```ts
import type { SessionsBill } from '@/lib/actions/table-session'
import { cleanStoreText } from './store-lines'

// Phiếu in thử (PA-5): cùng khuôn với hoá đơn thật để chủ quán canh khổ giấy/máy in,
// nhưng dữ liệu là mẫu dựng tại chỗ — KHÔNG tạo đơn, KHÔNG mở phiên, KHÔNG ghi DB.
// Chỉ phần đầu phiếu (tên/địa chỉ/SĐT) là thật, vì đó chính là thứ chủ quán muốn soát.
export function buildTestBill(
  store: { name: string | null; address: string | null; phone: string | null },
  now: Date,
): SessionsBill {
  const items = [
    { name: 'Món mẫu 1', quantity: 2, price: 25000 },
    { name: 'Món mẫu 2 (tên dài để thử xuống dòng trên giấy 80mm)', quantity: 1, price: 150000 },
  ].map((it) => ({ ...it, line_total: it.quantity * it.price }))
  const subtotal = items.reduce((n, it) => n + it.line_total, 0)
  const at = now.toISOString()
  return {
    store: { name: cleanStoreText(store.name) ?? 'Quán', address: cleanStoreText(store.address), phone: cleanStoreText(store.phone) },
    printed_at: at,
    sessions: [{ session_id: 'in-thu', opened_at: at, is_open_ordering: false, tables: 'Bàn mẫu', subtotal, items }],
    grand_total: subtotal,
  }
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web lib/print/test-bill.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Viết test hỏng cho `PrintBill` chế độ in thử**

`admin-web/app/staff/tables/print/print-bill.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrintBill from './print-bill'
import { buildTestBill } from '@/lib/print/test-bill'

const now = new Date('2026-10-09T12:00:00.000Z')
const store = { name: 'Bia lẩu Bảo Lương', address: '236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai', phone: '0826325523' }

describe('PrintBill (PA-5)', () => {
  it('hoá đơn thường: tiêu đề HOÁ ĐƠN, có lời cảm ơn, in địa chỉ', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)
    expect(html).toContain('HOÁ ĐƠN')
    expect(html).not.toContain('PHIẾU IN THỬ')
    expect(html).toContain('Cảm ơn quý khách')
    expect(html).toContain('236 Bảo Lương, Ngã 5 Bảo Lương')
  })

  it('in thử: tiêu đề PHIẾU IN THỬ, ghi rõ không phải hoá đơn, bỏ lời cảm ơn', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} testMode />)
    expect(html).toContain('PHIẾU IN THỬ')
    expect(html).not.toContain('>HOÁ ĐƠN<')
    expect(html).toContain('Không phải hoá đơn — không tạo đơn')
    expect(html).not.toContain('Cảm ơn quý khách')
    expect(html).toContain('236 Bảo Lương, Ngã 5 Bảo Lương')
    expect(html).toContain('ĐT: 0826325523')
    expect(html).toContain('200.000')
  })

  it('quán chưa có địa chỉ/SĐT → không có dòng trống, không có "ĐT:"', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill({ name: 'Quán A', address: ' ', phone: '' }, now)} testMode />)
    expect(html).not.toContain('ĐT:')
    expect(html).not.toMatch(/class="diachi"/)
  })

  it('địa chỉ dài được phép xuống dòng', () => {
    const html = renderToStaticMarkup(<PrintBill bill={buildTestBill(store, now)} />)
    expect(html).toContain('.diachi { overflow-wrap: anywhere; }')
    expect(html).toMatch(/class="diachi"/)
  })
})
```

- [ ] **Step 6: Chạy test, phải FAIL**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web app/staff/tables/print/print-bill.test.tsx`
Expected: FAIL. Thiếu "PHIẾU IN THỬ", thiếu `class="diachi"`; TS báo `testMode` không có trong props.

- [ ] **Step 7: Sửa `print-bill.tsx`**

Đổi chữ ký component:
```tsx
export default function PrintBill({ bill, testMode = false }: { bill: SessionsBill; testMode?: boolean }) {
```
Trong chuỗi `<style>`, ngay dưới dòng `.row .num { … }`, thêm:
```css
        .diachi { overflow-wrap: anywhere; }
```
Thay hai dòng địa chỉ/SĐT ở đầu phiếu:
```tsx
          {bill.store.address && <div>{bill.store.address}</div>}
          {bill.store.phone && <div>ĐT: {bill.store.phone}</div>}
```
bằng (`trim()` để địa chỉ chỉ có dấu cách từ RPC cũ cũng không in dòng trống):
```tsx
          {bill.store.address?.trim() && <div className="diachi">{bill.store.address.trim()}</div>}
          {bill.store.phone?.trim() && <div>ĐT: {bill.store.phone.trim()}</div>}
```
Thay khối tiêu đề:
```tsx
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          {nhieuMam ? 'HOÁ ĐƠN TỔNG' : 'HOÁ ĐƠN'}
        </div>
```
bằng:
```tsx
        <div style={{ textAlign: 'center', fontWeight: 700 }}>
          {testMode ? 'PHIẾU IN THỬ' : nhieuMam ? 'HOÁ ĐƠN TỔNG' : 'HOÁ ĐƠN'}
        </div>
```
Thay khối chân phiếu:
```tsx
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          Cảm ơn quý khách — hẹn gặp lại!
          <br />
          Đặt món bằng QR trên bàn · MEVO
        </div>
```
bằng:
```tsx
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          {testMode ? (
            <>Không phải hoá đơn — không tạo đơn</>
          ) : (
            <>
              Cảm ơn quý khách — hẹn gặp lại!
              <br />
              Đặt món bằng QR trên bàn · MEVO
            </>
          )}
        </div>
```
Ở nút trên cùng (`no-print`), đổi chữ `In lại` thành `{testMode ? 'In thử lại' : 'In lại'}`.

- [ ] **Step 8: Chạy test, phải PASS**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web app/staff/tables/print lib/print`
Expected: PASS hết.

- [ ] **Step 9: Tạo trang `/print/test-slip`**

`admin-web/app/print/test-slip/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { buildTestBill } from '@/lib/print/test-bill'
import PrintBill from '@/app/staff/tables/print/print-bill'

// Phiếu in thử 80mm (PA-5), mở từ Cài đặt quán → In ấn. Chỉ chủ quán (tab Cài đặt chỉ chủ quán vào).
// Nằm ngoài /admin như /print/table-qr để không dính thanh bên/vùng cuộn khi in.
// CHỈ ĐỌC bảng stores — không tạo đơn, không mở phiên, không ghi gì.
export default async function PrintTestSlipPage() {
  const operator = await requireAdminPageOrRedirect('owner')
  const supabase = await createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('name, address, phone')
    .eq('id', operator.storeId)
    .single()

  const bill = buildTestBill(
    {
      name: (store?.name as string | null) ?? null,
      address: (store?.address as string | null) ?? null,
      phone: (store?.phone as string | null) ?? null,
    },
    new Date(),
  )
  return <PrintBill bill={bill} testMode />
}
```

- [ ] **Step 10: Thêm khối "In ấn" vào Cài đặt quán**

Trong `admin-web/app/admin/settings/page.tsx`, chèn **giữa** section "Âm thanh thông báo" và section "Quy trình vận hành":
```tsx
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="mb-1 text-lg font-semibold text-foreground">In ấn</h2>
            <p className="mb-4 text-sm text-muted">
              In một phiếu mẫu 80mm có tên, địa chỉ, SĐT quán để canh máy in. Không tạo đơn.
            </p>
            {/* Thẻ a thường (không Link): mở tab mới, trang in tự gọi hộp thoại in. */}
            <a
              href="/print/test-slip"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              In thử
            </a>
          </section>
```
Trước khi dùng `bg-primary`, chạy `grep -n "bg-primary" admin-web/app/admin/settings/*.tsx` để chắc lớp này đã được dùng trong cùng thư mục (Tailwind v4: chỉ dùng tên lớp viết nguyên văn). Nếu không thấy, dùng đúng lớp mà nút "Lưu" trong `settings-client.tsx` đang dùng.

- [ ] **Step 11: Build + chạy toàn bộ test admin-web**

Run: `npm --prefix admin-web exec -- vitest run --root admin-web`
Expected: PASS hết (602 test cũ + test mới).
Run: `npm --prefix admin-web run build`
Expected: build OK, trong danh sách route có `/print/test-slip`.

- [ ] **Step 12: Viết checklist test tay**

`docs/testing/pos-admin-complete/PA-5.md`:
```markdown
# PA-5 — Địa chỉ trên phiếu in + In thử

Test trên **Bia lẩu Bảo Lương**, máy tính quầy có máy in bill 80mm. Địa chỉ quán hiện tại:
"236 Bảo Lương, Ngã 5 Bảo Lương, P. Yên Bái, Lào Cai".

## A. Phiếu bàn có địa chỉ
1. POS → duyệt một lượt khách gọi → in 2 liên. **Liên PHIẾU BÀN**: dưới tên quán có dòng địa chỉ, rồi mới tới "ĐT: …".
2. Địa chỉ dài xuống dòng gọn trong khổ giấy, không bị cắt mép phải.
3. **Liên PHIẾU BẾP** KHÔNG có địa chỉ (giữ như cũ).
4. Hoá đơn thanh toán (Thanh toán → In hoá đơn) vẫn có địa chỉ như trước.

## B. In thử
5. ⚙ Cài đặt → tab Cấu hình quán → khối **In ấn** → bấm **In thử** → tab mới mở, hộp thoại in tự bật.
   Phiếu ghi "PHIẾU IN THỬ", có tên + địa chỉ + SĐT thật của quán, 2 món mẫu, tổng 200.000đ, chân phiếu
   "Không phải hoá đơn — không tạo đơn".
6. Đăng nhập tài khoản **thu ngân**, gõ thẳng `/print/test-slip` → bị chuyển đi (không in được).
7. Sau khi in thử: POS không có bàn nào mới mở, Báo cáo ngày không có bill mới.
8. (Tuỳ chọn) Xoá tạm SĐT quán → In thử → không có dòng "ĐT:" trống. Nhập lại SĐT sau khi thử.
```

- [ ] **Step 13: Commit**

```bash
git add admin-web/lib/print/test-bill.ts admin-web/lib/print/test-bill.test.ts admin-web/app/staff/tables/print admin-web/app/print/test-slip admin-web/app/admin/settings/page.tsx docs/testing/pos-admin-complete/PA-5.md
git commit -m "feat: nut In thu phieu 80mm trong Cai dat quan (PA-5)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Sau khi xong

- Chạy kiểm tra thật trên trình duyệt bằng tài khoản Bảo Lương (tự đăng nhập bằng service key, xem memory `feedback_tu_dang_nhap_admin_khi_test`): mở `/print/test-slip`, mở một phiếu `print-order`. Đừng bấm nút nào gọi `confirm()`.
- Một reviewer cuối rà toàn nhánh, rồi dừng lại báo anh Tú test theo `docs/testing/pos-admin-complete/PA-5.md`.
- PASS rồi mới thêm dòng PA-5 vào bảng quyết định trong `CLAUDE.md`. Không có Mini App nên không cần `zmp deploy`.
