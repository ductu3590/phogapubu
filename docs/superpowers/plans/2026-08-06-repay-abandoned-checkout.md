# Thanh toán lại khi khách thoát màn chọn phương thức — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách bấm "Quay lại" ở màn chọn phương thức thanh toán thì giữ nguyên giỏ hàng, ở lại trang, và có nút "Thanh toán lại" / "Sửa món" — thay vì bị xoá giỏ rồi đẩy sang trang trạng thái đơn như hiện nay.

**Architecture:** Nguồn sự thật đổi từ biến cục bộ `zpOrderId` sang `resultCode` mà `checkTransaction({ data })` trả về, với `data` lấy từ payload sự kiện `PaymentDone` (tài liệu Zalo, SDK ≥ 2.45). Logic phân loại tách thành hàm thuần `mapCheckoutResult` để unit test. Đơn `pending` được **giữ lại** và trả tiền lại trên chính nó; chỉ huỷ khi khách bấm "Sửa món". Mọi ngã rẽ ra khỏi banner đều đi qua **một hàm đối chiếu duy nhất** hỏi DB trạng thái thật của đơn, nên không có đường nào xoá giỏ hàng nhầm.

**Tech Stack:** React 18 + TypeScript + Zustand + zmp-sdk 2.49.4 (mini-app), Supabase PostgreSQL (RPC), vitest (mới dựng cho mini-app).

**Spec:** [docs/superpowers/specs/2026-08-06-repay-abandoned-checkout-design.md](../specs/2026-08-06-repay-abandoned-checkout-design.md)

---

## Bốn cái bẫy đã biết — đọc trước khi code

Bản 1 của plan này dính cả bốn; đừng làm lại:

1. **`clearCart()` chỉ được gọi khi CHẮC CHẮN đơn đã xong.** `checkout-create-mac` trả **409** khi đơn không còn `pending` ([index.ts:62](../../../supabase/functions/checkout-create-mac/index.ts)) — đơn bị sweep rồi bấm "Thanh toán lại" sẽ ném lỗi. Không được coi lỗi là "thanh toán xong" rồi xoá giỏ.
2. **Không có cửa sổ nào giữa mount và lúc biết đơn cũ.** State `unpaidOrder` khởi tạo **đồng bộ** từ localStorage; hỏi DB sau đó chỉ được phép *gỡ* banner.
3. **Lỗi hỏi DB ≠ đơn không còn.** Phân biệt `query_failed` với `cancelled`; lỗi mạng phải **giữ nguyên** khoá.
4. **Khoá phải nằm ở cart store, không phải ở trang checkout.** `/checkout` có `back: true` ([router.tsx:33](../../../mini-app/src/router.tsx)) nên khách rời về menu sửa giỏ được.

---

## ⚠️ Baseline type-check — ĐỌC TRƯỚC KHI CHẠY `npm run typecheck`

`cd mini-app && npm run typecheck` **đã sai sẵn từ trước thay đổi này**: exit code 2, **8 lỗi** (app.tsx 2, index.ts 1, category.api.ts 1, order.api.ts 4).
Đừng đi chữa chúng — chúng không thuộc phạm vi task nào ở đây.
Số liệu dưới đây lấy bằng `npm run typecheck 2>&1 | grep -c "error TS"`, KHÔNG phải đếm bằng mắt
(vài lỗi in ra kèm dòng giải thích thụt lề, dễ đếm thừa).

| File | Lỗi |
|---|---|
| `src/app.tsx(98,8)` | TS2604 + TS2786 — `SnackbarProvider` không dùng được như JSX component (2 lỗi) |
| `src/index.ts(16,23)` | TS2307 — không tìm thấy `../app-config.json` (cố ý: file này gitignored, chỉ có ở worktree quán) |
| `src/services/category/category.api.ts(45,19)` | TS2352 — ép kiểu `SelectQueryError` |
| `src/services/order/order.api.ts(9,7)` | TS2322 — `string \| null` gán vào `string` |
| `src/services/order/order.api.ts(147,48)` | TS2345 — `get_session_orders` thiếu trong `database.types.ts` |
| `src/services/order/order.api.ts(192,43)` | TS2769 — bảng `service_requests` thiếu trong `database.types.ts` |
| `src/services/order/order.api.ts(196,7)` | TS2353 — hệ quả của lỗi trên |

**Tiêu chí đúng cho MỌI bước type-check trong plan này: KHÔNG PHÁT SINH LỖI MỚI so với 8 lỗi trên**
— không phải "PASS". Cách kiểm nhanh bằng cách đếm:

```bash
cd mini-app && npm run typecheck 2>&1 | grep -c "error TS"
```

Trước thay đổi: `8`. Sau mỗi task: vẫn phải là `8`, trừ khi bước đó nói rõ có lỗi tạm thời vì
task sau mới vá.

⚠️ **`order.api.ts` đã mang sẵn 4 trong 8 lỗi đó** — Task 5 sửa đúng file này. Đừng nhầm lỗi cũ
thành lỗi mình vừa gây ra, và cũng đừng tiện tay sửa chúng: bổ sung `service_requests` /
`get_session_orders` vào `database.types.ts` là việc khác, ngoài phạm vi.

---

## Cấu trúc file

| File | Trách nhiệm | Trạng thái |
|---|---|---|
| `mini-app/src/services/checkout-result.ts` | Hàm thuần `mapCheckoutResult` + type `CheckoutOutcome`. KHÔNG import gì | Tạo mới |
| `mini-app/src/services/checkout-result.test.ts` | Unit test hàm phân loại | Tạo mới |
| `mini-app/src/services/payment.service.test.ts` | Test phần nối SDK (mock `zmp-sdk` + `fetch`) | Tạo mới |
| `mini-app/vitest.config.mts` | Cấu hình vitest tối thiểu | Tạo mới |
| `mini-app/package.json` | devDependency `vitest` + script `test` | Sửa |
| `mini-app/src/services/payment.service.ts` | Nhận `data` từ `PaymentDone`, uỷ quyền phân loại | Sửa |
| `mini-app/src/types/database.types.ts` | `cancel_order` Returns đổi `undefined` → `Json` | Sửa |
| `mini-app/src/services/order/order.api.ts` | `getPaymentState` trả union; `cancelOrder` trả `CancelResult` | Sửa |
| `mini-app/src/services/order/order.mutations.ts` | `useCancelOrder` đổi kiểu trả về | Sửa |
| `mini-app/src/stores/cart.store.tsx` | Cờ khoá toàn cục + guard 4 hàm mutation | Sửa |
| `mini-app/src/pages/checkout/index.tsx` | Đối chiếu, banner, khoá form, khôi phục | Sửa |
| `supabase/migrations/038_cancel_order_result.sql` | `cancel_order` trả `jsonb` + chặn đơn đã thu tiền | Tạo mới |
| `TESTING.md` | Checklist test tay | Sửa |

---

## Task 1: Dựng vitest + hàm thuần `mapCheckoutResult` (TDD)

**Files:**
- Modify: `mini-app/package.json`
- Create: `mini-app/vitest.config.mts`
- Create: `mini-app/src/services/checkout-result.ts`
- Test: `mini-app/src/services/checkout-result.test.ts`

