# Thanh toán lại khi khách thoát màn chọn phương thức — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách bấm "Quay lại" ở màn chọn phương thức thanh toán thì giữ nguyên giỏ hàng, ở lại trang, và có nút "Thanh toán lại" / "Sửa món" — thay vì bị xoá giỏ rồi đẩy sang trang trạng thái đơn như hiện nay.

**Architecture:** Nguồn sự thật đổi từ biến cục bộ `zpOrderId` sang `resultCode` mà `checkTransaction({ data })` trả về, với `data` lấy từ payload sự kiện `PaymentDone` (đúng tài liệu Zalo, SDK ≥ 2.45). Logic phân loại tách thành hàm thuần `mapCheckoutResult` để unit test được. Đơn `pending` đã tạo được **giữ lại** và trả tiền lại trên chính nó; chỉ huỷ khi khách bấm "Sửa món", qua RPC `cancel_order` được sửa để trả kết quả rõ ràng thay vì `void` im lặng.

**Tech Stack:** React 18 + TypeScript + Zustand + zmp-sdk 2.49.4 (mini-app), Supabase PostgreSQL (RPC), vitest (mới dựng cho mini-app).

**Spec:** [docs/superpowers/specs/2026-08-06-repay-abandoned-checkout-design.md](../specs/2026-08-06-repay-abandoned-checkout-design.md)

---

## Cấu trúc file

| File | Trách nhiệm | Trạng thái |
|---|---|---|
| `mini-app/src/services/checkout-result.ts` | Hàm thuần `mapCheckoutResult` + type `CheckoutOutcome`. KHÔNG import gì (để vitest chạy zero-config) | Tạo mới |
| `mini-app/src/services/checkout-result.test.ts` | Unit test cho hàm trên | Tạo mới |
| `mini-app/vitest.config.mts` | Cấu hình vitest tối thiểu | Tạo mới |
| `mini-app/package.json` | Thêm devDependency `vitest` + script `test` | Sửa |
| `mini-app/src/services/payment.service.ts` | Nhận `data` từ `PaymentDone`, gọi `checkTransaction`, uỷ quyền phân loại cho `mapCheckoutResult` | Sửa |
| `mini-app/src/services/order/order.api.ts` | Thêm `getPaymentState`; `cancelOrder` trả `CancelResult` thay vì `void` | Sửa |
| `mini-app/src/services/order/order.mutations.ts` | `useCancelOrder` đổi kiểu trả về | Sửa |
| `mini-app/src/pages/checkout/index.tsx` | Rẽ nhánh theo outcome, state `unpaidOrder`, banner, khoá form, khôi phục localStorage | Sửa |
| `supabase/migrations/038_cancel_order_result.sql` | `cancel_order` trả `jsonb` + chặn đơn đã có tiền | Tạo mới |
| `TESTING.md` | Checklist test tay | Sửa |

---

## Task 1: Dựng vitest cho mini-app

**Files:**
- Modify: `mini-app/package.json`
- Create: `mini-app/vitest.config.mts`

Mini-app hiện chỉ có script `typecheck`, không có hạ tầng test nào. Task này chỉ dựng khung, chưa viết test.

- [ ] **Step 1: Cài vitest**

```bash
cd mini-app && npm install --save-dev vitest@^4.1.9
```

Dùng đúng version `admin-web` đang dùng để không lệch hai nơi.

- [ ] **Step 2: Thêm script `test` vào `mini-app/package.json`**

Trong khối `"scripts"`, thêm dòng `"test"` ngay sau `"typecheck"`:

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

// Cấu hình tối thiểu: chỉ chạy test cho logic THUẦN (không jsdom, không test component).
// Nêu rõ include để vitest không đi lạc vào node_modules hay thư mục build.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 4: Chạy thử để xác nhận khung hoạt động**

Run: `cd mini-app && npm test`
Expected: vitest khởi động và báo `No test files found` (chưa có file test — đúng như mong đợi ở bước này). Lệnh **không** được báo lỗi cấu hình.

