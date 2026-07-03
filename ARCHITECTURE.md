# MEVO — Architecture & Setup Guide

**Dành cho Claude Code:** Đọc file này để hiểu cách setup và các patterns code trước khi viết bất kỳ dòng nào.

---

## 1. Thứ tự build (Sprint-by-Sprint)

```
Sprint 0 — Setup (1 ngày)
  □ Tạo monorepo mevo/ với 3 thư mục
  □ Chạy SQL migration trên Supabase
  □ Scaffold mini-app từ zaui-bistro template
  □ Scaffold admin-web từ Next.js
  □ Test kết nối Supabase từ cả 2 app

Sprint 1 — Menu khách hàng (3-4 ngày)
  □ Load menu từ Supabase vào Mini App
  □ UI menu + categories (ZaUI components)
  □ Giỏ hàng (Recoil state)
  □ Tạo đơn hàng vào Supabase

Sprint 2 — Thanh toán ZaloPay (2-3 ngày)
  □ Tích hợp ZaloPay API vào backend (Supabase Edge Function)
  □ Gọi ZaloPay SDK từ Mini App
  □ Xử lý callback, cập nhật order status
  □ Trang trạng thái đơn realtime

Sprint 3 — Kitchen Display (1-2 ngày)
  □ Next.js page /kitchen/[slug]
  □ Subscribe Supabase Realtime
  □ UI 3 cột, nút cập nhật trạng thái
  □ ZNS gửi thông báo khi đơn ready

Sprint 4 — Admin Web (3-4 ngày)
  □ Auth (Supabase Auth SSR)
  □ Dashboard, quản lý menu (CRUD)
  □ Quản lý bàn + generate QR
  □ Danh sách đơn hàng

Sprint 5 — Deploy & Test thực tế
  □ Deploy Mini App lên Zalo
  □ Deploy admin-web lên Vercel
  □ Test tại Phở Gà Pubu
  □ Fix bugs từ feedback thực tế
```

---

## 2. Setup Sprint 0 — Làm từng bước

### Bước 1: Tạo Supabase project
1. Vào https://supabase.com → New project
2. Tên: `mevo-prod`, region: **Southeast Asia (Singapore)**
3. Lưu lại: `Project URL`, `anon key`, `service_role key`

### Bước 2: Chạy SQL migration

Vào Supabase Dashboard → SQL Editor → New query → paste và chạy:

```sql
-- Enable UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- STORES
CREATE TABLE stores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  zalopay_app_id TEXT,
  zalopay_key1 TEXT,
  zalopay_key2 TEXT,
  zalo_oa_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLES (bàn ăn)
CREATE TABLE tables (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- MENU CATEGORIES
CREATE TABLE menu_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

-- MENU ITEMS
CREATE TABLE menu_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id UUID REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL,
  image_url TEXT,
  is_available BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS
CREATE TABLE orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  table_id UUID NOT NULL REFERENCES tables(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cooking','ready','paid','cancelled')),
  total_amount INT NOT NULL DEFAULT 0,
  zalopay_trans_id TEXT,
  zalo_user_id TEXT,
  note TEXT,
  payment_method TEXT DEFAULT 'zalopay'
    CHECK (payment_method IN ('zalopay','cash')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  item_price INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  note TEXT
);

-- RLS Policies
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Khách đọc public data
CREATE POLICY "public_read_stores" ON stores FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_tables" ON tables FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_categories" ON menu_categories FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_items" ON menu_items FOR SELECT USING (true);

-- Khách tạo đơn
CREATE POLICY "public_create_orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "public_create_items" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_orders" ON orders FOR SELECT USING (true);
CREATE POLICY "public_read_order_items" ON order_items FOR SELECT USING (true);

-- Realtime cho orders
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Auto update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed data: Phở Gà Pubu
DO $$
DECLARE s_id UUID; cat1_id UUID; cat2_id UUID;
BEGIN
  INSERT INTO stores (name, slug, phone, address)
  VALUES ('Phở Gà Pubu', 'pho-ga-pubu', '0900000000', 'Lào Cai')
  RETURNING id INTO s_id;

  FOR i IN 1..10 LOOP
    INSERT INTO tables (store_id, table_number) VALUES (s_id, 'Bàn ' || i);
  END LOOP;

  INSERT INTO menu_categories (store_id, name, sort_order) VALUES (s_id, 'Món chính', 1) RETURNING id INTO cat1_id;
  INSERT INTO menu_items (store_id, category_id, name, price) VALUES
    (s_id, cat1_id, 'Phở gà', 65000),
    (s_id, cat1_id, 'Phở gà đặc biệt', 80000),
    (s_id, cat1_id, 'Phở gà tái lăn', 75000);

  INSERT INTO menu_categories (store_id, name, sort_order) VALUES (s_id, 'Đồ uống', 2) RETURNING id INTO cat2_id;
  INSERT INTO menu_items (store_id, category_id, name, price) VALUES
    (s_id, cat2_id, 'Nước lọc', 10000),
    (s_id, cat2_id, 'Nước cam tươi', 25000),
    (s_id, cat2_id, 'Trà đá', 5000);
END $$;
```