Dựng khung test và viết test đầu tiên **trong cùng một task** — `vitest run` không tìm thấy file test nào sẽ thoát với exit code khác 0, nên không được để repo ở trạng thái "có vitest mà chưa có test".

- [ ] **Step 1: Cài vitest**

```bash
cd mini-app && npm install --save-dev vitest@^4.1.9
```

Dùng đúng version `admin-web` đang dùng để không lệch hai nơi.

- [ ] **Step 2: Thêm script `test` vào `mini-app/package.json`**

Trong khối `"scripts"`, thêm dòng `"test"` sau `"typecheck"`:

```json
  "scripts": {
    "login": "zmp login",
    "dev": "vite --config vite.dev.config.mts",
    "start": "zmp start",
    "deploy": "zmp deploy",
    "typecheck": "tsc --noEmit --pretty false",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Tạo `mini-app/vitest.config.mts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Chỉ chạy test cho logic thuần + phần nối SDK đã mock. Không jsdom, không test component.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

Alias `@` cần cho `payment.service.test.ts` ở Task 4.

- [ ] **Step 4: Viết test thất bại**

Tạo `mini-app/src/services/checkout-result.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapCheckoutResult } from './checkout-result'

describe('mapCheckoutResult', () => {
  it('resultCode 1 = đã trả tiền', () => {
    expect(mapCheckoutResult({ resultCode: 1, isCustom: false })).toBe('success')
  })

  it('resultCode -2 = thoát không chọn phương thức', () => {
    expect(mapCheckoutResult({ resultCode: -2, isCustom: false })).toBe('abandoned')
  })

  it('resultCode -1 với ví = thất bại', () => {
    expect(mapCheckoutResult({ resultCode: -1, isCustom: false })).toBe('failed')
  })

  it('resultCode -1 với chuyển khoản = chờ xác nhận, KHÔNG kết luận thất bại', () => {
    expect(mapCheckoutResult({ resultCode: -1, isCustom: true })).toBe('pending_confirm')
  })

  it('resultCode 0 = đang xử lý', () => {
    expect(mapCheckoutResult({ resultCode: 0, isCustom: false })).toBe('pending_confirm')
  })

  it('resultCode lạ = không suy đoán', () => {
    expect(mapCheckoutResult({ resultCode: 99, isCustom: false })).toBe('pending_confirm')
  })

  it('resultCode dạng chuỗi vẫn đọc được', () => {
    expect(mapCheckoutResult({ resultCode: '-2', isCustom: false })).toBe('abandoned')
  })

  it('thiếu resultCode = không suy đoán', () => {
    expect(mapCheckoutResult({ isCustom: false })).toBe('pending_confirm')
  })

  it('không có kết quả = không suy đoán', () => {
    expect(mapCheckoutResult(null)).toBe('pending_confirm')
    expect(mapCheckoutResult(undefined)).toBe('pending_confirm')
  })

  it('chuyển khoản trả về 1 vẫn là đã trả tiền', () => {
    expect(mapCheckoutResult({ resultCode: 1, isCustom: true })).toBe('success')
  })
})
```

- [ ] **Step 5: Chạy test để xác nhận nó THẤT BẠI**

Run: `cd mini-app && npm test`
Expected: FAIL — `Failed to resolve import "./checkout-result"` (file chưa tồn tại).

- [ ] **Step 6: Viết implementation tối thiểu**

Tạo `mini-app/src/services/checkout-result.ts`:

```ts
// Phân loại kết quả thanh toán Zalo Checkout — logic THUẦN, không import gì.
//
// Nguồn: https://docs.zaloplatforms.com/docs/MA/checkoutSdk/integration-process/overview/maResult
//   resultCode  1 = thanh toán thành công
//   resultCode  0 = đang thực hiện hoặc chờ xử lý
//   resultCode -1 = thanh toán thất bại
//   resultCode -2 = người dùng KHÔNG chọn phương thức và thoát Checkout SDK
//
// NGUYÊN TẮC: mọi trường hợp không chắc chắn đều rơi về 'pending_confirm'. Không bao giờ suy đoán
// "khách chưa trả tiền" — báo nhầm cho người đã chuyển khoản là lỗi nặng nhất.

export type CheckoutOutcome =
  | 'success'          // đã trả tiền
  | 'abandoned'        // thoát không chọn phương thức → hiện banner
  | 'failed'           // thanh toán thất bại / chưa tạo được giao dịch → hiện banner
  | 'pending_confirm'  // chờ webhook hoặc quán xác nhận → đi đường cũ

export type TransactionResult = {
  resultCode?: number | string | null
  isCustom?: boolean | null
}

export function mapCheckoutResult(r: TransactionResult | null | undefined): CheckoutOutcome {
  if (!r) return 'pending_confirm'

  const code = Number(r.resultCode)
  if (!Number.isFinite(code)) return 'pending_confirm'

  if (code === 1) return 'success'
  if (code === -2) return 'abandoned'
  // Chuyển khoản: Zalo KHÔNG thấy giao dịch bank→bank nên resultCode không đáng tin.
  // Kiểm isCustom TRƯỚC -1 để không kết luận thất bại cho đơn khách đang chuyển tiền.
  if (r.isCustom === true) return 'pending_confirm'
  if (code === -1) return 'failed'
  return 'pending_confirm'
}
```

- [ ] **Step 7: Chạy test để xác nhận PASS**

Run: `cd mini-app && npm test`
Expected: PASS — 10 test xanh, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add mini-app/package.json mini-app/package-lock.json mini-app/vitest.config.mts \
        mini-app/src/services/checkout-result.ts mini-app/src/services/checkout-result.test.ts
git commit -m "feat(mini-app): vitest + ham thuan mapCheckoutResult theo resultCode Zalo"
```

---

## Task 2: Nối `mapCheckoutResult` vào `payment.service.ts`

**Files:**
- Modify: `mini-app/src/services/payment.service.ts`

Bỏ hẳn cơ chế `zpOrderId`; nhận `data` từ `PaymentDone` và đưa thẳng vào `checkTransaction`.

- [ ] **Step 1: Thay phần đầu file (dòng 1–16)**

```ts
// Payment service — Zalo Checkout SDK
// Luồng: server ký MAC (số tiền server tự lấy từ DB) → mở Payment.createOrder.
// Sự kiện PaymentDone bắn khi khách hoàn tất HOẶC thoát; nó truyền `data`, đưa thẳng `data` đó
// vào checkTransaction để lấy resultCode thật (tài liệu Zalo, SDK ≥ 2.45 — mình đang ở 2.49.4).
// Phân loại resultCode nằm ở ./checkout-result.ts (thuần, có test).
//
// ⚠️ Hàm này NÉM lỗi khi không lấy được MAC (mạng lỗi, hoặc 409 vì đơn không còn 'pending').
// Caller PHẢI bắt và đối chiếu lại với DB — tuyệt đối không coi lỗi là "đã thanh toán xong".

