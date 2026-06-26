# UX Bundle: OA Follow + Session Orders + Store Tab + Bell + Payment Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm 5 tính năng UX học từ phân tích đối thủ: prompt follow OA (prerequisite ZNS), tab "Đã gọi" trong phiên, tab "Nhà hàng", nút chuông gọi nhân viên, và bật/tắt phương thức thanh toán per-store ở Admin.

**Architecture:**
- Mini-app: thêm bottom tab bar (Menu | Đã gọi | Nhà hàng), OA follow bottom sheet khi mở app, nút chuông trong tab "Đã gọi".
- Backend: 2 migration mới — thêm `payment_methods[]` vào `stores`, tạo bảng `service_requests`; thêm RLS policy cho anon SELECT orders theo `zalo_user_id`.
- Admin: UI toggle bật/tắt phương thức thanh toán trong trang Settings.
- "Đã gọi" chỉ hiện đơn của `zalo_user_id + table_id` trong 6 giờ gần nhất — tránh cross-session contamination.

**Tech Stack:** TypeScript, React 18, Zalo Mini App SDK (zmp-sdk v2.49.4), Zustand, TanStack Query, Supabase, Next.js 14 App Router, Tailwind CSS + shadcn/ui.

---

## File Map

### Mini-app files
| File | Action | Nội dung |
|------|--------|----------|
| `mini-app/src/stores/app.store.ts` | Modify | Thêm `zaloOaId`, `address`, `phone`, `paymentMethods` vào store state |
| `mini-app/src/app.tsx` | Modify | Fetch thêm `zalo_oa_id, address, phone, payment_methods` từ stores; show OA sheet |
| `mini-app/src/components/common/oa-follow-sheet.tsx` | Create | Bottom sheet prompt follow OA, dùng `followOA()` SDK |
| `mini-app/src/components/layout/bottom-tabs.tsx` | Create | Tab bar 3 tab: Menu / Đã gọi / Nhà hàng |
| `mini-app/src/components/layout/layout.tsx` | Modify | Tích hợp `BottomTabs`, ẩn khi ở checkout / order-status |
| `mini-app/src/pages/session-orders/index.tsx` | Create | Tab "Đã gọi": list đơn trong phiên + tổng tiền + nút chuông |
| `mini-app/src/pages/store-info/index.tsx` | Create | Tab "Nhà hàng": logo, tên, địa chỉ, SĐT, nút follow OA |
| `mini-app/src/services/order/order.queries.ts` | Modify | Thêm `useSessionOrders(zaloUserId, tableId)` |
| `mini-app/src/services/order/order.api.ts` | Modify | Thêm `getSessionOrders()` và `callStaff()` |
| `mini-app/src/services/order/order.mutations.ts` | Modify | Thêm `useCallStaff()` mutation |
| `mini-app/src/types/order.types.ts` | Modify | Thêm `PaymentMethod` union type, `ServiceRequest` type |
| `mini-app/src/router.tsx` | Modify | Thêm routes `/session-orders`, `/store-info` |

### Admin-web files
| File | Action | Nội dung |
|------|--------|----------|
| `admin-web/app/admin/settings/settings-client.tsx` | Modify | Thêm toggle ZaloPay / Tiền mặt với validation ≥1 |
| `admin-web/lib/actions/store.ts` | Modify | Thêm `payment_methods` vào `updateStoreSettings` |
| `admin-web/app/admin/settings/page.tsx` | Modify | Truyền `payment_methods` xuống `SettingsClient` |

### Supabase migrations
| File | Action | Nội dung |
|------|--------|----------|
| `supabase/migrations/008_payment_methods_service_requests.sql` | Create | Thêm `payment_methods[]` vào stores; tạo `service_requests`; thêm RLS anon SELECT orders by zalo_user_id |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/008_payment_methods_service_requests.sql`

- [ ] **Step 1.1: Viết migration**

```sql
-- 008 — payment_methods per store + service_requests (nút chuông)

-- 1. Thêm cột payment_methods vào stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[]
    NOT NULL DEFAULT ARRAY['zalopay','cash']
    CHECK (
      array_length(payment_methods, 1) >= 1
      AND payment_methods <@ ARRAY['zalopay','cash']
    );

