# ZaloPay Checkout Secret Theo Từng Quán — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển 2 edge function `checkout-create-mac`/`checkout-notify` từ dùng 1 secret ZaloPay
Checkout SDK toàn cục sang đọc secret theo từng quán (bảng `store_checkout_configs` riêng,
không nằm trong `stores` vì lý do RLS), để chuẩn bị cho việc nhân bản mini-app sang quán khác
mà không cần sửa code payment lần nữa.

**Architecture:** Bảng mới `store_checkout_configs` (RLS bật, không policy nào → chỉ service
role đọc được) map `store_id ↔ zalo_mini_app_id ↔ zalo_checkout_secret_key`.
`checkout-create-mac` tra theo `order.store_id`. `checkout-notify` tra theo `data.appId` của
Zalo **trước khi verify MAC**, sau đó đối chiếu `order.store_id` khớp với quán suy ra từ
`appId`. Rollout: tạo bảng → insert config Pubu → deploy code mới — không có khoảng trống thiếu
secret.

**Tech Stack:** Supabase Postgres (migration SQL) + Supabase Edge Functions (Deno/TypeScript),
Supabase MCP tools (`execute_sql`, `apply_migration`, `deploy_edge_function`).

**Spec:** [docs/superpowers/specs/2026-07-01-per-store-zalopay-checkout-secret-design.md](../specs/2026-07-01-per-store-zalopay-checkout-secret-design.md)

---

### Task 1: Migration — bảng `store_checkout_configs`

**Files:**
- Create: `supabase/migrations/017_store_checkout_configs.sql`

- [ ] **Step 1: Viết migration**