import { Payment, events, EventName } from 'zmp-sdk'
import { mapCheckoutResult, CheckoutOutcome, TransactionResult } from './checkout-result'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type { CheckoutOutcome }
```

Xoá hoàn toàn khối comment cũ mô tả `success | unpaid | cancelled` và dòng
`export type ZaloPayOutcome = 'success' | 'unpaid' | 'cancelled'`.

- [ ] **Step 2: Sửa JSDoc của `payWithCheckoutSDK`**

Thay dòng `* Trả về 'success' nếu thanh toán xong, 'unpaid' nếu khách huỷ/thất bại.` bằng:

```ts
   * Trả về CheckoutOutcome — xem ./checkout-result.ts. 'abandoned'/'failed' là hai trạng thái
   * duy nhất đủ chắc chắn để nói với khách "chưa thanh toán".
   * NÉM lỗi nếu không lấy được MAC — caller phải đối chiếu DB, không được xoá giỏ hàng.
```

- [ ] **Step 3: Thay toàn bộ từ `return await new Promise` tới hết hàm**

```ts
    return await new Promise<CheckoutOutcome>((resolve) => {
      let settled = false

      // Dọn listener và resolve đúng một lần
      const finish = (outcome: CheckoutOutcome) => {
        if (settled) return
        settled = true
        events.off(EventName.PaymentDone, onPaymentDone)
        console.info('[checkout] outcome:', outcome)
        resolve(outcome)
      }

      // PaymentDone truyền `data` — đưa THẲNG vào checkTransaction theo đúng tài liệu Zalo.
      const onPaymentDone = async (data?: unknown) => {
        try {
          if (!data) {
            // Không có payload → không đủ căn cứ. Chờ webhook cho an toàn.
            console.warn('[checkout] PaymentDone không kèm data → pending_confirm')
            finish('pending_confirm')
            return
          }
          const r = await Payment.checkTransaction({ data } as Parameters<
            typeof Payment.checkTransaction
          >[0])
          console.info('[checkout] checkTransaction result:', r)
          finish(mapCheckoutResult(r as TransactionResult))
        } catch (e) {
          console.error('[checkout] checkTransaction lỗi:', e)
          finish('pending_confirm')
        }
      }

      // Đăng ký lắng nghe TRƯỚC khi mở sheet
      events.on(EventName.PaymentDone, onPaymentDone)

      // KHÔNG truyền `method` → Zalo tự mở màn chọn phương thức thanh toán
      Payment.createOrder({
        desc: body.desc,
        item: body.item,
        amount: body.amount,
        extradata: body.extradata,
        mac: body.mac,
        fail: () => {
          // Lỗi tạo giao dịch — sheet chưa mở nên chắc chắn chưa mất tiền
          console.warn('[checkout] createOrder fail callback')
          finish('failed')
        },
      } as Parameters<typeof Payment.createOrder>[0]).catch((e: unknown) => {
        console.error('[checkout] createOrder promise rejected:', e)
        finish('failed')
      })
    })
```

Callback `success` và biến `zpOrderId` bị xoá hẳn.

- [ ] **Step 4: Kiểm tra không còn tên cũ**

Run: `cd mini-app && grep -n "ZaloPayOutcome\|zpOrderId\|'unpaid'\|'cancelled'" src/services/payment.service.ts`
Expected: không dòng nào khớp (exit code 1).

- [ ] **Step 5: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: vẫn đúng **8 lỗi baseline**, không hơn.

⚠️ Plan ban đầu đoán sẽ có thêm 1 lỗi ở `pages/checkout/index.tsx` — **đoán sai**. Trang đó gọi
`await paymentService.payWithCheckoutSDK(orderId);` mà **vứt luôn giá trị trả về**, không gán vào
đâu cả, nên đổi kiểu trả về không sinh lỗi kiểu nào.

Hệ quả cho Task 7: **không có lưới an toàn từ type-checker**. Compiler sẽ không nhắc nếu Task 7
quên xử lý `CheckoutOutcome`. Phải tự kiểm bằng mắt và bằng checklist test tay, đừng trông chờ
`npm run typecheck` bắt hộ.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/services/payment.service.ts
git commit -m "fix(mini-app): doc resultCode tu PaymentDone data thay vi doan qua zpOrderId"
```

---

## Task 3: Test phần nối SDK

**Files:**
- Test: `mini-app/src/services/payment.service.test.ts`

`mapCheckoutResult` đã có test, nhưng chỗ dễ hỏng thật là **phần nối**: payload có được truyền nguyên vẹn không, listener có được gỡ không, lỗi có rơi đúng nhánh không.

- [ ] **Step 1: Viết test**

Tạo `mini-app/src/services/payment.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bộ nhớ giả cho listener PaymentDone để test tự bắn sự kiện
const listeners = new Map<string, (data?: unknown) => void>()
const checkTransaction = vi.fn()
const createOrder = vi.fn()

vi.mock('zmp-sdk', () => ({
  Payment: {
    checkTransaction: (...a: unknown[]) => checkTransaction(...a),
    createOrder: (...a: unknown[]) => createOrder(...a),
  },
  events: {
    on: (name: string, cb: (data?: unknown) => void) => listeners.set(name, cb),
    off: (name: string) => listeners.delete(name),
  },
  EventName: { PaymentDone: 'action.payment.done' },
}))

const { paymentService } = await import('./payment.service')

// Giả lập môi trường Zalo (payment.service bỏ qua SDK khi thiếu window.APP_ID)
;(globalThis as { window?: unknown }).window = { APP_ID: 'test-app' }

function mockMacOk() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ desc: 'd', item: '[]', amount: 1000, extradata: '{}', mac: 'm' }),
  }) as unknown as typeof fetch
}

function firePaymentDone(data?: unknown) {
  const cb = listeners.get('action.payment.done')
  if (!cb) throw new Error('listener chưa được đăng ký')
  cb(data)
}

beforeEach(() => {
  listeners.clear()
  checkTransaction.mockReset()
  createOrder.mockReset()
  createOrder.mockReturnValue(new Promise(() => {})) // treo, để PaymentDone quyết định
  mockMacOk()
})

describe('payWithCheckoutSDK', () => {
  it('truyền NGUYÊN payload của PaymentDone vào checkTransaction', async () => {
    checkTransaction.mockResolvedValue({ resultCode: 1, isCustom: false })
    const p = paymentService.payWithCheckoutSDK('order-1')
    await Promise.resolve()
    const payload = { orderId: 'zp-9', extra: 'giữ nguyên' }
    firePaymentDone(payload)
    await expect(p).resolves.toBe('success')
    expect(checkTransaction).toHaveBeenCalledWith({ data: payload })
  })

  it('gỡ listener sau khi xong', async () => {
    checkTransaction.mockResolvedValue({ resultCode: -2 })
    const p = paymentService.payWithCheckoutSDK('order-1')
    await Promise.resolve()
    firePaymentDone({ orderId: 'zp-9' })
    await expect(p).resolves.toBe('abandoned')
    expect(listeners.has('action.payment.done')).toBe(false)
  })

  it('checkTransaction ném lỗi → pending_confirm, KHÔNG kết luận chưa trả tiền', async () => {
    checkTransaction.mockRejectedValue(new Error('mạng lỗi'))
    const p = paymentService.payWithCheckoutSDK('order-1')
    await Promise.resolve()
    firePaymentDone({ orderId: 'zp-9' })
    await expect(p).resolves.toBe('pending_confirm')
  })

  it('PaymentDone không kèm data → pending_confirm', async () => {
    const p = paymentService.payWithCheckoutSDK('order-1')
    await Promise.resolve()
    firePaymentDone(undefined)
    await expect(p).resolves.toBe('pending_confirm')
    expect(checkTransaction).not.toHaveBeenCalled()
  })

  it('createOrder gọi callback fail → failed', async () => {
    createOrder.mockImplementation((args: { fail: () => void }) => {
      args.fail()
      return new Promise(() => {})
    })
    await expect(paymentService.payWithCheckoutSDK('order-1')).resolves.toBe('failed')
  })

  it('createOrder promise reject → failed', async () => {
    createOrder.mockReturnValue(Promise.reject(new Error('hỏng')))
    await expect(paymentService.payWithCheckoutSDK('order-1')).resolves.toBe('failed')
  })

  it('lấy MAC lỗi 409 → NÉM lỗi để caller đối chiếu DB, không tự kết luận', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Đơn không ở trạng thái chờ thanh toán' }),
    }) as unknown as typeof fetch
    await expect(paymentService.payWithCheckoutSDK('order-1')).rejects.toThrow(
      'Đơn không ở trạng thái chờ thanh toán',
    )
  })
})
```

