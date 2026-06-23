# ZaloPay Abandon → Cash Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Khi khách mở ZaloPay rồi bỏ dở/không trả, cho phép (có xác nhận) chuyển đơn sang **tiền mặt** để vào bếp và thu sau — thay vì kẹt `pending` vô vọng.

**Architecture:** Thêm RPC `abandon_zalopay_to_cash` (server-side, guard chống đụng đơn đã trả). Mini-app bắt sự kiện ZaloPay fail/abandon → hiện dialog xác nhận → gọi RPC. `checkout-notify` nhánh thất bại để nguyên `pending` (không cancel) tránh đua với dialog. Kitchen display map thêm `payment_method` để đơn chuyển-sang-cash hiện ngay.

**Tech Stack:** Supabase plpgsql + MCP; mini-app TS (`@supabase/supabase-js`, zmp-ui Modal); admin-web React client component.

**Branch:** tiếp tục trên `feat/order-integrity-tenant-safe`. Sau khi xong: deploy mini-app **v7** + cập nhật `NEXT_PUBLIC_ZALO_VERSION=7` trên Vercel admin-web.

**Test reality:** verify DB bằng Supabase MCP execute_sql; verify client bằng test thủ công trên Zalo (không có test runner). Checkpoint cuối theo CLAUDE.md.

---

### Task A: RPC `abandon_zalopay_to_cash`

**Files:** Create `supabase/migrations/005_abandon_zalopay_to_cash.sql`

- [ ] **Step 1: Viết migration**

```sql
-- 005 — Chuyển đơn ZaloPay bỏ dở sang tiền mặt (có guard chống đụng đơn đã trả).
-- Gọi khi khách huỷ/đóng sheet ZaloPay và xác nhận muốn trả tiền mặt.
CREATE OR REPLACE FUNCTION abandon_zalopay_to_cash(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  UPDATE orders
     SET payment_method = 'cash'
   WHERE id = p_order_id
     AND status = 'pending'
     AND payment_method = 'zalopay'
     AND zalopay_trans_id IS NULL   -- chốt an toàn: KHÔNG đụng đơn đã trả thành công
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RETURN NULL;  -- no-op: đơn không đủ điều kiện (đã trả/đã xử lý) — client coi như giữ nguyên
  END IF;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION abandon_zalopay_to_cash(uuid) FROM public;
GRANT EXECUTE ON FUNCTION abandon_zalopay_to_cash(uuid) TO anon;
```

- [ ] **Step 2: Apply** qua Supabase MCP `apply_migration` (name `005_abandon_zalopay_to_cash`, project `dlkgdpexjtyynbotkwka`).

- [ ] **Step 3: Verify** qua `execute_sql`:
  - Tạo 1 đơn zalopay pending bằng `create_order` (note `'verify-005'`), gọi `abandon_zalopay_to_cash(<id>)` → đơn trả về có `payment_method='cash'`.
  - Gọi lại lần 2 trên cùng đơn (giờ đã cash) → trả `NULL` (no-op).
  - Tạo 1 đơn zalopay rồi set `zalopay_trans_id='x'` thủ công → gọi RPC → trả `NULL` (guard chặn đơn đã trả). Dọn: `DELETE FROM orders WHERE note='verify-005';`

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/005_abandon_zalopay_to_cash.sql
git commit -m "feat(db): RPC abandon_zalopay_to_cash (huỷ ZaloPay → tiền mặt, guard đơn đã trả)"
```

---

### Task B: `checkout-notify` — nhánh thất bại để nguyên pending

**Files:** Modify `supabase/functions/checkout-notify/index.ts`

- [ ] **Step 1: Sửa nhánh resultCode≠1**

Thay đoạn (hiện đang set `cancelled`):
```ts
    // Thanh toán thất bại → huỷ đơn pending (không đẩy vào bếp)
    if (Number(data.resultCode) !== 1) {
      await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', appOrderId)
        .eq('status', 'pending')
      return resp(1, 'payment failed acknowledged')
    }