- [ ] **Step 5: Commit**

```bash
git add mini-app/package.json mini-app/package-lock.json mini-app/vitest.config.mts
git commit -m "chore(mini-app): dung vitest cho logic thuan"
```

---

## Task 2: Hàm thuần `mapCheckoutResult` (TDD)

**Files:**
- Create: `mini-app/src/services/checkout-result.ts`
- Test: `mini-app/src/services/checkout-result.test.ts`

Đây là phần rủi ro nhất của cả thay đổi — viết test trước.

- [ ] **Step 1: Viết test thất bại**

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

- [ ] **Step 2: Chạy test để xác nhận nó THẤT BẠI**

Run: `cd mini-app && npm test`
Expected: FAIL — `Failed to resolve import "./checkout-result"` (file chưa tồn tại).

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `mini-app/src/services/checkout-result.ts`:

```ts
// Phân loại kết quả thanh toán Zalo Checkout — logic THUẦN, không import gì để vitest chạy được.
//
// Nguồn: https://docs.zaloplatforms.com/docs/MA/checkoutSdk/integration-process/overview/maResult
//   resultCode  1 = thanh toán thành công
//   resultCode  0 = đang thực hiện hoặc chờ xử lý
//   resultCode -1 = thanh toán thất bại
//   resultCode -2 = người dùng KHÔNG chọn phương thức và thoát Checkout SDK
//
// NGUYÊN TẮC: mọi trường hợp không chắc chắn đều rơi về 'pending_confirm'. Không bao giờ
// suy đoán "khách chưa trả tiền" — báo nhầm cho người đã chuyển khoản là lỗi nặng nhất.

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

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd mini-app && npm test`
Expected: PASS — 10 test đều xanh.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/services/checkout-result.ts mini-app/src/services/checkout-result.test.ts
git commit -m "feat(mini-app): ham thuan mapCheckoutResult theo resultCode Zalo"
```

---

## Task 3: Nối `mapCheckoutResult` vào `payment.service.ts`

**Files:**
- Modify: `mini-app/src/services/payment.service.ts`

Bỏ hẳn cơ chế `zpOrderId`; nhận `data` từ sự kiện `PaymentDone` và đưa thẳng vào `checkTransaction`.

- [ ] **Step 1: Thay phần đầu file (dòng 1–16)**

Thay khối import + khai báo type cũ:

```ts
// Payment service — Zalo Checkout SDK
// Luồng: server ký MAC (số tiền server tự lấy từ DB) → mở Payment.createOrder.
// Sự kiện PaymentDone bắn khi khách hoàn tất HOẶC thoát; nó truyền `data`, đưa thẳng `data` đó
// vào checkTransaction để lấy resultCode thật (tài liệu Zalo, SDK ≥ 2.45 — mình đang ở 2.49.4).
// Phân loại resultCode nằm ở ./checkout-result.ts (thuần, có test).

import { Payment, events, EventName } from 'zmp-sdk'
import { mapCheckoutResult, CheckoutOutcome, TransactionResult } from './checkout-result'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type { CheckoutOutcome }
```

Xoá hoàn toàn khối comment cũ mô tả `success | unpaid | cancelled` và dòng
`export type ZaloPayOutcome = 'success' | 'unpaid' | 'cancelled'`.

- [ ] **Step 2: Thay toàn bộ thân `payWithCheckoutSDK` từ khối `return await new Promise` tới hết hàm**

```ts
    return await new Promise<CheckoutOutcome>((resolve) => {
      let settled = false

      // Dọn sự kiện và resolve một lần duy nhất
      const finish = (outcome: CheckoutOutcome) => {
        if (settled) return
        settled = true
        events.off(EventName.PaymentDone, onPaymentDone)
        console.info('[checkout] outcome:', outcome)
        resolve(outcome)
      }

      // PaymentDone truyền `data` — đưa thẳng vào checkTransaction theo đúng tài liệu Zalo.
      const onPaymentDone = async (data?: unknown) => {
        try {
          if (!data) {
            // Không có payload → không đủ căn cứ kết luận. Chờ webhook cho an toàn.
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
          // Không rõ trạng thái → chờ webhook (tránh báo nhầm cho khách đã chuyển khoản)
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
          // Lỗi tạo giao dịch — giao dịch chưa hình thành nên chắc chắn chưa mất tiền
          console.warn('[checkout] createOrder fail callback')
          finish('failed')
        },
      } as Parameters<typeof Payment.createOrder>[0]).catch((e: unknown) => {
        console.error('[checkout] createOrder promise rejected:', e)
        finish('failed')
      })
    })