- [ ] **Step 2: Chạy test**

Run: `cd mini-app && npm test`
Expected: PASS — 10 test của `checkout-result` + 7 test của `payment.service`, tổng 17.

Nếu test "truyền NGUYÊN payload" fail vì `checkTransaction` nhận khác `{ data: payload }`, DỪNG
lại: nghĩa là Task 2 gói payload sai, sửa `payment.service.ts` chứ đừng nới test.

- [ ] **Step 3: Commit**

```bash
git add mini-app/src/services/payment.service.test.ts
git commit -m "test(mini-app): phu phan noi PaymentDone -> checkTransaction"
```

---

## Task 4: Migration 038 — `cancel_order` trả kết quả rõ ràng

**Files:**
- Create: `supabase/migrations/038_cancel_order_result.sql`
- Modify: `mini-app/src/types/database.types.ts`

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/038_cancel_order_result.sql`:

```sql
-- 038_cancel_order_result.sql
-- cancel_order (mig 007a) RETURNS void: UPDATE trúng 0 dòng KHÔNG sinh lỗi → client tưởng đã
-- huỷ trong khi đơn còn nguyên. Ca hỏng: khách bấm "Sửa món" đúng lúc bếp bấm "Đã nhận tiền"
-- → banner tắt, khách đặt đơn mới, quán ôm 2 đơn mà 1 đơn đã thu tiền.
-- Sửa: trả jsonb {result, reason} + chặn hẳn đơn đã có payment_received_at.
-- Đổi kiểu trả về đòi DROP trước (Postgres không cho CREATE OR REPLACE khi đổi return type).
-- An toàn: useCancelOrder ở mini-app hiện CHƯA nơi nào gọi.

drop function if exists cancel_order(uuid, text);

create function cancel_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype;
begin
  select * into v_order from orders
   where id = p_order_id and capability_token = p_token;
  if not found then
    return jsonb_build_object('result','blocked','reason','not_found_or_bad_token');
  end if;

  -- Idempotent: bấm hai lần không thành lỗi
  if v_order.status = 'cancelled' then
    return jsonb_build_object('result','already_cancelled');
  end if;

  -- Không bao giờ huỷ đơn đã có tiền thật
  if v_order.payment_received_at is not null then
    return jsonb_build_object('result','blocked','reason','already_paid');
  end if;

  if v_order.status <> 'pending' then
    return jsonb_build_object('result','blocked','reason','in_progress');
  end if;

  update orders set status = 'cancelled'
   where id = p_order_id and status = 'pending' and payment_received_at is null;
  if not found then
    -- Đơn đổi trạng thái giữa lúc đọc và ghi
    return jsonb_build_object('result','blocked','reason','race');
  end if;

  return jsonb_build_object('result','cancelled');
end $$;

revoke all on function cancel_order(uuid, text) from public;
grant execute on function cancel_order(uuid, text) to anon;
```

- [ ] **Step 2: Áp migration**

Dùng Supabase MCP `apply_migration`, name `038_cancel_order_result`, nội dung file trên.
Expected: áp thành công, không lỗi.

- [ ] **Step 3: Kiểm chứng bằng SQL thật**

Qua Supabase MCP `execute_sql`. Tạo đơn nháp:

```sql
insert into orders (store_id, table_id, total_amount, payment_amount, status,
                    payment_method, capability_token)
select t.store_id, t.id, 1000, 1000, 'pending', 'zalo_checkout', 'TEST-TOKEN-038'
from tables t where t.is_active limit 1
returning id;
```

Ghi lại `id` trả về (gọi là `<OID>`), rồi chạy lần lượt:

```sql
select cancel_order('<OID>'::uuid, 'SAI-TOKEN');
select cancel_order('<OID>'::uuid, 'TEST-TOKEN-038');
select cancel_order('<OID>'::uuid, 'TEST-TOKEN-038');
```

Expected lần lượt:
`{"result":"blocked","reason":"not_found_or_bad_token"}`,
`{"result":"cancelled"}`,
`{"result":"already_cancelled"}`.

Ca quan trọng nhất — đơn đã thu tiền:

```sql
insert into orders (store_id, table_id, total_amount, payment_amount, status,
                    payment_method, capability_token, payment_received_at, payment_received_via)
select t.store_id, t.id, 1000, 1000, 'pending', 'zalo_checkout', 'TEST-TOKEN-038B',
       now(), 'kitchen'
from tables t where t.is_active limit 1
returning id;
```

Với `id` mới `<OID2>`:

```sql
select cancel_order('<OID2>'::uuid, 'TEST-TOKEN-038B');
```

Expected: `{"result":"blocked","reason":"already_paid"}`. Nếu ra `cancelled` thì DỪNG — migration sai.

- [ ] **Step 4: Dọn dữ liệu test**

```sql
delete from orders where capability_token in ('TEST-TOKEN-038','TEST-TOKEN-038B');
```

Expected: `DELETE 2`.

- [ ] **Step 5: Cập nhật generated types**

Trong `mini-app/src/types/database.types.ts`, tại khối `cancel_order` (khoảng dòng 142–145), đổi:

```ts
      cancel_order: {
        Args: { p_order_id: string; p_token: string }
        Returns: Json
      }
```

Type `Json` đã khai báo sẵn ở dòng 4 của file này, không cần import gì thêm.

- [ ] **Step 6: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: vẫn là 8 lỗi baseline + lỗi tạm ở `pages/checkout/index.tsx`. Không phát sinh lỗi mới,
đặc biệt KHÔNG có lỗi mới trong `database.types.ts`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/038_cancel_order_result.sql mini-app/src/types/database.types.ts
git commit -m "feat(db): cancel_order tra jsonb + chan huy don da thu tien (mig 038)"
```

---

## Task 5: `order.api.ts` — trạng thái đơn phân biệt được lỗi

**Files:**
- Modify: `mini-app/src/services/order/order.api.ts`
- Modify: `mini-app/src/services/order/order.mutations.ts`

Điểm mấu chốt: **lỗi hỏi DB phải phân biệt được với "đơn không còn"**. Trả `null` cho cả hai là
nguồn gốc của lỗi fail-open.

- [ ] **Step 1: Thêm type vào đầu `order.api.ts`, ngay sau khối import**