### Bước 3: Scaffold Zalo Mini App

```bash
# Cài Zalo Mini App CLI
npm install -g zmp-cli

# Tạo project từ template bistro (F&B)
zmp create mevo-mini-app --template zaui-bistro
cd mevo-mini-app

# Cài dependencies
npm install @supabase/supabase-js

# Cấu hình App ID vào app-config.json
# (Lấy App ID từ Zalo Developer Portal)
```

### Bước 4: Scaffold Admin Web

```bash
npx create-next-app@latest admin-web --typescript --tailwind --app --src-dir=false
cd admin-web
npm install @supabase/supabase-js @supabase/ssr
npm install lucide-react clsx tailwind-merge
```

### Bước 5: Biến môi trường

**mini-app/.env:**
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
VITE_APP_ENV=development
```

**admin-web/.env.local:**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 3. Code Patterns quan trọng

### Supabase client (Mini App — Vite)
```typescript
// mini-app/src/services/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
```

### Load menu theo store slug
```typescript
// mini-app/src/services/menu.service.ts
export async function getStoreMenu(storeSlug: string) {
  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('slug', storeSlug)
    .single()

  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*)')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .order('sort_order')

  return { store, categories }
}
```

### Lấy thông tin từ QR URL (Zalo Mini App)
```typescript
// Zalo truyền params qua URL khi mở Mini App
// URL dạng: zalo.me/s/APP_ID/?store=pho-ga-pubu&table=uuid-xxx
import { getSystemInfo } from 'zmp-sdk'

export function getQRParams() {
  // Trong Zalo Mini App, dùng useParams của ZMP Router
  // hoặc đọc từ query string khi khởi động
  const params = new URLSearchParams(window.location.search)
  return {
    storeSlug: params.get('store') || '',
    tableId: params.get('table') || '',
  }
}
```

### Tạo đơn hàng + gọi ZaloPay
```typescript
// mini-app/src/services/order.service.ts
export async function createOrder(params: {
  storeId: string
  tableId: string
  items: CartItem[]
  zaloUserId: string
  note?: string
}) {
  const totalAmount = params.items.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  )

  // 1. Tạo đơn trong Supabase
  const { data: order } = await supabase
    .from('orders')
    .insert({
      store_id: params.storeId,
      table_id: params.tableId,
      total_amount: totalAmount,
      zalo_user_id: params.zaloUserId,
      note: params.note,
    })
    .select()
    .single()

  // 2. Tạo order items (snapshot tên + giá)
  await supabase.from('order_items').insert(
    params.items.map(item => ({
      order_id: order.id,
      menu_item_id: item.id,
      item_name: item.name,    // snapshot
      item_price: item.price,  // snapshot
      quantity: item.quantity,
      note: item.note,
    }))
  )

  // 3. Gọi ZaloPay API qua backend
  const { data: paymentData } = await fetch('/api/zalopay/create-order', {
    method: 'POST',
    body: JSON.stringify({ orderId: order.id, amount: totalAmount }),
  }).then(r => r.json())

  return { order, zpTransToken: paymentData.zp_trans_token }
}
```

### ZaloPay payment trong Mini App
```typescript
// mini-app/src/pages/payment.tsx
import { openPayment } from 'zmp-sdk' // ZaloPay SDK tích hợp trong ZMP