```

Lưu ý: callback `success` và biến `zpOrderId` bị xoá hẳn — không còn ai đọc `orderId` từ đó nữa.

- [ ] **Step 3: Sửa comment JSDoc của `payWithCheckoutSDK`**

Thay dòng `* Trả về 'success' nếu thanh toán xong, 'unpaid' nếu khách huỷ/thất bại.` bằng:

```ts
   * Trả về CheckoutOutcome — xem ./checkout-result.ts. 'abandoned'/'failed' là hai trạng thái
   * duy nhất đủ chắc chắn để nói với khách "chưa thanh toán".
```

- [ ] **Step 4: Kiểm tra không còn tham chiếu tên cũ**

Run: `cd mini-app && grep -rn "ZaloPayOutcome\|zpOrderId\|'unpaid'\|'cancelled'" src/services/payment.service.ts`
Expected: không có dòng nào khớp (exit code 1).

- [ ] **Step 5: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: PASS, không lỗi. Nếu báo lỗi ở `checkout/index.tsx` vì nó vẫn dùng kiểu cũ thì bỏ qua ở bước này — Task 6 sẽ sửa. Ghi lại đúng thông báo lỗi để đối chiếu.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/services/payment.service.ts
git commit -m "fix(mini-app): doc resultCode tu PaymentDone data thay vi doan qua zpOrderId"
```

---

## Task 4: Migration 038 — `cancel_order` trả kết quả rõ ràng

**Files:**
- Create: `supabase/migrations/038_cancel_order_result.sql`

RPC hiện `RETURNS void`; UPDATE trúng 0 dòng không sinh lỗi nên client tưởng đã huỷ. `useCancelOrder` hiện chưa nơi nào gọi nên đổi kiểu trả về là an toàn.

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

- [ ] **Step 2: Áp migration lên Supabase**

Dùng Supabase MCP `apply_migration` với name `038_cancel_order_result` và nội dung file trên.
Expected: áp thành công, không lỗi.

- [ ] **Step 3: Kiểm chứng bằng SQL thật**

Chạy qua Supabase MCP `execute_sql`. Tạo một đơn nháp rồi thử từng nhánh:

```sql
-- Chuẩn bị: lấy 1 store + table đang hoạt động
with s as (select id from stores where is_active limit 1),
     t as (select id, store_id from tables where is_active limit 1)
insert into orders (store_id, table_id, total_amount, payment_amount, status,
                    payment_method, capability_token)
select t.store_id, t.id, 1000, 1000, 'pending', 'zalo_checkout', 'TEST-TOKEN-038'
from t returning id;
```

Ghi lại `id` trả về, gọi nó là `<OID>`, rồi chạy lần lượt:

```sql
-- 1) Sai token → blocked/not_found_or_bad_token
select cancel_order('<OID>'::uuid, 'SAI-TOKEN');

-- 2) Đúng token, đơn pending sạch → cancelled
select cancel_order('<OID>'::uuid, 'TEST-TOKEN-038');

-- 3) Gọi lại lần nữa → already_cancelled
select cancel_order('<OID>'::uuid, 'TEST-TOKEN-038');
```