```
thành (KHÔNG cancel — để client dialog quyết định chuyển cash hay thử lại; tránh đua):
```ts
    // Thanh toán thất bại → KHÔNG đụng đơn (để nguyên pending).
    // Client sẽ hỏi khách: chuyển tiền mặt (abandon_zalopay_to_cash) hay thử lại.
    if (Number(data.resultCode) !== 1) {
      return resp(1, 'payment failed acknowledged')
    }
```

- [ ] **Step 2: Deploy edge function** qua Supabase MCP `deploy_edge_function` (slug `checkout-notify`, project `dlkgdpexjtyynbotkwka`, giữ `verify_jwt=false`). Lấy toàn bộ nội dung file sau khi sửa làm `files` body.

- [ ] **Step 3: Verify** — không có cách bắn callback thất bại từ MCP; xác minh bằng đọc lại code đã deploy (`get_edge_function`) đúng là nhánh thất bại chỉ `return resp(1, ...)`, không còn update `cancelled`. Ghi rõ trong report.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/checkout-notify/index.ts
git commit -m "fix(edge): checkout-notify không cancel khi thất bại (để client chọn cash/thử lại)"
```

---

### Task C: Mini-app — dialog xác nhận chuyển tiền mặt

**Files:**
- Modify `mini-app/src/services/order/order.api.ts` (thêm method `abandonToCash`)
- Modify `mini-app/src/pages/checkout/index.tsx` (dialog + xử lý fail)

- [ ] **Step 1: Thêm service method** vào `orderService` trong `order.api.ts`:
```ts
  abandonToCash: async (orderId: string): Promise<Order | null> => {
    const { data, error } = await supabase.rpc("abandon_zalopay_to_cash", {
      p_order_id: orderId,
    });
    if (error) throw error;
    return data ? mapOrder(data as Record<string, unknown>) : null;
  },
```
(Thêm vào `database.types.ts` `Functions.abandon_zalopay_to_cash` với `Args: { p_order_id: string }`, `Returns: Json` — phẫu thuật như `create_order` trước đó.)

- [ ] **Step 2: Sửa `checkout/index.tsx`** — khi ZaloPay fail/abandon, thay vì chỉ snackbar, hiện dialog xác nhận.

Thêm state:
```tsx
  const [pendingZpOrderId, setPendingZpOrderId] = useState<string | null>(null);
```
Trong `handleZaloPayPayment`, nhánh `catch` (hiện đang openSnackbar) → thay bằng mở dialog:
```tsx
    } catch (err) {
      // Bỏ dở/thất bại ZaloPay → hỏi khách có chuyển sang tiền mặt không
      setPendingZpOrderId(orderId);
    } finally {
      setIsProcessing(false);
    }
```
Thêm handler + dialog (dùng `Modal` của zmp-ui — import `{ Modal }` from "zmp-ui", theo pattern lib):
```tsx
  const confirmCashFallback = async () => {
    if (!pendingZpOrderId) return;
    try {
      await orderService.abandonToCash(pendingZpOrderId);
    } catch {
      // nếu lỗi, vẫn điều hướng — đơn giữ pending, không chặn khách
    }
    const id = pendingZpOrderId;
    setPendingZpOrderId(null);
    clearCart();
    navigate(`/order-status/${id}`);
  };

  const retryZaloPay = () => {
    const id = pendingZpOrderId;
    setPendingZpOrderId(null);
    if (id) handleZaloPayPayment(id);
  };
```
Render `<Modal visible={!!pendingZpOrderId} ...>` tiêu đề "Thanh toán chưa hoàn tất", nội dung "Chuyển sang trả tiền mặt (thu khi ra về) hay thử lại ZaloPay?", 2 nút: **"Trả tiền mặt"** → `confirmCashFallback`, **"Thử lại ZaloPay"** → `retryZaloPay`. (Khớp API Modal của zmp-ui; nếu khác, xem cách dùng zmp-ui khác trong app.)