```ts
// Kết quả huỷ đơn từ RPC cancel_order (mig 038). 'blocked' = đơn CÒN NGUYÊN.
export type CancelResult =
  | { result: "cancelled" }
  | { result: "already_cancelled" }
  | { result: "blocked"; reason: string };

// Trạng thái đơn dưới góc nhìn "có thể thanh toán lại không".
// query_failed PHẢI tách khỏi cancelled — gộp lại là fail-open, mất giỏ hàng của khách.
export type OrderPaymentState =
  | { kind: "unpaid_pending" }  // còn pending, chưa thu tiền → giữ banner
  | { kind: "cancelled" }       // đã huỷ / không còn → bỏ banner nhưng GIỮ giỏ để đặt lại
  | { kind: "settled" }         // đã thu tiền hoặc đã qua pending → xoá giỏ, sang trạng thái đơn
  | { kind: "query_failed" };   // không hỏi được → GIỮ NGUYÊN mọi thứ
```

- [ ] **Step 2: Thay `cancelOrder` (khoảng dòng 42–48)**

```ts
  cancelOrder: async (orderId: string, token: string): Promise<CancelResult> => {
    // capability_token bắt buộc — chỉ chủ đơn mới huỷ được.
    // RPC trả {result, reason}; 'blocked' nghĩa là đơn CÒN NGUYÊN, caller không được coi là đã huỷ.
    const { data, error } = await supabase.rpc("cancel_order", {
      p_order_id: orderId,
      p_token: token,
    });
    if (error) throw error;
    const r = data as { result?: string; reason?: string } | null;
    if (!r || typeof r.result !== "string") {
      return { result: "blocked", reason: "unknown" };
    }
    if (r.result === "cancelled") return { result: "cancelled" };
    if (r.result === "already_cancelled") return { result: "already_cancelled" };
    return { result: "blocked", reason: r.reason ?? "unknown" };
  },
```

- [ ] **Step 3: Thêm `getPaymentState` ngay sau `cancelOrder`**

```ts
  // Hỏi DB trạng thái thật của đơn. Dùng ở MỌI ngã rẽ ra khỏi banner: lúc vào trang, trước khi
  // thanh toán lại, và sau khi mở thanh toán thất bại. Đơn có thể đã được bếp xác nhận tiền,
  // đã bị sweep huỷ, hoặc callback ví đã về trong lúc khách đi chỗ khác.
  getPaymentState: async (orderId: string): Promise<OrderPaymentState> => {
    const { data, error } = await supabase
      .from("orders")
      .select("status, payment_received_at")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { kind: "query_failed" };
    if (!data) return { kind: "cancelled" }; // không thấy đơn → không dùng lại được nữa
    const status = data.status as string;
    const paid = (data.payment_received_at as string | null) !== null;
    if (status === "cancelled") return { kind: "cancelled" };
    if (status === "pending" && !paid) return { kind: "unpaid_pending" };
    return { kind: "settled" };
  },
```

Dùng `maybeSingle()` chứ không phải `single()` — `single()` coi "0 dòng" là lỗi, làm ta không
phân biệt được đơn đã bị xoá với lỗi mạng.

- [ ] **Step 4: Sửa `useCancelOrder` trong `order.mutations.ts`**

```ts
export function useCancelOrder() {
  return useMutation<CancelResult, Error, { orderId: string; token: string }>({
    mutationFn: ({ orderId, token }) => orderService.cancelOrder(orderId, token),
  });
}
```

Và sửa dòng import ở đầu file:

```ts
import { orderService, sessionOrderService, CancelResult } from "./order.api";
```

- [ ] **Step 5: Kiểm chứng anon đọc được `payment_received_at`**

RLS là row-level, nhưng phải xác nhận anon thật sự select được. Qua Supabase MCP `execute_sql`:

```sql
set role anon;
select status, payment_received_at from orders limit 1;
reset role;
```

Dùng `set role` chứ KHÔNG phải `set local role` — `set local` chỉ có tác dụng trong transaction,
chạy lẻ sẽ im lặng không đổi role và cho kết quả sai (đọc bằng quyền service role, luôn thành công).

Expected: trả về 1 dòng, không lỗi permission. Nếu lỗi thì **DỪNG và báo lại** — `getPaymentState`
không dùng được và Task 8 phải đổi cách.

- [ ] **Step 6: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: 8 lỗi baseline + lỗi tạm ở `pages/checkout/index.tsx`. `order.api.ts` vẫn đúng 4 lỗi cũ
(dòng 9, 147, 192, 196) — không nhiều hơn. Đừng sửa 4 lỗi đó.

- [ ] **Step 7: Commit**

```bash
git add mini-app/src/services/order/order.api.ts mini-app/src/services/order/order.mutations.ts
git commit -m "feat(mini-app): getPaymentState phan biet loi mang voi don khong con"
```

---

## Task 6: Khoá giỏ hàng ở tầng store

**Files:**
- Modify: `mini-app/src/stores/cart.store.tsx`

Khoá đặt ở trang checkout là bịt được một cửa. `/checkout` có `back: true`
([router.tsx:33](../../../mini-app/src/router.tsx)) nên khách rời về menu rồi sửa giỏ ở đó được —
quay lại thì banner dựng lại nhưng giỏ đã khác snapshot của đơn. Khoá phải nằm ở store.

- [ ] **Step 1: Thêm cờ khoá vào interface**

Trong `interface CartStore`, thêm hai dòng sau `clearCart`:

```ts
  // Id đơn đang chờ thanh toán. Khác null = giỏ bị đóng băng vì đã chốt vào một đơn pending;
  // mọi thao tác sửa giỏ (kể cả từ trang menu) đều bị chặn cho tới khi đơn được huỷ hoặc trả xong.
  lockedByOrderId: string | null;
  setCartLock: (orderId: string | null) => void;
```

- [ ] **Step 2: Đổi `create` để lấy được `get`**

Thay dòng `export const useCartStore = create<CartStore>((set) => ({` bằng:

```ts
export const useCartStore = create<CartStore>((set, get) => ({
```

Và thêm giá trị khởi tạo sau `checkoutSheetVisible: false,`:

```ts
  lockedByOrderId: null,
```

- [ ] **Step 3: Guard bốn hàm mutation**

Thêm dòng chặn vào **đầu thân** của `addToCart`, `updateCartItem`, `updateQuantity`, `removeItem`:

```ts
    if (get().lockedByOrderId) return;
```

Cụ thể, `addToCart` thành:

```ts
  addToCart: (newItem) => {
    if (get().lockedByOrderId) return;
    const itemId = generateCartItemId(newItem);
    ...
```

`updateCartItem` thành:

```ts
  updateCartItem: (id, updatedItem) => {
    if (get().lockedByOrderId) return;
    set((state) => {
    ...
```

`updateQuantity` thành:

```ts
  updateQuantity: (id, quantity) => {
    if (get().lockedByOrderId) return;
    set((state) => {
    ...
```

`removeItem` thành:

```ts
  removeItem: (id) => {
    if (get().lockedByOrderId) return;
    set((state) => {
    ...
```

`clearCart` **không** guard — nó chỉ được gọi khi đơn đã xong, và nó tự mở khoá.

- [ ] **Step 4: `clearCart` mở khoá + thêm `setCartLock`**