export async function payWithZaloPay(zpTransToken: string) {
  try {
    await openPayment({ zpTransToken })
    // Thanh toán thành công → ZaloPay callback sẽ update backend
    // Mini App listen realtime để biết kết quả
  } catch (error) {
    // Người dùng huỷ hoặc lỗi
    console.error('Thanh toán thất bại:', error)
  }
}
```

### Realtime subscribe đơn hàng (Kitchen Display)
```typescript
// admin-web/app/kitchen/[storeSlug]/page.tsx (Client Component)
useEffect(() => {
  const channel = supabase
    .channel(`kitchen-${storeId}`)
    .on('postgres_changes', {
      event: '*',  // INSERT và UPDATE
      schema: 'public',
      table: 'orders',
      filter: `store_id=eq.${storeId}`,
    }, (payload) => {
      if (payload.eventType === 'INSERT') {
        playNotificationSound()
        setOrders(prev => [payload.new, ...prev])
      } else if (payload.eventType === 'UPDATE') {
        setOrders(prev => prev.map(o =>
          o.id === payload.new.id ? payload.new : o
        ))
      }
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [storeId])
```

### Generate QR URL cho bàn
```typescript
// admin-web/lib/qr.ts
import QRCode from 'qrcode'

export async function generateTableQR(
  zaloAppId: string,
  storeSlug: string,
  tableId: string
): Promise<string> {
  // URL mà Zalo Mini App nhận khi quét QR
  const url = `https://zalo.me/s/${zaloAppId}/?store=${storeSlug}&table=${tableId}`

  return QRCode.toDataURL(url, {
    width: 500,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  })
}
```

### ZaloPay backend (Supabase Edge Function)
```typescript
// supabase/functions/zalopay-create-order/index.ts
import { serve } from 'https://deno.land/std/http/server.ts'
import * as HmacSHA256 from 'https://deno.land/x/hmac/mod.ts'

serve(async (req) => {
  const { orderId, amount } = await req.json()

  const appId = Deno.env.get('ZALOPAY_APP_ID')
  const key1 = Deno.env.get('ZALOPAY_KEY1')
  const appTransId = `${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${orderId}`

  const orderData = {
    app_id: appId,
    app_trans_id: appTransId,
    app_user: 'mevo_customer',
    app_time: Date.now(),
    amount: amount,
    description: `MEVO - Thanh toán đơn hàng`,
    embed_data: JSON.stringify({ orderId }),
    item: '[]',
    callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/zalopay-callback`,
  }

  // Tạo MAC signature
  const data = `${appId}|${appTransId}|${orderData.app_user}|${amount}|${orderData.app_time}||`
  orderData.mac = HmacSHA256.hmac('sha256', key1, data, 'hex')

  const response = await fetch('https://sb-openapi.zalopay.vn/v2/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData),
  })

  return new Response(await response.text(), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## 4. Deploy

### Zalo Mini App

> ⚠️ **Cập nhật 2026-07-03:** không còn deploy trực tiếp từ thư mục `mini-app/` gốc nữa — mỗi
> quán có 1 worktree riêng ở `mini-app-instances/<slug>/`. Chi tiết đầy đủ + lý do:
> `CLAUDE.md` mục "Sửa mini-app đúng chỗ" và `.claude/skills/replicate-mini-app/SKILL.md`.
> Quán đầu tiên (Phở Gà Pubu) đã có sẵn tại `mini-app-instances/pho-ga-pubu/`.

```bash
# Lần đầu cho 1 quán mới: tạo worktree riêng
scripts/create-mini-app-instance.sh <slug> "<Tên hiển thị>"

# Từ đó về sau, luôn làm việc trong thư mục riêng của quán đó:
cd mini-app-instances/<slug>/mini-app

zmp login      # đăng nhập tài khoản Zalo sở hữu app CỦA QUÁN NÀY
zmp deploy     # deploy lên đúng app Zalo của quán này

# Sau khi deploy → Zalo tạo QR để test
# Scan QR bằng Zalo để preview trên điện thoại thật
```

### Admin Web (Vercel)
```bash
# Push lên GitHub → Vercel tự deploy
git add . && git commit -m "feat: initial setup" && git push

# Hoặc deploy thủ công
cd admin-web && npx vercel
```

### Supabase Edge Functions
```bash
# Cài Supabase CLI
npm install -g supabase

# Deploy functions
supabase functions deploy zalopay-create-order
supabase functions deploy zalopay-callback

# Set secrets
supabase secrets set ZALOPAY_APP_ID=xxx ZALOPAY_KEY1=xxx ZALOPAY_KEY2=xxx
```

---

## 5. Lệnh thường dùng

```bash
# Zalo Mini App — luôn từ thư mục riêng của quán, KHÔNG phải mini-app/ gốc
cd mini-app-instances/<slug>/mini-app
npm run dev          # Dev mode (browser, mock Zalo APIs)
zmp preview          # Preview trên điện thoại qua Zalo
zmp deploy           # Deploy lên Zalo platform (đúng app của quán này)

# Admin Web
cd admin-web
npm run dev          # localhost:3000

# Generate Supabase TypeScript types
npx supabase gen types typescript \
  --project-id [your-project-id] \
  > types/database.ts

# Database migration
supabase db push
```

---

## 6. Link tài liệu quan trọng

| Tài liệu | URL |
|---|---|
| Zalo Mini App docs | https://mini.zalo.me/docs |
| ZaUI components | https://mini.zalo.me/docs/zaui |
| zaui-bistro template | https://github.com/Zalo-MiniApp/zaui-bistro |
| zaui-menu template | https://github.com/Zalo-MiniApp/zaui-menu |
| ZaloPay API | https://docs.zalopay.vn |
| ZaloPay MiniApp SDK | https://docs.zalopay.vn/docs/miniapp/intro |
| Supabase docs | https://supabase.com/docs |
| Zalo OA / ZNS | https://developers.zalo.me/docs |