Expected lần lượt:
`{"result":"blocked","reason":"not_found_or_bad_token"}`,
`{"result":"cancelled"}`,
`{"result":"already_cancelled"}`.

Tiếp tục kiểm nhánh đã trả tiền:

```sql
with s as (select id from stores where is_active limit 1),
     t as (select id, store_id from tables where is_active limit 1)
insert into orders (store_id, table_id, total_amount, payment_amount, status,
                    payment_method, capability_token, payment_received_at, payment_received_via)
select t.store_id, t.id, 1000, 1000, 'pending', 'zalo_checkout', 'TEST-TOKEN-038B',
       now(), 'kitchen'
from t returning id;
```

Với `id` mới `<OID2>`:

```sql
select cancel_order('<OID2>'::uuid, 'TEST-TOKEN-038B');
```

Expected: `{"result":"blocked","reason":"already_paid"}` — **đây là ca quan trọng nhất**, đơn đã thu tiền không được huỷ.

- [ ] **Step 4: Dọn dữ liệu test**

```sql
delete from orders where capability_token in ('TEST-TOKEN-038','TEST-TOKEN-038B');
```

Expected: `DELETE 2`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/038_cancel_order_result.sql
git commit -m "feat(db): cancel_order tra jsonb + chan huy don da thu tien (mig 038)"
```

---

## Task 5: `order.api.ts` — `getPaymentState` + `cancelOrder` trả kết quả

**Files:**
- Modify: `mini-app/src/services/order/order.api.ts`
- Modify: `mini-app/src/services/order/order.mutations.ts`

- [ ] **Step 1: Thêm type `CancelResult` vào đầu `order.api.ts`**

Ngay sau khối `import` ở đầu file:

```ts
// Kết quả huỷ đơn từ RPC cancel_order (mig 038). 'blocked' = đơn KHÔNG bị huỷ.
export type CancelResult =
  | { result: 'cancelled' }
  | { result: 'already_cancelled' }
  | { result: 'blocked'; reason: string }

// Trạng thái thanh toán tối giản, dùng để quyết định có dựng lại banner hay không.
export type PaymentState = {
  status: string
  paymentReceivedAt: string | null
}
```

- [ ] **Step 2: Thay `cancelOrder` (hiện ở khoảng dòng 42–48)**

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
  // Hỏi DB trạng thái thật của đơn. Dùng khi dựng lại banner sau khi khách rời trang:
  // đơn có thể đã được bếp xác nhận tiền / bị huỷ / callback ví đã về trong lúc khách đi chỗ khác.
  getPaymentState: async (orderId: string): Promise<PaymentState | null> => {
    const { data, error } = await supabase
      .from("orders")
      .select("status, payment_received_at")
      .eq("id", orderId)
      .single();
    if (error || !data) return null;
    return {
      status: data.status as string,
      paymentReceivedAt: (data.payment_received_at as string | null) ?? null,
    };
  },
```

- [ ] **Step 4: Sửa `useCancelOrder` trong `order.mutations.ts`**

Thay khối hiện tại (dòng 18–22):

```ts
export function useCancelOrder() {
  return useMutation<CancelResult, Error, { orderId: string; token: string }>({
    mutationFn: ({ orderId, token }) => orderService.cancelOrder(orderId, token),
  });
}
```

Và bổ sung `CancelResult` vào import ở đầu file:

```ts
import { orderService, sessionOrderService, CancelResult } from "./order.api";
```

- [ ] **Step 5: Kiểm chứng anon đọc được `payment_received_at`**

RLS là row-level, nhưng phải xác nhận anon thật sự select được cột này. Chạy qua Supabase MCP `execute_sql`:

```sql
set role anon;
select status, payment_received_at from orders limit 1;
reset role;
```

Dùng `set role` chứ KHÔNG phải `set local role` — `set local` chỉ có tác dụng trong transaction,
chạy lẻ sẽ im lặng không đổi role và cho kết quả sai (đọc bằng quyền service role, luôn thành công).