```ts
  clearCart: () => {
    set({ items: [], totalItems: 0, totalAmount: 0, lockedByOrderId: null });
  },

  setCartLock: (orderId) => {
    set({ lockedByOrderId: orderId });
  },
```

- [ ] **Step 5: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: 8 lỗi baseline + lỗi tạm ở `pages/checkout/index.tsx`, không có lỗi mới trong `cart.store.tsx`.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/stores/cart.store.tsx
git commit -m "feat(mini-app): khoa gio hang o tang store khi co don cho thanh toan"
```

---

## Task 7: Đối chiếu + rẽ nhánh ở trang giỏ hàng

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

- [ ] **Step 1: Thêm import**

Bổ sung vào khối import đầu file:

```ts
import { orderService, OrderPaymentState } from "@/services/order/order.api";
import type { CheckoutOutcome } from "@/services/checkout-result";
```

- [ ] **Step 2: Thêm hằng số và helper localStorage**

Ngay dưới `const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";`:

```ts
// Đơn đã tạo nhưng khách chưa trả tiền — giữ qua điều hướng để dựng lại banner khi quay lại trang.
const UNPAID_ORDER_KEY = "mevo_unpaid_order";

type UnpaidOrder = { id: string; token: string };

function loadUnpaidOrder(): UnpaidOrder | null {
  try {
    const raw = localStorage.getItem(UNPAID_ORDER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<UnpaidOrder>;
    // Thiếu token thì banner vô dụng: "Sửa món" không huỷ được đơn → coi như không có.
    if (typeof p.id !== "string" || !p.id) return null;
    if (typeof p.token !== "string" || !p.token) return null;
    return { id: p.id, token: p.token };
  } catch {
    return null;
  }
}

function saveUnpaidOrder(o: UnpaidOrder | null) {
  try {
    if (o) localStorage.setItem(UNPAID_ORDER_KEY, JSON.stringify(o));
    else localStorage.removeItem(UNPAID_ORDER_KEY);
  } catch {
    /* localStorage đầy hoặc bị chặn — chỉ mất khả năng dựng lại banner */
  }
}
```

- [ ] **Step 3: Thêm state, khởi tạo ĐỒNG BỘ**

Thay dòng comment mồ côi ở dòng 61 (`// Đơn ZaloPay đang chờ xử lý (kèm capability token...)`):

```ts
  // Khởi tạo ĐỒNG BỘ từ localStorage: banner phải có ngay từ khung hình đầu tiên, nếu không
  // sẽ có một khoảnh khắc nút "Đặt món" còn bấm được → tạo đơn thứ hai cho cùng giỏ hàng.
  // Việc hỏi DB sau đó (effect bên dưới) chỉ được phép GỠ banner xuống, không bao giờ dựng lên.
  const [unpaidOrder, setUnpaidOrder] = useState<UnpaidOrder | null>(() => loadUnpaidOrder());
  const [isCancelling, setIsCancelling] = useState(false);
  const isLocked = unpaidOrder !== null;
```

- [ ] **Step 4: Lấy `setCartLock` từ store**

Sửa dòng 73:

```ts
  const { items: cartItems, updateQuantity, clearCart, setCartLock } = useCartStore();
```

- [ ] **Step 5: Viết hai hàm trung tâm — đặt ngay trước `handleOrder`**

```ts
  // Bật/tắt banner ở cả ba nơi cùng lúc: state, localStorage, khoá giỏ hàng.
  const applyUnpaidOrder = (u: UnpaidOrder | null) => {
    setUnpaidOrder(u);
    saveUnpaidOrder(u);
    setCartLock(u ? u.id : null);
  };

  // Hàm đối chiếu DUY NHẤT. Mọi ngã rẽ ra khỏi banner đều đi qua đây.
  // Trả về true nếu đơn còn dùng được để thanh toán lại.
  const applyPaymentState = (st: OrderPaymentState, orderId: string): boolean => {
    if (st.kind === "unpaid_pending") return true;

    if (st.kind === "query_failed") {
      // KHÔNG đụng gì cả — giữ nguyên banner, giữ nguyên giỏ, giữ nguyên khoá.
      openSnackbar({ text: "Không kiểm tra được đơn, vui lòng thử lại.", type: "error" });
      return false;
    }

    if (st.kind === "cancelled") {
      // Đơn đã bị huỷ (sweep / nơi khác). Bỏ banner nhưng GIỮ giỏ để khách đặt lại ngay.
      applyUnpaidOrder(null);
      openSnackbar({ text: "Đơn cũ đã hết hạn. Mời bạn đặt lại.", type: "warning" });
      return false;
    }

    // settled — đơn đã có tiền hoặc đã vào bếp. Giờ mới được xoá giỏ.
    applyUnpaidOrder(null);
    clearCart();
    navigate(`/order-status/${orderId}`);
    return false;
  };
```

- [ ] **Step 6: Thay `handleZaloPayPayment` (dòng 207–221)**

```ts
  const handleZaloPayPayment = async (orderId: string, token: string | null) => {
    let outcome: CheckoutOutcome = "pending_confirm";
    let threw = false;
    try {
      outcome = await paymentService.payWithCheckoutSDK(orderId);
    } catch {
      // Không lấy được MAC: mạng lỗi, hoặc 409 vì đơn không còn 'pending' (đã bị sweep / đã trả).
      // TUYỆT ĐỐI không xoá giỏ ở đây — phải hỏi DB xem thực sự chuyện gì đã xảy ra.
      threw = true;
    }
    setIsProcessing(false);

    if (threw) {
      const st = await orderService.getPaymentState(orderId);
      if (applyPaymentState(st, orderId)) {
        // Đơn vẫn còn chờ trả tiền → giữ banner, chỉ báo lỗi mở thanh toán
        if (token) applyUnpaidOrder({ id: orderId, token });
        openSnackbar({ text: "Chưa mở được thanh toán, vui lòng thử lại.", type: "error" });
      }
      return;
    }

    // Chỉ hai trạng thái này đủ chắc chắn để nói với khách "chưa thanh toán".
    if (outcome === "abandoned" || outcome === "failed") {
      if (!token) {
        // Không có capability token thì "Sửa món" không huỷ được đơn → banner thành ngõ cụt.
        // Fail-safe: đi đường cũ, khách vẫn thấy đơn ở trang trạng thái.
        clearCart();
        navigate(`/order-status/${orderId}`);
        return;
      }
      applyUnpaidOrder({ id: orderId, token });
      // Đơn này sắp bị bỏ hoặc trả lại — đừng để app nhớ nó như đơn mang về gần nhất
      try {
        localStorage.removeItem("mevo_last_takeaway_order");
      } catch {
        /* bỏ qua */
      }
      return; // Ở LẠI trang giỏ hàng, KHÔNG clearCart, KHÔNG navigate
    }

    // 'success' | 'pending_confirm' → giữ nguyên hành vi cũ. Quán xác nhận khi thấy tiền;
    // KHÔNG hiện dialog "thử lại" (gây hiểu nhầm cho khách đã chuyển khoản).
    applyUnpaidOrder(null);
    clearCart();
    navigate(`/order-status/${orderId}`);
  };
```

- [ ] **Step 7: Truyền token ở nơi gọi và dọn đơn cũ**

Trong `onSuccess` của `createOrder`, thêm dòng đầu tiên rồi sửa lời gọi:

```ts
        onSuccess: async (order) => {
          // Đơn mới đã tạo → banner của đơn cũ không còn nghĩa gì
          applyUnpaidOrder(null);
          // Invalidate tab "Đã gọi" để hiện đơn mới ngay lập tức
          void queryClient.invalidateQueries({ queryKey: [GET_SESSION_ORDERS_KEY] });
          if (isTakeaway || paymentMethod === "zalo_checkout") {
            if (isTakeaway) {
              localStorage.setItem("mevo_last_takeaway_order", order.id);
            }
            await handleZaloPayPayment(order.id, order.capabilityToken);
          } else {
```

- [ ] **Step 8: Thêm effect khôi phục — đặt ngay sau effect làm nóng edge function (sau dòng 88)**

```ts
  // Đối chiếu đơn cũ với DB khi vào trang. Banner ĐÃ hiện sẵn từ useState khởi tạo đồng bộ;
  // effect này chỉ có quyền gỡ nó xuống. Lỗi mạng thì không gỡ gì cả.
  useEffect(() => {
    const saved = loadUnpaidOrder();
    if (!saved) return;
    setCartLock(saved.id); // khoá ngay, không chờ mạng
    let aborted = false;
    (async () => {
      const st = await orderService.getPaymentState(saved.id);
      if (aborted) return;
      applyPaymentState(st, saved.id);
    })();
    return () => {
      aborted = true;
    };
    // Chỉ chạy một lần khi vào trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 9: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: về đúng **8 lỗi baseline** — lỗi tạm ở `pages/checkout/index.tsx` đã hết. Banner UI chưa có
nhưng không được sinh lỗi kiểu nào.

- [ ] **Step 10: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): doi chieu DB o moi nga re, khong bao gio xoa gio nham"
```

---

## Task 8: Banner thay nút đặt món

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

- [ ] **Step 1: Viết hai hàm xử lý nút — đặt ngay sau `handleZaloPayPayment`**

```ts
  // "Thanh toán lại" — trả tiền cho ĐÚNG đơn cũ, không tạo đơn mới.
  // Hỏi DB TRƯỚC khi mở SDK: đơn có thể đã bị sweep (mở ra sẽ ăn 409) hoặc đã được trả rồi.
  const handleRetryPayment = async () => {
    if (!unpaidOrder || isProcessing || isCancelling) return;
    setIsProcessing(true);
    const st = await orderService.getPaymentState(unpaidOrder.id);
    if (!applyPaymentState(st, unpaidOrder.id)) {
      setIsProcessing(false);
      return;
    }
    await handleZaloPayPayment(unpaidOrder.id, unpaidOrder.token);
  };

  // "Sửa món" — huỷ đơn cũ rồi mở khoá giỏ. CHỈ tắt banner khi RPC xác nhận đã huỷ thật.
  const handleEditItems = async () => {
    if (!unpaidOrder || isProcessing || isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await orderService.cancelOrder(unpaidOrder.id, unpaidOrder.token);
      if (res.result === "cancelled" || res.result === "already_cancelled") {
        applyUnpaidOrder(null);
      } else if (res.reason === "already_paid") {
        // Đơn đã có tiền thật — không huỷ được, và cũng không nên bắt khách trả lại
        applyUnpaidOrder(null);
        clearCart();
        openSnackbar({ text: "Đơn này đã được thanh toán.", type: "success" });
        navigate(`/order-status/${unpaidOrder.id}`);
      } else {
        openSnackbar({ text: "Chưa huỷ được đơn, vui lòng thử lại.", type: "error" });
      }
    } catch {
      openSnackbar({ text: "Lỗi mạng, chưa huỷ được đơn.", type: "error" });
    } finally {
      setIsCancelling(false);
    }
  };
```

- [ ] **Step 2: Thay khối nút cuối trang (dòng 440–471)**

```tsx
      {/* Nút đặt món / banner chưa thanh toán — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-divider01 bg-white px-4 py-4 pb-5">
        {isLocked ? (
          <>
            <div className="mb-3 rounded-xl bg-[#FCEBEB] px-3 py-2.5">
              <p className="text-small font-semibold text-[#501313]">
                Thanh toán chưa thành công
              </p>
              <p className="mt-0.5 text-xxsmall leading-relaxed text-[#A32D2D]">
                Bếp chưa bắt đầu làm đơn này. Bạn có thể thanh toán lại hoặc sửa món.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleRetryPayment}
                disabled={isProcessing || isCancelling}
                className="flex-1 rounded-xl bg-primary py-3 font-semibold text-white active:bg-primary disabled:opacity-50"
              >
                {isProcessing ? "Đang mở..." : "Thanh toán lại"}
              </Button>
              <Button
                onClick={handleEditItems}
                disabled={isProcessing || isCancelling}
                className="flex-1 rounded-xl border-2 border-primary bg-white py-3 font-semibold text-primary disabled:opacity-50"
              >
                {isCancelling ? "Đang huỷ..." : "Sửa món"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-2 flex justify-between px-1">
              <span className="text-small text-text-secondary">Tổng cộng</span>
              <span className="text-large-m font-bold text-primary">
                {formatCurrency(payableAmount)}đ
              </span>
            </div>
            {!storeOpen && (
              <p className="mb-2 text-center text-xxsmall font-medium text-[#C0341A]">
                {isAcceptingOrders
                  ? "Quán đang ngoài giờ phục vụ, chưa nhận đơn."
                  : "Quán đang tạm nghỉ, chưa nhận đơn."}
              </p>
            )}
            <Button
              onClick={handleOrder}
              disabled={isLoading || cartItems.length === 0 || !isTakeawayFormValid || !storeOpen}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-white active:bg-primary disabled:opacity-50"
              fullWidth
            >
              {isLoading
                ? isPending
                  ? "Đang tạo đơn..."
                  : "Đang mở thanh toán..."
                : isTakeaway
                  ? "Đặt mang về & Thanh toán"
                  : paymentMethod === "zalo_checkout"
                    ? "Đặt món & Thanh toán"
                    : "Đặt món (Trả tiền mặt)"}
            </Button>
          </>
        )}
      </div>
```

- [ ] **Step 3: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: đúng **8 lỗi baseline**, không hơn.

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): banner thanh toan chua thanh cong thay nut dat mon"
```

---

## Task 9: Khoá form hiển thị

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

Store đã chặn mọi mutation giỏ hàng (Task 6). Task này làm phần **nhìn thấy được**: các ô nhập mờ
đi và không bấm được, để khách hiểu vì sao không sửa được chứ không tưởng app đơ.

Khoá bằng wrapper `pointer-events-none` — cuộn trang vẫn chạy vì touch rơi xuống phần tử cha.

- [ ] **Step 1: Khoá nút tăng/giảm số lượng**

Tại chỗ dùng `QuantityStepper` (khoảng dòng 358), thêm prop `disabled`.
**Giữ nguyên `variant="rounded"`** — bỏ đi là đổi hình dáng nút:

```tsx
                  <QuantityStepper
                    variant="rounded"
                    value={item.quantity}
                    disabled={isLocked}
                    onDecrease={() =>
                      updateQuantity(item.id, Math.max(0, item.quantity - 1))
                    }
                    onIncrease={() => updateQuantity(item.id, item.quantity + 1)}
                  />