Import `orderService` from "@/services/order/order.api".

- [ ] **Step 3: Typecheck** chỉ file đụng tới: `cd mini-app && npx tsc --noEmit 2>&1 | grep -E "order.api|checkout/index|database.types" || echo "no errors in touched files"`. (Dự án có ~144 lỗi tiền tồn không liên quan — chỉ cần KHÔNG thêm lỗi ở file mình sửa. KHÔNG cài thêm typescript/đổi tsconfig.)

- [ ] **Step 4: Commit**
```bash
git add mini-app/src/services/order/order.api.ts mini-app/src/pages/checkout/index.tsx mini-app/src/types/database.types.ts
git commit -m "feat(mini-app): huỷ ZaloPay → hỏi chuyển tiền mặt (dialog)"
```

---

### Task D: Kitchen display — phản ánh đổi payment_method realtime

**Files:** Modify `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`

- [ ] **Step 1: Sửa handler realtime UPDATE** (hiện chỉ map `status` + `updatedAt`) để map thêm `payment_method`, nhờ đó đơn vừa chuyển zalopay→cash lọt vào `waitingOrders` ngay (không cần F5).

Trong block `.on('postgres_changes', { event: 'UPDATE', ... }, (payload) => {...})`, sửa map:
```tsx
          (payload) => {
            const updated = payload.new as {
              id: string; status: string; updated_at: string; payment_method: string
            }
            setOrders((prev) =>
              prev
                .map((o) =>
                  o.id === updated.id
                    ? {
                        ...o,
                        status: updated.status as OrderStatus,
                        updatedAt: updated.updated_at,
                        paymentMethod: updated.payment_method as KitchenOrder['paymentMethod'],
                      }
                    : o,
                )
                .filter((o) => !['paid', 'cancelled'].includes(o.status)),
            )
          },
```
(Lưu ý: admin-web là bản Next.js tuỳ biến — nhưng đây là client component React thuần, chỉ sửa logic map, không đụng API Next.js. Vẫn đọc lướt `admin-web/AGENTS.md` trước.)

- [ ] **Step 2: Verify** — typecheck/lint admin-web nếu có script; nếu không, xác nhận bằng đọc code (kiểu `KitchenOrder.paymentMethod` đã tồn tại trong types). Test thật ở checkpoint.

- [ ] **Step 3: Commit**
```bash
git add "admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx"
git commit -m "fix(kitchen): map payment_method realtime để đơn chuyển sang cash hiện ngay"
```

---

## Checkpoint test (BẮT BUỘC — CLAUDE.md)
Sau Task D, DỪNG. Anh Tú:
1. Deploy mini-app **v7** (`cd mini-app && npm run deploy`) + đặt `NEXT_PUBLIC_ZALO_VERSION=7` trên Vercel admin-web → redeploy admin-web.
2. Mở link `...&version=7...` → đặt món → ZaloPay → **đóng sheet** → hiện dialog → bấm **"Trả tiền mặt"** → đơn về bếp dạng tiền mặt (cột Chờ xử lý), không cần F5.
3. Thử lại 1 đơn ZaloPay **trả thành công** → vẫn auto `confirmed` về bếp (không bị #2 phá).
4. (Nếu được) bấm **"Thử lại ZaloPay"** trong dialog → mở lại sheet thanh toán.

## Self-review (đã chạy)
- Coverage: phủ #1-followup (#2 đề bài). Guard đơn đã trả (transId null) ở RPC + webhook không cancel → không đua. Kitchen map payment_method để hiện live.
- No placeholder: SQL/diff/command cụ thể; riêng UI Modal cho phép implementer khớp API zmp-ui (đã chỉ rõ pattern + fallback).
- Type consistency: RPC tên `abandon_zalopay_to_cash`, tham số `p_order_id` khớp giữa SQL ↔ client ↔ types.