Expected: trả về 1 dòng, không lỗi permission. Nếu lỗi thì DỪNG và báo lại — `getPaymentState` sẽ không dùng được và Task 9 phải đổi cách.

- [ ] **Step 6: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: chỉ còn lỗi ở `checkout/index.tsx` (Task 6 sửa). Không lỗi trong `order.api.ts` / `order.mutations.ts`.

- [ ] **Step 7: Commit**

```bash
git add mini-app/src/services/order/order.api.ts mini-app/src/services/order/order.mutations.ts
git commit -m "feat(mini-app): cancelOrder tra ket qua + them getPaymentState"
```

---

## Task 6: Rẽ nhánh theo outcome ở trang giỏ hàng

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

- [ ] **Step 1: Thêm import và hằng số**

Bổ sung vào khối import ở đầu file:

```ts
import { orderService } from "@/services/order/order.api";
```

Thêm hằng số ngay dưới `const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";`:

```ts
// Đơn đã tạo nhưng khách chưa trả tiền — giữ qua điều hướng để dựng lại banner khi quay lại trang.
const UNPAID_ORDER_KEY = "mevo_unpaid_order";

type UnpaidOrder = { id: string; token: string };

function loadUnpaidOrder(): UnpaidOrder | null {
  try {
    const raw = localStorage.getItem(UNPAID_ORDER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<UnpaidOrder>;
    if (typeof p.id !== "string" || typeof p.token !== "string") return null;
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
    /* localStorage đầy hoặc bị chặn — bỏ qua, chỉ mất khả năng dựng lại banner */
  }
}
```

- [ ] **Step 2: Thêm state `unpaidOrder`**

Thay dòng comment mồ côi ở dòng 61 (`// Đơn ZaloPay đang chờ xử lý (kèm capability token...)`) bằng:

```ts
  // Đơn đã tạo nhưng khách chưa trả tiền (kèm capability token để huỷ khi bấm "Sửa món")
  const [unpaidOrder, setUnpaidOrder] = useState<UnpaidOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const isLocked = unpaidOrder !== null;
```

- [ ] **Step 3: Thay `handleZaloPayPayment` (dòng 207–221)**

```ts
  const handleZaloPayPayment = async (orderId: string, token: string | null) => {
    let outcome: CheckoutOutcome = "pending_confirm";
    try {
      outcome = await paymentService.payWithCheckoutSDK(orderId);
    } catch {
      // SDK lỗi bất ngờ — không đủ căn cứ kết luận, coi như chờ xác nhận
      outcome = "pending_confirm";
    }
    setIsProcessing(false);

    // Chỉ hai trạng thái này đủ chắc chắn để nói với khách "chưa thanh toán".
    if (outcome === "abandoned" || outcome === "failed") {
      const u = { id: orderId, token: token ?? "" };
      setUnpaidOrder(u);
      saveUnpaidOrder(u);
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
    clearCart();
    navigate(`/order-status/${orderId}`);
  };
```

Bổ sung import kiểu ở đầu file:

```ts
import { paymentService } from "@/services/payment.service";
import type { CheckoutOutcome } from "@/services/checkout-result";
```

(dòng `import { paymentService }` đã có sẵn — chỉ thêm dòng `import type`.)

- [ ] **Step 4: Truyền token ở nơi gọi (dòng 190)**

Trong `onSuccess` của `createOrder`, thay `await handleZaloPayPayment(order.id);` bằng:

```ts
            await handleZaloPayPayment(order.id, order.capabilityToken);
```

- [ ] **Step 5: Dọn đơn cũ khi đặt đơn mới thành công**

Ngay đầu `onSuccess`, trước `queryClient.invalidateQueries`, thêm:

```ts
          // Đơn mới đã tạo → banner của đơn cũ không còn nghĩa gì
          setUnpaidOrder(null);
          saveUnpaidOrder(null);
```