```

- [ ] **Step 2: Khoá ô ghi chú**

Thay khối `{/* Ghi chú */}` (dòng 372–381):

```tsx
        {/* Ghi chú */}
        <div
          className={`mx-3.5 mt-3 rounded-xl bg-white px-4 py-3 ${
            isLocked ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <NoteInput
            label="Ghi chú cho bếp"
            placeholder="VD: Ít đường, không hành, ít cay..."
            maxLength={120}
            value={note}
            onChange={(val) => setNote(val)}
          />
        </div>
```

- [ ] **Step 3: Khoá chọn phương thức thanh toán**

Thay dòng mở khối (dòng 384–385):

```tsx
        {!singleMethod && !isTakeaway && (
          <div
            className={`mx-3.5 mt-3 rounded-xl bg-white px-4 py-4 ${
              isLocked ? "pointer-events-none opacity-50" : ""
            }`}
          >
```

- [ ] **Step 4: Khoá mã giảm giá**

Bọc `<VoucherSection ... />` (dòng 413–419):

```tsx
        <div className={isLocked ? "pointer-events-none opacity-50" : ""}>
          <VoucherSection
            storeId={storeId ?? ""}
            zaloUserId={zaloUserId || null}
            subtotal={totalAmount}
            selected={voucher}
            onSelect={setVoucher}
          />
        </div>
```

- [ ] **Step 5: Khoá form mang về**

Thay dòng mở khối form mang về (dòng 243–244):

```tsx
        {isTakeaway && (
          <div
            className={`mx-3.5 mt-4 rounded-xl bg-white p-4 ${
              isLocked ? "pointer-events-none opacity-50" : ""
            }`}
          >
```

- [ ] **Step 6: Type-check + chạy toàn bộ test**

Run: `cd mini-app && npm run typecheck && npm test`
Expected: typecheck đúng **8 lỗi baseline**, không hơn; 17 test PASS.

- [ ] **Step 7: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): khoa hien thi form khi banner chua thanh toan hien"
```

---

## Task 10: Checklist test tay

**Files:**
- Modify: `TESTING.md`

- [ ] **Step 1: Chèn mục mới vào `TESTING.md`**

Đặt **ngay trước** khối footer ở cuối file (`---` rồi hai dòng in nghiêng
*"File này là bộ nhớ test của dự án MEVO."*), không dán sau footer.

```markdown
## Thanh toán lại khi khách thoát màn chọn phương thức (2026-08-06)

Spec: `docs/superpowers/specs/2026-08-06-repay-abandoned-checkout-design.md`
Cần `zmp deploy` bản Development rồi thử trên Zalo thật — SDK không chạy trên trình duyệt.

Ghi lại `orderId` của đơn vừa tạo để kiểm DB đúng đơn đó, đừng lọc theo thời gian.

1. Bấm "Đặt món & Thanh toán" → thoát ngay ở màn chọn phương thức
   → **giỏ còn nguyên món**, banner đỏ "Thanh toán chưa thành công" hiện, KHÔNG bị chuyển trang.
2. Khi banner hiện: KHÔNG thấy nút "Đặt món & Thanh toán" gốc; nút tăng/giảm số lượng, ghi chú,
   mã giảm giá, chọn phương thức thanh toán, form mang về đều mờ và KHÔNG bấm được.
3. **Thử lách qua menu:** đang có banner → bấm back về menu → thử thêm món / đổi số lượng
   → giỏ KHÔNG đổi → quay lại giỏ hàng → banner còn nguyên, món vẫn đúng như cũ.
4. Bấm "Thanh toán lại" → sheet Zalo mở lại → chọn chuyển khoản và trả tiền
   → vào trang trạng thái đơn. Kiểm DB đúng đơn đó:
   `select status, payment_received_at from orders where id = '<orderId>';`
   → status khác `cancelled`.
5. Bấm "Sửa món" → banner tắt, nút "Đặt món & Thanh toán" quay lại, form mở khoá
   → thêm 1 món → đặt lại → `select status from orders where id = '<orderId cũ>';` ra `cancelled`,
   đơn mới có tổng tiền đúng.
6. Chuyển khoản: bấm Xác nhận → sang app ngân hàng → quay lại Zalo
   → vào trang trạng thái đơn như cũ, KHÔNG thấy banner.
7. Đang có banner → rời sang trang menu → quay lại giỏ hàng → banner dựng lại đúng.
8. **Đơn bị sweep:** đang có banner → chạy
   `update orders set status='cancelled' where id='<orderId>';` → bấm "Thanh toán lại"
   → banner tắt, hiện "Đơn cũ đã hết hạn. Mời bạn đặt lại.", **giỏ hàng VẪN CÒN MÓN**,
   nút "Đặt món & Thanh toán" quay lại.
9. **Đơn đã thu tiền:** đang có banner → nhờ bếp bấm "Đã nhận tiền" trên màn bếp
   → bấm "Thanh toán lại" → chuyển thẳng sang trang trạng thái đơn, giỏ được xoá.
10. **Mất mạng:** đang có banner → bật chế độ máy bay → bấm "Thanh toán lại"
    → banner **VẪN CÒN**, giỏ vẫn còn món, hiện thông báo lỗi. Không được tự tắt banner.
11. Đơn mang về, thoát ở màn chọn phương thức → kiểm `localStorage`:
    `mevo_last_takeaway_order` đã bị xoá, `mevo_unpaid_order` có giá trị.
12. Ví ZaloPay (quán đã đăng ký Zalo Merchant): trả xong → đơn tự `confirmed`, vào bếp,
    KHÔNG thấy banner.
```

- [ ] **Step 2: Commit**

```bash
git add TESTING.md
git commit -m "docs: checklist test thanh toan lai khi thoat man chon phuong thuc"
```

---

## Giới hạn đã biết, cố ý không xử lý

**Menu không báo gì khi giỏ bị khoá.** Khách đang có banner mà quay về menu bấm thêm món thì
không có gì xảy ra — đúng về mặt dữ liệu (Task 6 chặn ở store) nhưng im lặng. Thêm thông báo ở
menu đòi sửa thêm vài component ngoài phạm vi của thay đổi này. Tình huống này hiếm: khách đang
có banner thường bấm luôn một trong hai nút trước mắt. Bước 3 của checklist ghi nhận hành vi
hiện tại để sau này còn đối chiếu.

**Đơn `pending` bỏ dở vẫn nằm trên màn bếp** ở cột "CHỜ THANH TOÁN" cho tới khi chủ quán mở trang
Đơn hàng (sweep là lazy). Đây không phải hồi quy — hôm nay khách bấm back cũng để lại y hệt. Dọn
tự động là việc riêng, xem §8 của spec.

---

## Sau khi xong

Dừng lại, KHÔNG tự chuyển việc khác. Báo anh Tú:

> Xong rồi anh. Cần `zmp deploy` bản **Development** cho Pubu rồi test theo `TESTING.md`
> — mục "Thanh toán lại khi khách thoát màn chọn phương thức", 12 bước.
> Migration 038 đã áp prod. Anh chạy `zmp deploy` giúp em (lệnh interactive, em không chạy được).

⚠️ Nhắc anh Tú chọn **Development** (tự test) chứ không phải **Testing** (release) — Zalo giới hạn
số lần deploy mỗi tháng.