```sql
-- 017_store_checkout_configs.sql
-- Secret ZaloPay Checkout SDK theo từng quán — tách bảng riêng (KHÔNG nằm trong `stores`)
-- vì RLS `anon_read_stores` cho anon SELECT toàn cột của `stores`; secret ở bảng riêng
-- không có policy nào nên chỉ service role (bypass RLS) đọc được.

CREATE TABLE store_checkout_configs (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  zalo_mini_app_id text NOT NULL UNIQUE,
  zalo_checkout_secret_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE store_checkout_configs ENABLE ROW LEVEL SECURITY;
-- Cố ý KHÔNG tạo policy nào: anon/authenticated không có quyền gì trên bảng này.

CREATE TRIGGER store_checkout_configs_updated_at
  BEFORE UPDATE ON store_checkout_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Áp migration lên Supabase prod bằng MCP**

Dùng tool `mcp__638e660e-3e7a-403a-a61e-834a80bf966b__apply_migration` với
`project_id = dlkgdpexjtyynbotkwka`, `name = 017_store_checkout_configs`, nội dung SQL ở
Step 1.

- [ ] **Step 3: Verify bảng đã tạo, RLS bật, không có policy nào**

```sql
select relrowsecurity from pg_class where relname = 'store_checkout_configs';
-- expect: true
select count(*) from pg_policies where tablename = 'store_checkout_configs';
-- expect: 0
```

- [ ] **Step 4: Commit file migration**

```bash
git add supabase/migrations/017_store_checkout_configs.sql
git commit -m "feat: bảng store_checkout_configs cho secret ZaloPay theo từng quán"
```

---

### Task 2: Insert config thật cho Phở Gà Pubu

**Không tạo file nào** — thao tác SQL trực tiếp qua Supabase MCP, KHÔNG viết secret vào bất kỳ
file nào trong repo.

- [ ] **Step 1: Hỏi anh Tú giá trị secret hiện tại**

Secret này hiện là biến môi trường `ZALO_CHECKOUT_SECRET_KEY` đặt trên Supabase Edge Functions
(Dashboard → Edge Functions → Secrets, hoặc `supabase secrets list` — CHỈ xem được tên, không
xem được giá trị qua CLI/API). Vì secret là write-only qua API, người thực hiện phải hỏi trực
tiếp anh Tú giá trị thật (anh Tú là người đã set secret này lúc làm ZaloPay Checkout SDK,
xem `docs/superpowers/specs/2026-06-21-checkout-sdk-payment-design.md`), hoặc lấy lại từ nơi
anh Tú lưu trữ mật khẩu quản lý (password manager). KHÔNG đoán, KHÔNG để trống.

- [ ] **Step 2: Insert config (thay `<secret thật>` bằng giá trị vừa lấy được)**

```sql
insert into store_checkout_configs (store_id, zalo_mini_app_id, zalo_checkout_secret_key)
select id, '383290948854768685', '<secret thật>'
from stores where slug = 'pho-ga-pubu';
```

Chạy qua `mcp__638e660e-3e7a-403a-a61e-834a80bf966b__execute_sql`.

- [ ] **Step 3: Verify KHÔNG log secret ra**

```sql
select store_id, zalo_mini_app_id, is_enabled, created_at
from store_checkout_configs where store_id = (select id from stores where slug = 'pho-ga-pubu');
```

Chỉ SELECT các cột không phải secret để xác nhận có đúng 1 dòng, `is_enabled = true`.

---

### Task 3: Sửa `checkout-create-mac` đọc secret theo `store_id`

**Files:**
- Modify: `supabase/functions/checkout-create-mac/index.ts`

- [ ] **Step 1: Thay toàn bộ nội dung file**

```typescript
// Supabase Edge Function — Ký MAC cho Zalo Checkout SDK Payment.createOrder
// Mini app gọi với { orderId }. Server TỰ đọc số tiền từ DB (không tin client),
// build body + ký MAC bằng secret CỦA ĐÚNG QUÁN (store_checkout_configs), trả về cho mini app.
// Secrets: ZALO_PAYMENT_METHOD (tuỳ chọn, mặc định ZALOPAY_SANDBOX) — secret ký MAC đọc từ DB.
// verify_jwt: true (mini app gửi anon JWT)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hmacSHA256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId } = await req.json()
    if (!orderId) return json({ error: 'Thiếu orderId' }, 400)

    const methodId = Deno.env.get('ZALO_PAYMENT_METHOD') ?? 'ZALOPAY_SANDBOX'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Đọc đơn + món từ DB bằng service role — số tiền KHÔNG tin client gửi lên
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, store_id, total_amount, status, order_items(item_name, item_price, quantity)')
      .eq('id', orderId)
      .single()

    if (error || !order) return json({ error: 'Không tìm thấy đơn hàng' }, 404)
    if (order.status !== 'pending')
      return json({ error: 'Đơn không ở trạng thái chờ thanh toán' }, 409)

    // Secret ký MAC đọc theo QUÁN của đơn, không dùng biến môi trường toàn cục nữa
    const { data: config } = await supabase
      .from('store_checkout_configs')
      .select('zalo_checkout_secret_key, is_enabled')
      .eq('store_id', order.store_id)
      .single()

    if (!config || !config.is_enabled) {
      return json({ error: 'Quán chưa bật ZaloPay' }, 400)
    }
    const secret = config.zalo_checkout_secret_key as string

    const amount = order.total_amount as number
    const item = ((order.order_items ?? []) as Array<Record<string, unknown>>).map((it) => ({
      name: it.item_name,
      quantity: it.quantity,
      price: it.item_price,
    }))
    const desc = `MEVO - Don ${String(orderId).slice(-6).toUpperCase()}`
    const extradata = JSON.stringify({ orderId })
    const method = JSON.stringify({ id: methodId, isCustom: false })

    // MAC = HMAC-SHA256(secret, "key=value&..." với key sort a→z, object→JSON.stringify)
    const body: Record<string, unknown> = { amount, desc, extradata, item, method }
    const dataMac = Object.keys(body)
      .sort()
      .map((k) => `${k}=${typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]}`)
      .join('&')
    const mac = await hmacSHA256(secret, dataMac)

    // Trả đúng body để mini app truyền nguyên vào Payment.createOrder
    return json({ amount, desc, item, extradata, method, mac })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