- [ ] **Step 6: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: PASS hoàn toàn, không còn lỗi nào.

- [ ] **Step 7: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): o lai gio hang khi khach thoat man chon phuong thuc"
```

---

## Task 7: Banner thay nút đặt món

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

Banner phải **thay thế** nút "Đặt món & Thanh toán", không nằm cạnh — để cả hai thì khách bấm nút gốc sẽ tạo đơn thứ hai cho cùng một giỏ.

- [ ] **Step 1: Viết hàm xử lý hai nút**

Thêm ngay sau `handleZaloPayPayment`:

```ts
  // "Thanh toán lại" — trả tiền cho ĐÚNG đơn cũ, không tạo đơn mới.
  const handleRetryPayment = async () => {
    if (!unpaidOrder) return;
    setIsProcessing(true);
    await handleZaloPayPayment(unpaidOrder.id, unpaidOrder.token);
  };

  // "Sửa món" — huỷ đơn cũ rồi mở khoá giỏ. CHỈ tắt banner khi RPC xác nhận đã huỷ thật.
  const handleEditItems = async () => {
    if (!unpaidOrder || isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await orderService.cancelOrder(unpaidOrder.id, unpaidOrder.token);
      if (res.result === "cancelled" || res.result === "already_cancelled") {
        setUnpaidOrder(null);
        saveUnpaidOrder(null);
      } else if (res.reason === "already_paid") {
        // Đơn đã có tiền thật — không được huỷ, và cũng không nên bắt khách trả lại
        saveUnpaidOrder(null);
        openSnackbar({ text: "Đơn này đã được thanh toán.", type: "success" });
        clearCart();
        navigate(`/order-status/${unpaidOrder.id}`);
      } else {
        openSnackbar({
          text: "Chưa huỷ được đơn, vui lòng thử lại.",
          type: "error",
        });
      }
    } catch {
      openSnackbar({ text: "Lỗi mạng, chưa huỷ được đơn.", type: "error" });
    } finally {
      setIsCancelling(false);
    }
  };
```

- [ ] **Step 2: Thay khối nút cuối trang (dòng 440–471)**

Thay toàn bộ `<div className="fixed bottom-0 ...">` bằng:

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
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): banner thanh toan chua thanh cong thay nut dat mon"
```

---

## Task 8: Khoá toàn bộ form khi banner hiện

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

Đơn `pending` đã chốt món, giá và voucher. Sửa bất cứ thứ gì trong lúc banner hiện đều làm màn hình nói dối, vì "Thanh toán lại" trả theo `total_amount` của đơn cũ. Khoá bằng wrapper `pointer-events-none` — cuộn trang vẫn hoạt động vì touch rơi xuống phần tử cha.

- [ ] **Step 1: Khoá nút tăng/giảm số lượng**

`QuantityStepper` đã có sẵn prop `disabled`. Tại chỗ dùng (khoảng dòng 358–365), thêm:

```tsx
                  <QuantityStepper
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

Thay dòng mở khối `{!singleMethod && !isTakeaway && (` (dòng 384–385):

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

Thay dòng mở khối `{isTakeaway && (` của form mang về (dòng 243–244):

```tsx
        {isTakeaway && (
          <div
            className={`mx-3.5 mt-4 rounded-xl bg-white p-4 ${
              isLocked ? "pointer-events-none opacity-50" : ""
            }`}
          >
```

- [ ] **Step 6: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): khoa toan bo form khi banner chua thanh toan hien"
```

---

## Task 9: Khôi phục banner khi quay lại trang

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

React state mất khi rời trang. Không xử lý thì khách quay lại sẽ mất banner nhưng đơn cũ vẫn sống → bấm đặt món là có **hai** đơn `pending`.

- [ ] **Step 1: Thêm effect khôi phục**

Đặt ngay sau effect làm nóng edge function (sau dòng 88):

```ts
  // Dựng lại banner khi khách quay lại trang. LUÔN hỏi DB thay vì tin localStorage:
  // đơn có thể đã được bếp xác nhận tiền, đã bị huỷ, hoặc callback ví đã về.
  useEffect(() => {
    const saved = loadUnpaidOrder();
    if (!saved) return;
    let cancelled = false;
    (async () => {
      try {
        const st = await orderService.getPaymentState(saved.id);
        if (cancelled) return;
        const stillUnpaid =
          st !== null && st.status === "pending" && st.paymentReceivedAt === null;
        if (stillUnpaid) {
          setUnpaidOrder(saved);
        } else {
          saveUnpaidOrder(null);
        }
      } catch {
        // Không hỏi được DB → không dựng banner, và giữ nguyên key để thử lại lần sau
      }
    })();
    return () => {
      cancelled = true;
    };
    // Chỉ chạy một lần khi vào trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Type-check**

Run: `cd mini-app && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Chạy toàn bộ unit test**

Run: `cd mini-app && npm test`
Expected: PASS — 10 test của `mapCheckoutResult` vẫn xanh.

- [ ] **Step 4: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): dung lai banner chua thanh toan khi quay lai gio hang"
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

1. Bấm "Đặt món & Thanh toán" → thoát ngay ở màn chọn phương thức
   → **giỏ còn nguyên món**, banner đỏ "Thanh toán chưa thành công" hiện, KHÔNG bị chuyển trang.
2. Khi banner hiện: KHÔNG thấy nút "Đặt món & Thanh toán" gốc; nút tăng/giảm số lượng, ghi chú,
   mã giảm giá, chọn phương thức thanh toán, form mang về đều mờ và KHÔNG bấm được.
3. Bấm "Thanh toán lại" → sheet Zalo mở lại → chọn chuyển khoản và trả tiền
   → vào trang trạng thái đơn. Kiểm DB: `select status, count(*) from orders where created_at > now() - interval '10 minutes' group by 1;`
   → KHÔNG có đơn `cancelled` nào.
4. Bấm "Sửa món" → banner tắt, nút "Đặt món & Thanh toán" quay lại, form mở khoá
   → thêm 1 món → đặt lại → đơn cũ `cancelled`, đơn mới có tổng tiền đúng.
5. Chuyển khoản: bấm Xác nhận → sang app ngân hàng → quay lại Zalo
   → vào trang trạng thái đơn như cũ, KHÔNG thấy banner.
6. Đang có banner → rời sang trang menu → quay lại giỏ hàng → banner dựng lại đúng.
7. Đang có banner → nhờ bếp bấm "Đã nhận tiền" trên màn bếp → quay lại giỏ hàng
   → banner KHÔNG dựng lại.
8. Đơn mang về, thoát ở màn chọn phương thức → kiểm `localStorage`:
   `mevo_last_takeaway_order` đã bị xoá, `mevo_unpaid_order` có giá trị.
9. Ví ZaloPay (quán đã đăng ký Zalo Merchant): trả xong → đơn tự `confirmed`, vào bếp,
   KHÔNG thấy banner.
```

- [ ] **Step 2: Commit**

```bash
git add TESTING.md
git commit -m "docs: checklist test thanh toan lai khi thoat man chon phuong thuc"
```

---

## Sau khi xong

Dừng lại, KHÔNG tự chuyển việc khác. Báo anh Tú:

> Xong rồi anh. Cần `zmp deploy` bản **Development** cho Pubu rồi test theo `TESTING.md`
> — mục "Thanh toán lại khi khách thoát màn chọn phương thức", 9 bước.
> Migration 038 đã áp prod. Anh chạy `zmp deploy` giúp em (lệnh interactive, em không chạy được).

⚠️ Nhắc anh Tú chọn **Development** (tự test) chứ không phải **Testing** (release) — Zalo giới hạn
số lần deploy mỗi tháng.