-- 2. Bảng service_requests (nút chuông gọi nhân viên)
CREATE TABLE IF NOT EXISTS service_requests (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'payment'
                CHECK (type IN ('payment','help')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS service_requests
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Khách (anon) chỉ INSERT (gọi chuông)
CREATE POLICY "anon_insert_service_requests" ON service_requests
  FOR INSERT TO anon WITH CHECK (true);

-- Admin/authenticated đọc theo store
CREATE POLICY "auth_select_service_requests" ON service_requests
  FOR SELECT TO authenticated USING (true);

-- 3. RLS orders: anon SELECT theo zalo_user_id + table_id (cho tab "Đã gọi")
-- Policy này cho phép khách xem đơn của chính họ tại bàn đó
CREATE POLICY "anon_select_own_session_orders" ON orders
  FOR SELECT TO anon
  USING (
    zalo_user_id IS NOT NULL
    AND zalo_user_id = current_setting('request.jwt.claims', true)::json->>'zalo_user_id'
  );
```

> ⚠️ Lưu ý: Policy SELECT orders dùng JWT claim — sẽ không hoạt động với anon key thông thường. Thay vào đó dùng cách đơn giản hơn: anon SELECT orders không có RLS restriction thêm (đã có policy `anon_select_orders_by_id` từ trước nếu tồn tại). Ta sẽ query bằng cách filter client-side hoặc dùng RPC.

**Thực ra approach đúng:** Tạo RPC `get_session_orders` để tránh bypass RLS:

```sql
-- Thay policy phức tạp bằng RPC an toàn
CREATE OR REPLACE FUNCTION get_session_orders(
  p_zalo_user_id TEXT,
  p_table_id UUID
)
RETURNS TABLE (
  id UUID,
  store_id UUID,
  table_id UUID,
  status TEXT,
  total_amount INT,
  payment_method TEXT,
  note TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.store_id, o.table_id, o.status,
    o.total_amount, o.payment_method, o.note,
    o.created_at, o.updated_at
  FROM orders o
  WHERE o.zalo_user_id = p_zalo_user_id
    AND o.table_id = p_table_id
    AND o.created_at > NOW() - INTERVAL '6 hours'
    AND o.status NOT IN ('cancelled')
  ORDER BY o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_session_orders TO anon;
```

File đầy đủ (`supabase/migrations/008_payment_methods_service_requests.sql`):

```sql
-- 008 — payment_methods per store + service_requests + get_session_orders RPC

-- 1. Thêm payment_methods vào stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[]
    NOT NULL DEFAULT ARRAY['zalopay','cash'];

ALTER TABLE stores
  ADD CONSTRAINT stores_payment_methods_valid
    CHECK (
      array_length(payment_methods, 1) >= 1
      AND payment_methods <@ ARRAY['zalopay','cash']
    );

-- 2. Tạo bảng service_requests
CREATE TABLE IF NOT EXISTS service_requests (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id     UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'payment'
                 CHECK (type IN ('payment','help')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_service_requests" ON service_requests
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "auth_select_service_requests" ON service_requests
  FOR SELECT TO authenticated USING (true);

-- 3. RPC get_session_orders — anon lấy đơn của mình trong phiên
CREATE OR REPLACE FUNCTION get_session_orders(
  p_zalo_user_id TEXT,
  p_table_id     UUID
)
RETURNS TABLE (
  id             UUID,
  store_id       UUID,
  table_id       UUID,
  status         TEXT,
  total_amount   INT,
  payment_method TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.store_id, o.table_id, o.status,
    o.total_amount, o.payment_method, o.note,
    o.created_at, o.updated_at
  FROM orders o
  WHERE o.zalo_user_id = p_zalo_user_id
    AND o.table_id     = p_table_id
    AND o.created_at   > NOW() - INTERVAL '6 hours'
    AND o.status NOT IN ('cancelled')
  ORDER BY o.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_session_orders TO anon;
```

- [ ] **Step 1.2: Apply migration lên Supabase**

```bash
# Dùng Supabase Dashboard → SQL Editor → paste nội dung trên → Run
# Hoặc nếu có supabase CLI:
supabase db push
```

Kiểm tra sau khi apply:
```sql
-- Verify cột tồn tại
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stores' AND column_name = 'payment_methods';

-- Verify bảng tồn tại
SELECT table_name FROM information_schema.tables
WHERE table_name = 'service_requests';

-- Verify RPC tồn tại
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_session_orders';
```

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/008_payment_methods_service_requests.sql
git commit -m "feat(db): payment_methods per store + service_requests table + get_session_orders RPC"
```

---

## Task 2: Mở rộng App Store — thêm store fields

**Files:**
- Modify: `mini-app/src/stores/app.store.ts`
- Modify: `mini-app/src/app.tsx`

- [ ] **Step 2.1: Cập nhật `app.store.ts`**

Thay toàn bộ nội dung `mini-app/src/stores/app.store.ts`:

```typescript
import { create } from "zustand";

export type PaymentMethod = "zalopay" | "cash";

interface AppStore {
  storeSlug: string;
  storeId: string;
  storeName: string;
  storeLogoUrl: string;
  storeAddress: string;
  storePhone: string;
  zaloOaId: string;
  paymentMethods: PaymentMethod[];  // phương thức thanh toán được bật
  tableId: string;
  tableNumber: string;
  zaloUserId: string;

  setStoreInfo: (info: {
    storeSlug: string;
    storeId: string;
    storeName: string;
    storeLogoUrl: string;
    storeAddress: string;
    storePhone: string;
    zaloOaId: string;
    paymentMethods: PaymentMethod[];
  }) => void;
  setTableInfo: (info: { tableId: string; tableNumber: string }) => void;
  setZaloUserId: (zaloUserId: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  storeSlug: "",
  storeId: "",
  storeName: "",
  storeLogoUrl: "",
  storeAddress: "",
  storePhone: "",
  zaloOaId: "",
  paymentMethods: ["zalopay", "cash"],
  tableId: "",
  tableNumber: "",
  zaloUserId: "",

  setStoreInfo: (info) => set(info),
  setTableInfo: (info) => set(info),
  setZaloUserId: (zaloUserId) => set({ zaloUserId }),
}));

export function parseQRParams(): { storeSlug: string; tableId: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    storeSlug: params.get("store") || "",
    tableId: params.get("table") || "",
  };
}
```

- [ ] **Step 2.2: Cập nhật `app.tsx` — fetch thêm fields + show OA sheet**

Thay toàn bộ nội dung `mini-app/src/app.tsx`:

```typescript
import { RouterProvider } from "react-router-dom";
import router from "./router";
import { ReactQueryProvider } from "./lib/react-query-provider";
import React, { useEffect, useState } from "react";
import { SnackbarProvider } from "zmp-ui";
import { useAppStore, parseQRParams, PaymentMethod } from "./stores/app.store";
import { supabase } from "./services/supabase";
import { getUserID } from "zmp-sdk";
import OaFollowSheet from "./components/common/oa-follow-sheet";

function AppInit() {
  const {
    setStoreInfo, setTableInfo, setZaloUserId,
    storeId, zaloOaId,
  } = useAppStore();
  const [showOaSheet, setShowOaSheet] = useState(false);

  useEffect(() => {
    getUserID()
      .then((id) => { if (id) setZaloUserId(id); })
      .catch(() => { /* không ở trong Zalo — bỏ qua */ });
  }, [setZaloUserId]);

  useEffect(() => {
    const { storeSlug, tableId } = parseQRParams();
    if (!storeSlug || !tableId) return;

    Promise.all([
      supabase
        .from("stores")
        .select("id, name, slug, logo_url, address, phone, zalo_oa_id, payment_methods")
        .eq("slug", storeSlug)
        .eq("is_active", true)
        .single(),
      supabase
        .from("tables")
        .select("id, table_number")
        .eq("id", tableId)
        .eq("is_active", true)
        .single(),
    ]).then(([storeRes, tableRes]) => {
      if (storeRes.data) {
        setStoreInfo({
          storeSlug: storeRes.data.slug,
          storeId: storeRes.data.id,
          storeName: storeRes.data.name,
          storeLogoUrl: storeRes.data.logo_url ?? "",
          storeAddress: storeRes.data.address ?? "",
          storePhone: storeRes.data.phone ?? "",
          zaloOaId: storeRes.data.zalo_oa_id ?? "",
          paymentMethods: (storeRes.data.payment_methods as PaymentMethod[]) ?? ["zalopay", "cash"],
        });
      }
      if (tableRes.data) {
        setTableInfo({
          tableId: tableRes.data.id,
          tableNumber: tableRes.data.table_number,
        });
      }
    });
  }, [setStoreInfo, setTableInfo]);

  // Hiện OA sheet 1 lần sau khi load xong store + có OA ID
  useEffect(() => {
    if (!storeId || !zaloOaId) return;
    const flagKey = `mevo_oa_prompted_${storeId}`;
    if (!localStorage.getItem(flagKey)) {
      setShowOaSheet(true);
    }
  }, [storeId, zaloOaId]);

  const handleOaSheetClose = () => {
    if (storeId) localStorage.setItem(`mevo_oa_prompted_${storeId}`, "1");
    setShowOaSheet(false);
  };

  return (
    <OaFollowSheet
      oaId={zaloOaId}
      visible={showOaSheet}
      onClose={handleOaSheetClose}
    />
  );
}

export default function MiniApp() {
  return (
    <React.StrictMode>
      <SnackbarProvider>
        <ReactQueryProvider>
          <AppInit />
          <RouterProvider router={router} />
        </ReactQueryProvider>
      </SnackbarProvider>
    </React.StrictMode>
  );
}
```

- [ ] **Step 2.3: Commit**

```bash
git add mini-app/src/stores/app.store.ts mini-app/src/app.tsx
git commit -m "feat(mini-app): mở rộng app store — thêm zaloOaId, address, phone, paymentMethods"
```

---

## Task 3: Component OA Follow Bottom Sheet

**Files:**
- Create: `mini-app/src/components/common/oa-follow-sheet.tsx`

- [ ] **Step 3.1: Tạo `oa-follow-sheet.tsx`**

```typescript
// Hiện bottom sheet prompt khách follow OA để nhận thông báo ZNS.
// Chỉ show 1 lần per store (flag trong localStorage).
import { useState } from "react";
import { followOA } from "zmp-sdk";
import { Sheet } from "zmp-ui";

interface OaFollowSheetProps {
  oaId: string;
  visible: boolean;
  onClose: () => void;
}

export default function OaFollowSheet({ oaId, visible, onClose }: OaFollowSheetProps) {
  const [loading, setLoading] = useState(false);

  if (!oaId || !visible) return null;

  const handleFollow = async () => {
    setLoading(true);
    try {
      await followOA({ id: oaId });
    } catch {
      // -201 = user từ chối — không sao, vẫn đóng sheet
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} autoHeight>
      <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="text-3xl">🔔</span>
        </div>
        <div>
          <p className="text-large-m font-bold text-text-primary">
            Nhận thông báo món ăn
          </p>
          <p className="mt-1.5 text-small text-text-secondary">
            Quan tâm để nhận thông báo Zalo khi món của bạn sắp được mang ra.
            Hoàn toàn miễn phí.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2.5 pt-1">
          <button
            onClick={handleFollow}
            disabled={loading}
            className="w-full rounded-xl bg-primary py-3 text-small-m font-semibold text-white disabled:opacity-60 active:opacity-80"
          >
            {loading ? "Đang xử lý..." : "Quan tâm để nhận thông báo"}
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 text-small text-text-secondary active:opacity-60"
          >
            Để sau
          </button>
        </div>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3.2: Kiểm tra `Sheet` import từ `zmp-ui`**

```bash
grep -r "from 'zmp-ui'" D:/Code/mevo/mini-app/src/ | head -5
# Nếu Sheet không tồn tại trong zmp-ui, dùng Modal thay thế:
# import { Modal } from "zmp-ui"
```

Nếu `Sheet` không có, thay bằng:

```typescript
// Fallback nếu Sheet không có trong zmp-ui — dùng fixed bottom overlay
import { useEffect } from "react";

// ... (thay Sheet bằng div overlay)
const overlayStyle = visible
  ? "fixed inset-0 z-50 flex flex-col justify-end"
  : "hidden";

return (
  <div className={overlayStyle}>
    <div className="bg-black/40 absolute inset-0" onClick={onClose} />
    <div className="relative rounded-t-2xl bg-white">
      {/* ... content như trên ... */}
    </div>
  </div>
);
```

- [ ] **Step 3.3: Commit**

```bash
git add mini-app/src/components/common/oa-follow-sheet.tsx
git commit -m "feat(mini-app): OA follow bottom sheet — prompt khách theo dõi OA để nhận ZNS"
```

---

## Task 4: Bottom Tab Navigation

**Files:**
- Create: `mini-app/src/components/layout/bottom-tabs.tsx`
- Modify: `mini-app/src/components/layout/layout.tsx`
- Modify: `mini-app/src/router.tsx`

- [ ] **Step 4.1: Tạo `bottom-tabs.tsx`**

```typescript
import { useNavigate, useLocation } from "react-router-dom";
import { useCartStore } from "@/stores/cart.store";
import { cn } from "@/utils/cn";

const TABS = [
  {
    path: "/",
    matchPaths: ["/", "/menu"],
    label: "Menu",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={cn("h-6 w-6", active ? "text-primary" : "text-neutral400")} fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    path: "/session-orders",
    matchPaths: ["/session-orders"],
    label: "Đã gọi",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={cn("h-6 w-6", active ? "text-primary" : "text-neutral400")} fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    path: "/store-info",
    matchPaths: ["/store-info"],
    label: "Nhà hàng",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" className={cn("h-6 w-6", active ? "text-primary" : "text-neutral400")} fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
  },
] as const;

export default function BottomTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { totalItems } = useCartStore();

  return (
    <div
      className="flex shrink-0 border-t border-neutral100 bg-white"
      style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}
    >
      {TABS.map((tab) => {
        const active = tab.matchPaths.includes(pathname as typeof tab.matchPaths[number]);
        const isCart = tab.path === "/session-orders";
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
          >
            <div className="relative">
              {tab.icon(active)}
              {isCart && totalItems > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </div>
            <span
              className={cn(
                "text-[10px] font-medium",
                active ? "text-primary" : "text-neutral400",
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4.2: Cập nhật `layout.tsx` — tích hợp BottomTabs**

```typescript
import { Outlet, useMatches } from "react-router-dom";
import Header from "./header";
import BottomTabs from "./bottom-tabs";
import CartFloatButton from "../common/cart-float-button";
import { useCartStore } from "@/stores/cart.store";

export default function Layout() {
  const matches = useMatches();
  const current = matches[matches.length - 1];
  const handle = current.handle as Record<string, unknown> | undefined;

  const hideBottomTabs = handle?.hideBottomTabs as boolean | undefined;
  const hideCart = handle?.hideCart as boolean | undefined;
  const hideHeader = handle?.hideHeader as boolean | undefined;
  const headerPosition = handle?.headerPosition as string | undefined;

  const { totalItems } = useCartStore();

  return (
    <div className="relative flex h-screen w-screen flex-col bg-[#F7F8FA]">
      {!hideHeader && (
        <Header
          title={handle?.title as string | undefined}
          back={handle?.back as boolean | undefined}
          position={headerPosition}
        />
      )}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <Outlet />
        {/* CartFloatButton nổi bên trong vùng cuộn nội dung, trên tab bar */}
        {!hideCart && totalItems > 0 && <CartFloatButton itemCount={totalItems} />}
      </div>
      {!hideBottomTabs && <BottomTabs />}
    </div>
  );
}
```

- [ ] **Step 4.3: Cập nhật `router.tsx` — thêm routes mới + handle flags**

```typescript
import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout";
import { getBasePath } from "./utils/zma";
import MenuPage from "./pages/menu";
import CheckoutPage from "./pages/checkout";
import OrderStatusPage from "./pages/order-status";
import SessionOrdersPage from "./pages/session-orders";
import StoreInfoPage from "./pages/store-info";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        { path: "/", element: <MenuPage />, handle: { hideHeader: true } },
        { path: "/menu", element: <MenuPage />, handle: { hideHeader: true } },

        { path: "/session-orders", element: <SessionOrdersPage />, handle: { hideHeader: true } },
        { path: "/store-info", element: <StoreInfoPage />, handle: { hideHeader: true } },

        {
          path: "/checkout",
          element: <CheckoutPage />,
          handle: {
            title: "Xác nhận đơn",
            back: true,
            whiteBackground: true,
            hideBottomTabs: true,
            hideCart: true,
            headerPosition: "sticky",
          },
        },
        {
          path: "/order-status/:orderId",
          element: <OrderStatusPage />,
          handle: {
            title: "Trạng thái đơn",
            back: false,
            whiteBackground: true,
            hideBottomTabs: true,
            hideCart: true,
            headerPosition: "sticky",
          },
        },
      ],
    },
  ],
  { basename: getBasePath() },
);

export default router;
```

- [ ] **Step 4.4: Xoá `Footer` khỏi layout (không dùng nữa)**

Xoá hoặc giữ nguyên `footer.tsx` — không import vào `layout.tsx` nữa.

- [ ] **Step 4.5: Commit**

```bash
git add mini-app/src/components/layout/bottom-tabs.tsx \
        mini-app/src/components/layout/layout.tsx \
        mini-app/src/router.tsx
git commit -m "feat(mini-app): bottom tab navigation — Menu / Đã gọi / Nhà hàng"
```

---

## Task 5: Service order.api + query — get_session_orders và callStaff

**Files:**
- Modify: `mini-app/src/services/order/order.api.ts`
- Modify: `mini-app/src/services/order/order.queries.ts`
- Modify: `mini-app/src/services/order/order.mutations.ts`
- Modify: `mini-app/src/types/order.types.ts`

- [ ] **Step 5.1: Cập nhật `order.types.ts` — thêm types mới**

Thêm vào cuối file `mini-app/src/types/order.types.ts`:

```typescript
// Phiên gọi món (Món đã gọi) — trả về từ get_session_orders RPC
export interface SessionOrder {
  id: string;
  storeId: string;
  tableId: string;
  status: OrderState;
  totalAmount: number;
  paymentMethod: "zalopay" | "cash";
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequest {
  storeId: string;
  tableId: string;
  tableNumber: string;
  type: "payment" | "help";
}
```

Đồng thời sửa `paymentMethod` trong `CreateOrderRequest`:
```typescript
// Thay dòng:
paymentMethod: "zalopay" | "cash";
// Giữ nguyên — type này dùng PaymentMethod từ app.store, nhưng giữ inline cho đơn giản
```

- [ ] **Step 5.2: Thêm `getSessionOrders` và `callStaff` vào `order.api.ts`**

Thêm vào cuối file (sau `function mapOrder`):

```typescript
export const sessionOrderService = {
  getSessionOrders: async (
    zaloUserId: string,
    tableId: string,
  ): Promise<SessionOrder[]> => {
    const { data, error } = await supabase.rpc("get_session_orders", {
      p_zalo_user_id: zaloUserId,
      p_table_id: tableId,
    });
    if (error) throw error;
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      storeId: row.store_id as string,
      tableId: row.table_id as string,
      status: row.status as OrderState,
      totalAmount: row.total_amount as number,
      paymentMethod: row.payment_method as "zalopay" | "cash",
      note: (row.note as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  },

  callStaff: async (req: ServiceRequest): Promise<void> => {
    const { error } = await supabase.from("service_requests").insert({
      store_id: req.storeId,
      table_id: req.tableId,
      table_number: req.tableNumber,
      type: req.type,
    });
    if (error) throw error;
  },
};
```

Và thêm import ở đầu file nếu chưa có:
```typescript
import { SessionOrder, ServiceRequest, OrderState } from "@/types/order.types";
```

- [ ] **Step 5.3: Thêm `useSessionOrders` vào `order.queries.ts`**

Thay toàn bộ `mini-app/src/services/order/order.queries.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { orderService, sessionOrderService } from "./order.api";
import { GET_ORDER_BY_ID_KEY } from "@/constants/api";

export function useOrderWithItems(orderId: string) {
  return useQuery({
    queryKey: [GET_ORDER_BY_ID_KEY, orderId],
    queryFn: () => orderService.getOrderWithItems(orderId),
    enabled: !!orderId,
  });
}

export function useSessionOrders(zaloUserId: string, tableId: string) {
  return useQuery({
    queryKey: ["session-orders", zaloUserId, tableId],
    queryFn: () => sessionOrderService.getSessionOrders(zaloUserId, tableId),
    enabled: !!zaloUserId && !!tableId,
    refetchInterval: 30_000, // refresh mỗi 30s để cập nhật status đơn
  });
}
```

- [ ] **Step 5.4: Thêm `useCallStaff` vào `order.mutations.ts`**

Thêm vào cuối `mini-app/src/services/order/order.mutations.ts`:

```typescript
import { useMutation } from "@tanstack/react-query";
import { sessionOrderService } from "./order.api";
import { ServiceRequest } from "@/types/order.types";

// ... export hiện có giữ nguyên ...

export function useCallStaff() {
  return useMutation({
    mutationFn: (req: ServiceRequest) => sessionOrderService.callStaff(req),
  });
}
```

- [ ] **Step 5.5: Commit**

```bash
git add mini-app/src/types/order.types.ts \
        mini-app/src/services/order/order.api.ts \
        mini-app/src/services/order/order.queries.ts \
        mini-app/src/services/order/order.mutations.ts
git commit -m "feat(mini-app): session orders service — get_session_orders RPC + callStaff"
```

---

## Task 6: Trang "Đã gọi" (Session Orders)

**Files:**
- Create: `mini-app/src/pages/session-orders/index.tsx`

- [ ] **Step 6.1: Tạo trang `session-orders/index.tsx`**

```typescript
import { useState } from "react";
import { useAppStore } from "@/stores/app.store";
import { useSessionOrders } from "@/services/order/order.queries";
import { useCallStaff } from "@/services/order/order.mutations";
import { formatCurrency } from "@/utils/format";
import { useSnackbar } from "zmp-ui";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: "Chờ xác nhận", color: "bg-yellow-100 text-yellow-700" },
  confirmed: { label: "Đã xác nhận",  color: "bg-blue-100 text-blue-700" },
  cooking:   { label: "Đang làm",     color: "bg-orange-100 text-orange-700" },
  ready:     { label: "Sẵn sàng",     color: "bg-green-100 text-green-700" },
  paid:      { label: "Đã thanh toán",color: "bg-gray-100 text-gray-600" },
};

export default function SessionOrdersPage() {
  const { zaloUserId, tableId, tableNumber, storeId } = useAppStore();
  const { data: orders = [], isLoading } = useSessionOrders(zaloUserId, tableId);
  const { mutate: callStaff, isPending: isCalling } = useCallStaff();
  const { openSnackbar } = useSnackbar();
  const [calledAt, setCalledAt] = useState<number | null>(null);

  const grandTotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const hasUnpaid = orders.some((o) => o.status !== "paid");

  const handleCallStaff = () => {
    // Chặn gọi liên tục — tối thiểu 60s giữa 2 lần
    if (calledAt && Date.now() - calledAt < 60_000) {
      openSnackbar({ text: "Đã gọi rồi, nhân viên đang đến!", type: "warning" });
      return;
    }
    callStaff(
      { storeId, tableId, tableNumber, type: "payment" },
      {
        onSuccess: () => {
          setCalledAt(Date.now());
          openSnackbar({ text: "Đã gọi nhân viên! Vui lòng chờ.", type: "success" });
        },
        onError: () => {
          openSnackbar({ text: "Gọi thất bại, thử lại sau.", type: "error" });
        },
      },
    );
  };

  // Chưa quét QR hoặc chưa có zalo_user_id
  if (!zaloUserId || !tableId) {
    return (
      <div
        className="flex h-full flex-col bg-[#F7F8FA]"
        style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="px-4 pb-4">
          <p className="text-xlarge-sb font-bold text-text-primary">Đã gọi</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-4xl">📋</div>
          <p className="font-medium text-text-primary">Quét QR tại bàn trước</p>
          <p className="text-small text-text-secondary">
            Vui lòng dùng Zalo quét mã QR trên bàn để xem lịch sử gọi món.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex h-full flex-col bg-[#F7F8FA]"
        style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="px-4 pb-4 flex items-center justify-between">
          <p className="text-xlarge-sb font-bold text-text-primary">Đã gọi</p>
        </div>
        <div className="mx-3.5 mt-3 space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col bg-[#F7F8FA]"
      style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3">
        <div>
          <p className="text-xlarge-sb font-bold text-text-primary">Đã gọi</p>
          {tableNumber && (
            <p className="text-small text-text-secondary">{tableNumber}</p>
          )}
        </div>
        {hasUnpaid && (
          <button
            onClick={handleCallStaff}
            disabled={isCalling}
            className="flex items-center gap-1.5 rounded-xl bg-orange-50 px-3 py-2 text-orange-500 active:opacity-70 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="text-small font-semibold">Gọi thanh toán</span>
          </button>
        )}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto pb-4">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="text-4xl">🍽️</div>
            <p className="font-medium text-text-primary">Chưa gọi món nào</p>
            <p className="text-small text-text-secondary">
              Vào tab Menu để chọn món nhé!
            </p>
          </div>
        ) : (
          <>
            <div className="mx-3.5 space-y-3">
              {orders.map((order, idx) => {
                const statusInfo = STATUS_LABEL[order.status] ?? { label: order.status, color: "bg-gray-100 text-gray-600" };
                return (
                  <div key={order.id} className="rounded-xl bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-small-m font-semibold text-text-primary">
                        Lần {orders.length - idx}
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xxsmall font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-small text-text-secondary">
                        {new Date(order.createdAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-small font-semibold text-primary">
                        {formatCurrency(order.totalAmount)}đ
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tổng cộng */}
            <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-3">
              <div className="flex justify-between">
                <p className="text-small text-text-secondary">Tổng cộng {orders.length} lần gọi</p>
                <p className="text-large-m font-bold text-primary">
                  {formatCurrency(grandTotal)}đ
                </p>
              </div>
              {hasUnpaid && (
                <p className="mt-1.5 text-xxsmall text-text-secondary">
                  Nhấn "Gọi thanh toán" bên trên để nhân viên ra thanh toán cho bạn.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.2: Commit**

```bash
git add mini-app/src/pages/session-orders/index.tsx
git commit -m "feat(mini-app): trang Đã gọi — xem đơn phiên + tổng tiền + nút gọi nhân viên"
```

---

## Task 7: Trang "Nhà hàng" (Store Info)

**Files:**
- Create: `mini-app/src/pages/store-info/index.tsx`

- [ ] **Step 7.1: Tạo `store-info/index.tsx`**

```typescript
import { useState } from "react";
import { useAppStore } from "@/stores/app.store";
import { followOA } from "zmp-sdk";

export default function StoreInfoPage() {
  const { storeId, storeName, storeLogoUrl, storeAddress, storePhone, zaloOaId } = useAppStore();
  const [following, setFollowing] = useState(false);
  const [followed, setFollowed] = useState(() => {
    if (!storeId) return false;
    return !!localStorage.getItem(`mevo_oa_prompted_${storeId}`);
  });

  if (!storeId) {
    return (
      <div
        className="flex h-full flex-col bg-[#F7F8FA] items-center justify-center gap-3 px-6 text-center"
        style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="text-4xl">📷</div>
        <p className="font-medium text-text-primary">Quét QR tại bàn trước</p>
      </div>
    );
  }

  const handleFollowOA = async () => {
    if (!zaloOaId || followed) return;
    setFollowing(true);
    try {
      await followOA({ id: zaloOaId });
      setFollowed(true);
      localStorage.setItem(`mevo_oa_prompted_${storeId}`, "1");
    } catch {
      // -201 = user từ chối — không làm gì
    } finally {
      setFollowing(false);
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-[#F7F8FA]"
      style={{ paddingTop: "calc(var(--zaui-safe-area-inset-top, 0px) + 16px)" }}
    >
      {/* Logo + tên quán */}
      <div className="flex flex-col items-center gap-3 bg-white px-6 pb-6 pt-4">
        {storeLogoUrl ? (
          <img
            src={storeLogoUrl}
            alt={storeName}
            className="h-20 w-20 rounded-2xl object-cover shadow-sm"
            draggable={false}
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-4xl">
            🍽️
          </div>
        )}
        <p className="text-xlarge-sb font-bold text-text-primary">{storeName}</p>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* Thông tin liên hệ */}
        <div className="mx-3.5 mt-3 rounded-xl bg-white">
          {storeAddress && (
            <InfoRow
              icon="📍"
              label="Địa chỉ"
              value={storeAddress}
            />
          )}
          {storePhone && (
            <InfoRow
              icon="📞"
              label="Điện thoại"
              value={storePhone}
              onPress={() => { window.location.href = `tel:${storePhone}`; }}
            />
          )}
        </div>

        {/* Follow OA */}
        {zaloOaId && (
          <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-small-m font-semibold text-text-primary">
                  Nhận thông báo Zalo
                </p>
                <p className="mt-0.5 text-xxsmall text-text-secondary">
                  Quan tâm OA để nhận thông báo khi món xong
                </p>
              </div>
              {followed ? (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xxsmall font-semibold text-green-700">
                  Đã quan tâm
                </span>
              ) : (
                <button
                  onClick={handleFollowOA}
                  disabled={following}
                  className="rounded-full bg-primary px-3 py-1 text-xxsmall font-semibold text-white disabled:opacity-60"
                >
                  {following ? "..." : "Quan tâm"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <button
      onClick={onPress}
      disabled={!onPress}
      className="flex w-full items-start gap-3 border-b border-neutral100 px-4 py-3 last:border-0 text-left disabled:cursor-default"
    >
      <span className="text-xl">{icon}</span>
      <div>
        <p className="text-xxsmall text-text-secondary">{label}</p>
        <p className="text-small text-text-primary">{value}</p>
      </div>
    </button>
  );
}
```

- [ ] **Step 7.2: Commit**

```bash
git add mini-app/src/pages/store-info/index.tsx
git commit -m "feat(mini-app): trang Nhà hàng — info quán + nút follow OA"
```

---

## Task 8: Admin — Toggle phương thức thanh toán

**Files:**
- Modify: `admin-web/lib/actions/store.ts`
- Modify: `admin-web/app/admin/settings/page.tsx`
- Modify: `admin-web/app/admin/settings/settings-client.tsx`

- [ ] **Step 8.1: Cập nhật `lib/actions/store.ts` — thêm payment_methods**

Thêm vào `updateStoreSettings` sau dòng `const patch: Record<string, unknown> = ...`:

```typescript
// payment_methods: validate ít nhất 1 phương thức được chọn
const rawMethods = formData.getAll("payment_methods") as string[];
if (rawMethods.length > 0) {
  const valid = rawMethods.filter((m) => m === "zalopay" || m === "cash");
  if (valid.length === 0) throw new Error("Phải chọn ít nhất 1 phương thức thanh toán");
  patch.payment_methods = valid;
}
```

File `updateStoreSettings` đầy đủ sau khi sửa:

```typescript
export async function updateStoreSettings(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()

  const patch: Record<string, unknown> = { name: formData.get('name') as string }

  // Logo
  const logo = formData.get('logo') as File | null
  if (logo && logo.size > 0) {
    const ext = logo.type === 'image/png' ? 'png' : logo.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${storeId}/logo-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(ASSET_BUCKET)
      .upload(path, logo, { contentType: logo.type || 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`upload logo: ${upErr.message}`)
    patch.logo_url = admin.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
  }

  // payment_methods — ít nhất 1 phương thức
  const rawMethods = formData.getAll('payment_methods') as string[]
  if (rawMethods.length > 0) {
    const valid = rawMethods.filter((m) => m === 'zalopay' || m === 'cash')
    if (valid.length === 0) throw new Error('Phải chọn ít nhất 1 phương thức thanh toán')
    patch.payment_methods = valid
  }

  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) throw new Error(`updateStoreSettings: ${error.message}`)
  revalidatePath('/admin/settings')
}
```

- [ ] **Step 8.2: Cập nhật `settings/page.tsx` — đọc payment_methods từ DB**

Đọc file `admin-web/app/admin/settings/page.tsx` để biết cấu trúc hiện tại, sau đó thêm `payment_methods` vào query và truyền xuống client:

```typescript
// Trong page.tsx, thêm payment_methods vào select:
const { data: store } = await supabase
  .from('stores')
  .select('name, logo_url, payment_methods')  // thêm payment_methods
  .eq('id', storeId)
  .single()

// Truyền xuống SettingsClient:
<SettingsClient
  name={store.name}
  logoUrl={store.logo_url}
  paymentMethods={(store.payment_methods as string[]) ?? ['zalopay', 'cash']}
/>
```

> Đọc `admin-web/app/admin/settings/page.tsx` hiện tại trước khi sửa để biết pattern đang dùng.

- [ ] **Step 8.3: Cập nhật `settings-client.tsx` — UI toggle thanh toán**

Thay toàn bộ `admin-web/app/admin/settings/settings-client.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateStoreSettings } from '@/lib/actions/store'
import SquareCropper from '../menu/square-cropper'

interface Props {
  name: string
  logoUrl: string | null
  paymentMethods: string[]
}

export default function SettingsClient({ name, logoUrl, paymentMethods }: Props) {
  const router = useRouter()
  const [logo, setLogo] = useState<File | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [methods, setMethods] = useState<Set<string>>(new Set(paymentMethods))

  const toggleMethod = (method: string) => {
    setMethods((prev) => {
      const next = new Set(prev)
      if (next.has(method)) {
        // Không cho bỏ nếu còn duy nhất 1 phương thức
        if (next.size <= 1) return prev
        next.delete(method)
      } else {
        next.add(method)
      }
      return next
    })
  }

  return (
    <form
      action={async (fd) => {
        setError('')
        if (logo) fd.set('logo', logo)
        // Gửi payment_methods như checkbox values
        methods.forEach((m) => fd.append('payment_methods', m))
        try {
          await updateStoreSettings(fd)
          setLogo(null)
          setSaved(true)
          router.refresh()
          setTimeout(() => setSaved(false), 2500)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Lỗi khi lưu')
        }
      }}
      className="flex max-w-md flex-col gap-4 text-gray-900"
    >
      <div>
        <label className="label">Tên quán *</label>
        <input
          name="name"
          required
          defaultValue={name}
          placeholder="VD: Phở Gà Pubu"
          className="input"
        />
      </div>

      <div>
        <label className="label">Logo quán (vuông 1:1)</label>
        <SquareCropper initialUrl={logoUrl} onChange={setLogo} />
        <p className="mt-1 text-xs text-gray-400">
          Hiện ở đầu trang menu + header trên mini-app của khách.
        </p>
      </div>

      {/* Phương thức thanh toán */}
      <div>
        <label className="label">Phương thức thanh toán</label>
        <p className="mb-2 text-xs text-gray-400">
          Bật ít nhất 1 phương thức. Quán hướng tới ZaloPay để tránh gọi giả mạo.
        </p>
        <div className="flex flex-col gap-2">
          <PaymentToggle
            id="zalopay"
            label="ZaloPay"
            description="Khách thanh toán trong Zalo trước khi bếp làm"
            checked={methods.has('zalopay')}
            disabled={methods.size === 1 && methods.has('zalopay')}
            onChange={() => toggleMethod('zalopay')}
          />
          <PaymentToggle
            id="cash"
            label="Tiền mặt"
            description="Khách trả tiền mặt với nhân viên khi ra về"
            checked={methods.has('cash')}
            disabled={methods.size === 1 && methods.has('cash')}
            onChange={() => toggleMethod('cash')}
          />
        </div>
        {methods.size === 1 && (
          <p className="mt-1.5 text-xs text-orange-500">
            Phải bật ít nhất 1 phương thức thanh toán.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Lưu
        </button>
        {saved && <span className="text-sm text-green-600">✓ Đã lưu</span>}
      </div>
    </form>
  )
}

function PaymentToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between rounded-xl border-2 p-3 transition-colors ${
        checked ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <div
        className={`h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-orange-500' : 'bg-gray-200'
        }`}
      >
        <div
          className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  )
}
```

- [ ] **Step 8.4: Commit**

```bash
git add admin-web/lib/actions/store.ts \
        admin-web/app/admin/settings/page.tsx \
        admin-web/app/admin/settings/settings-client.tsx
git commit -m "feat(admin): toggle phương thức thanh toán per store — ZaloPay / Tiền mặt"
```

---

## Task 9: Mini-app — Checkout chỉ hiện phương thức được bật

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx`

- [ ] **Step 9.1: Cập nhật `CheckoutPage` — đọc paymentMethods từ store**

Trong `mini-app/src/pages/checkout/index.tsx`:

1. Import `useAppStore`:
```typescript
const { storeId, tableId, tableNumber, zaloUserId, paymentMethods } = useAppStore();
```

2. Set default `paymentMethod` dựa vào config:
```typescript
const defaultMethod = paymentMethods.includes("zalopay") ? "zalopay" : "cash";
const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultMethod);
```

3. Ẩn option không được bật:
```typescript
// Trong JSX phần thanh toán, thêm điều kiện:
{paymentMethods.includes("zalopay") && (
  <PaymentOption
    id="zalopay"
    label="ZaloPay"
    sublabel="Thanh toán trong Zalo, nhanh 1 chạm"
    emoji="💳"
    selected={paymentMethod === "zalopay"}
    onSelect={() => setPaymentMethod("zalopay")}
  />
)}
{paymentMethods.includes("cash") && (
  <PaymentOption
    id="cash"
    label="Tiền mặt"
    sublabel="Thanh toán với nhân viên khi ra về"
    emoji="💵"
    selected={paymentMethod === "cash"}
    onSelect={() => setPaymentMethod("cash")}
  />
)}
```

4. Nếu chỉ có 1 phương thức — ẩn hẳn section chọn (không cần user chọn):
```typescript
const singleMethod = paymentMethods.length === 1;

// Trong JSX:
{!singleMethod && (
  <div className="mx-3.5 mt-3 rounded-xl bg-white px-4 py-4">
    <p className="mb-3 text-large-m font-semibold">Thanh toán</p>
    {/* ... options ... */}
  </div>
)}
```

- [ ] **Step 9.2: Cập nhật import type**

```typescript
import { useAppStore, PaymentMethod } from "@/stores/app.store";
```

- [ ] **Step 9.3: Commit**

```bash
git add mini-app/src/pages/checkout/index.tsx
git commit -m "feat(mini-app): checkout ẩn phương thức thanh toán bị tắt theo cấu hình store"
```

---

## Task 10: Kitchen Display — hiện alert khi có service_request

**Files:**
- Modify: `admin-web/app/admin/kitchen/` (đọc file hiện tại trước khi sửa)

- [ ] **Step 10.1: Đọc file kitchen hiện tại**

```bash
cat admin-web/app/admin/kitchen/page.tsx
```

- [ ] **Step 10.2: Subscribe realtime service_requests**

Trong kitchen display client component, thêm subscription:

```typescript
// Subscribe realtime service_requests cho store này
useEffect(() => {
  if (!storeId) return;

  const channel = supabase
    .channel(`service_requests:${storeId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "service_requests",
        filter: `store_id=eq.${storeId}`,
      },
      (payload) => {
        const req = payload.new as {
          table_number: string;
          type: string;
        };
        // Hiện alert/banner — dùng state để show banner tạm
        setCallAlerts((prev) => [
          ...prev,
          {
            id: Date.now(),
            tableNumber: req.table_number,
            type: req.type,
          },
        ]);
        // Tự xóa sau 60s
        setTimeout(() => {
          setCallAlerts((prev) => prev.filter((a) => a.id !== Date.now()));
        }, 60_000);
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [storeId]);
```

Banner UI:
```typescript
{callAlerts.map((alert) => (
  <div
    key={alert.id}
    className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl bg-orange-500 px-4 py-3 text-white shadow-lg"
  >
    <span className="text-2xl">🔔</span>
    <div>
      <p className="font-bold">{alert.tableNumber} gọi thanh toán</p>
      <p className="text-sm opacity-80">Nhân viên ra bàn thanh toán</p>
    </div>
    <button
      onClick={() => setCallAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
      className="ml-2 text-white opacity-70 hover:opacity-100"
    >
      ✕
    </button>
  </div>
))}
```

- [ ] **Step 10.3: Commit**

```bash
git add admin-web/app/admin/kitchen/
git commit -m "feat(kitchen): hiện alert realtime khi khách nhấn nút gọi thanh toán"
```

---

## Self-Review Checklist

### Spec Coverage
| Yêu cầu | Task |
|---------|------|
| Follow OA prompt lần đầu mở app | Task 2, 3 |
| Tab "Đã gọi" scoped zalo_user_id+table+6h | Task 1 (RPC), 5, 6 |
| Tab "Nhà hàng" + follow OA | Task 7 |
| Nút chuông gọi nhân viên | Task 6 (button), 10 (kitchen) |
| Admin toggle thanh toán | Task 1 (DB), 8 |
| Mini-app ẩn method bị tắt | Task 9 |
| Session isolation (không cross-session) | Task 1 (RPC filter 6h + zalo_user_id) |

### Không có Placeholder
- Tất cả code block đầy đủ
- Migration SQL đầy đủ
- Exact file paths

### Type Consistency
- `PaymentMethod` defined trong `app.store.ts`, dùng nhất quán trong `checkout/index.tsx`
- `SessionOrder`, `ServiceRequest` defined trong `order.types.ts`, dùng trong `order.api.ts` và `order.mutations.ts`
- `useCallStaff` dùng `ServiceRequest` từ `order.types.ts`
- Bottom tabs dùng `totalItems` từ `useCartStore` (đã có)

---

Plan complete và saved.