```

- [ ] **Step 2: Deploy function**

Dùng tool `mcp__638e660e-3e7a-403a-a61e-834a80bf966b__deploy_edge_function` với
`project_id = dlkgdpexjtyynbotkwka`, `name = checkout-create-mac`, `verify_jwt = true`
(giữ nguyên, function hiện tại đã bật), `entrypoint_path = index.ts`, files = nội dung Step 1.

**CHỈ deploy Task 3 sau khi Task 2 (insert config Pubu) đã xong** — nếu deploy trước, mọi đơn
ZaloPay của Pubu sẽ lỗi "Quán chưa bật ZaloPay" vì chưa có config trong DB.

- [ ] **Step 3: Commit code**

```bash
git add supabase/functions/checkout-create-mac/index.ts
git commit -m "feat: checkout-create-mac đọc secret ZaloPay theo store_id"
```

---

### Task 4: Sửa `checkout-notify` map theo `appId` trước khi verify MAC

**Files:**
- Modify: `supabase/functions/checkout-notify/index.ts`

- [ ] **Step 1: Thay toàn bộ nội dung file**

```typescript
// Supabase Edge Function — Notify webhook của Zalo Checkout SDK
// Zalo gọi sau khi thanh toán xong (cả thành công lẫn thất bại).
// Secret ký/verify MAC đọc theo QUÁN (store_checkout_configs), map bằng data.appId TRƯỚC
// khi verify MAC — không tin bất kỳ field nào của callback trước khi xác định đúng quán.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// verify_jwt: FALSE (Zalo không gửi JWT — bảo mật bằng MAC)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function hmacSHA256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function resp(returnCode: number, returnMessage: string) {
  return new Response(JSON.stringify({ returnCode, returnMessage }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  try {
    const body = await req.json()
    const { data, mac } = body

    // 1. Chặn sớm nếu thiếu appId — không đi tiếp, không đụng DB
    const appId = data?.appId ? String(data.appId) : ''
    if (!appId) {
      console.error('[checkout-notify] thiếu appId trong callback')
      return resp(-1, 'unknown app')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2. Map appId → đúng quán TRƯỚC khi verify MAC
    const { data: config } = await supabase
      .from('store_checkout_configs')
      .select('store_id, zalo_checkout_secret_key, is_enabled')
      .eq('zalo_mini_app_id', appId)
      .single()

    if (!config || !config.is_enabled) {
      console.error('[checkout-notify] appId không khớp quán nào:', appId)
      return resp(-1, 'unknown app')
    }
    const secret = config.zalo_checkout_secret_key as string

    // 3. Verify MAC theo template CỐ ĐỊNH của Zalo (KHÔNG sort), bằng secret của ĐÚNG quán
    const macStr =
      `appId=${data.appId}&amount=${data.amount}&description=${data.description}` +
      `&orderId=${data.orderId}&message=${data.message}` +
      `&resultCode=${data.resultCode}&transId=${data.transId}`
    const expected = await hmacSHA256(secret, macStr)
    if (expected !== mac) {
      console.error('[checkout-notify] MAC không khớp')
      return resp(-1, 'invalid mac')
    }

    // 4. Chỉ sau khi MAC hợp lệ mới parse extradata
    let appOrderId: string | undefined
    try {
      const ed = JSON.parse(decodeURIComponent(data.extradata ?? '%7B%7D'))
      appOrderId = ed.orderId
    } catch (_) {
      /* ignore */
    }
    if (!appOrderId) return resp(-1, 'missing orderId in extradata')

    // 5. Check resultCode NGAY sau khi có appOrderId, TRƯỚC khi query order/store/amount —
    //    thanh toán thất bại thì ack luôn, không cần order còn tồn tại hay không, tránh
    //    biến failed callback thành retry loop nếu order đã bị xoá hoặc dữ liệu lệch.
    if (Number(data.resultCode) !== 1) {
      console.log(`[checkout-notify] payment failed, order=${appOrderId}, appId=${appId}`)
      return resp(1, 'payment failed acknowledged')
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, store_id, total_amount, status')
      .eq('id', appOrderId)
      .single()
    if (!order) return resp(-1, 'order not found')

    // 6. Đối chiếu quán suy ra từ appId khớp với quán thật của order
    if (order.store_id !== config.store_id) {
      console.error(
        `[checkout-notify] store mismatch: order.store_id=${order.store_id} config.store_id=${config.store_id}`,
      )
      return resp(-1, 'store mismatch')
    }

    // 7. Đối chiếu số tiền với DB — chống giả mạo amount
    if (Number(data.amount) !== Number(order.total_amount)) {
      console.error('[checkout-notify] amount không khớp', data.amount, order.total_amount)
      return resp(-1, 'amount mismatch')
    }

    // 8. Xác nhận đơn (idempotent: chỉ update nếu vẫn pending)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'confirmed', zalopay_trans_id: String(data.transId) })
      .eq('id', appOrderId)
      .eq('status', 'pending')
    if (error) {
      console.error('[checkout-notify] update lỗi:', error)
      return resp(-1, 'update failed')
    }

    console.log(`[checkout-notify] Đơn ${appOrderId} → confirmed, transId ${data.transId}`)
    return resp(1, 'success')
  } catch (e) {
    console.error('[checkout-notify] lỗi:', e)
    return resp(-1, String(e))
  }
})
```

- [ ] **Step 2: Deploy function**

Dùng tool `mcp__638e660e-3e7a-403a-a61e-834a80bf966b__deploy_edge_function` với
`project_id = dlkgdpexjtyynbotkwka`, `name = checkout-notify`, `verify_jwt = false` (giữ
nguyên, function hiện tại đã tắt vì Zalo không gửi JWT), `entrypoint_path = index.ts`.

- [ ] **Step 3: Commit code**

```bash
git add supabase/functions/checkout-notify/index.ts
git commit -m "feat: checkout-notify map appId → quán trước khi verify MAC"
```

---

### Task 5: Test thủ công (không có test framework Deno trong repo — theo đúng pattern hiện có)

**Files:**
- Modify: `TESTING.md` (thêm mục mới)

- [ ] **Step 1: Test đơn thật ở Pubu**

Đặt 1 đơn ZaloPay ở mini-app Pubu (sandbox hoặc thật tuỳ trạng thái hiện tại của quán) →
xác nhận thanh toán xong, đơn chuyển `confirmed`, giống hệt hành vi trước khi đổi code.

Query kiểm tra:
```sql
select id, status, zalopay_trans_id from orders order by created_at desc limit 1;
```
Expect: `status = 'confirmed'`, có `zalopay_trans_id`.

- [ ] **Step 2: Test "unknown app" bằng request giả lập — KHÔNG dùng đơn thật đang chờ xử lý**

```bash
curl -X POST https://dlkgdpexjtyynbotkwka.supabase.co/functions/v1/checkout-notify \
  -H "Content-Type: application/json" \
  -d '{"data":{"appId":"0000000000000000000","amount":1000,"description":"test","orderId":"x","message":"","resultCode":1,"transId":"t1"},"mac":"deadbeef"}'
```

Expect response: `{"returnCode":-1,"returnMessage":"unknown app"}`. Kiểm tra không có order
nào bị đổi trạng thái do request này (appId giả không khớp quán nào nên bị chặn trước khi
đụng tới order).

- [ ] **Step 3: Thêm mục test vào `TESTING.md`**

Thêm section mới sau mục "TÍNH NĂNG TOPPING" trong `TESTING.md`:

```markdown
## ZALOPAY — SECRET THEO TỪNG QUÁN (2026-07-01)

### Claude Code làm xong khi:
- Migration 017 áp dụng, bảng `store_checkout_configs` có đúng 1 dòng cho Pubu.
- 2 edge function `checkout-create-mac`/`checkout-notify` đọc secret từ DB, không còn biến
  môi trường `ZALO_CHECKOUT_SECRET_KEY`.

### ✅ Checklist test — Anh Tú tự làm:

**Test 1: Đặt đơn ZaloPay bình thường**
1. Mở mini-app Pubu → đặt món → thanh toán ZaloPay.
2. ✅ PASS nếu: thanh toán thành công, đơn chuyển sang bếp bình thường — y hệt trước khi đổi.

**Test 2: Không có gì đổi ở phía khách hàng**
1. Kiểm tra toàn bộ luồng đặt món/giỏ hàng/theo dõi đơn — không có màn hình nào thay đổi.
2. ✅ PASS nếu: không thấy khác biệt gì so với trước.

**→ Báo Claude Code:** "ZaloPay per-store PASS" hoặc mô tả lỗi (kèm Console F12 nếu có).
```

- [ ] **Step 4: Commit**

```bash
git add TESTING.md
git commit -m "docs: thêm checklist test ZaloPay secret theo từng quán"
```

---

### Task 6: Dọn biến môi trường cũ (không bắt buộc, làm sau khi Test 1 PASS)

**Không có file nào trong repo** — thao tác trên Supabase Dashboard.

- [ ] **Step 1: Sau khi anh Tú xác nhận "ZaloPay per-store PASS"**, xoá biến môi trường
`ZALO_CHECKOUT_SECRET_KEY` khỏi Edge Functions secrets (Dashboard → Project Settings → Edge
Functions → Secrets) — không còn function nào đọc biến này nữa sau Task 3+4.

- [ ] **Step 2: Verify** bằng cách đặt thêm 1 đơn ZaloPay test → vẫn `confirmed` bình thường
(chứng minh code không còn phụ thuộc biến đã xoá).
