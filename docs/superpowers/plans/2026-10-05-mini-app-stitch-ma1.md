# Mini App Stitch — MA-1 (khung + Thực đơn tại bàn + Giỏ hàng) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bộ khung giao diện mới của Mini App (thanh công cụ m06, 2 bộ tab, component dùng chung), làm lại màn Thực đơn tại bàn (m06) + Giỏ hàng, và nâng chặn gọi nhân viên lên 3 phút ở server.

**Architecture:** Component mới ở `mini-app/src/components/ui/`, chỉ nhận props (không đọc store) để dễ thay. Quyết định thuần (chọn lưới/danh sách, bộ tab, giờ gọi lại) tách thành hàm trong `src/utils/` có vitest. Layout thay `Header` + `BottomTabs` + `CartFloatButton` bằng `AppToolbar` + `TabBar` + `StickyCartBar`. Logic đặt món/thanh toán/voucher giữ nguyên — chỉ đổi lớp hiển thị.

**Tech Stack:** React 18 + TypeScript, Tailwind 3 (token ở `src/tokens.js`, màu chủ đạo qua `--color-primary-rgb`), zmp-ui (`useSnackbar`), zmp-sdk (`followOA`), Supabase RPC, vitest (node, không jsdom — KHÔNG có test component).

**Spec:** `docs/superpowers/specs/2026-10-05-mini-app-stitch-design.md`

## Global Constraints

- Tiếng Việt cho mọi chữ người dùng thấy; comment tiếng Việt cho logic phức tạp.
- Mobile-first: kiểm ở khổ 360px và 390px, không cuộn ngang.
- Mọi điểm nhấn dùng `primary` (màu chủ đạo quán). Ngoại lệ: nút Gọi NV luôn `critical` (đỏ); nhãn trạng thái dùng `success` / `info` / `warning` / `critical`, luôn kèm chữ.
- Góc phải hàng 1 thanh công cụ **chừa trống 96px** — Zalo tự đè nút "··· ⊗" ở đó.
- Không thêm dependency vào mini-app (mỗi worktree quán phải `npm install` lại). Icon mới thêm qua `scripts/gen-mini-app-icons.cjs`.
- Không hardcode ID/key/URL.
- Không đổi logic tạo đơn / thanh toán / voucher / vòng quay / quy tắc vào bếp.
- File chứa `CREATE OR REPLACE` một RPC sống nằm RIÊNG một migration, không ghi "rerun-safe".
- Commit: `feat: …` / `fix: …` / `chore: …`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Gọi NV lần 2 sau khi nhân viên đã bấm "xử lý xong" yêu cầu trước, chưa đủ 3 phút** → vẫn bị chặn (spec: "3 phút sau mới cho gọi tiếp"); bản cũ chỉ chặn khi yêu cầu còn mở. Test SQL ở Task 1.
2. **Server trả lỗi chặn nhưng thiếu/hỏng `details`** (bản server cũ chưa áp 087, hoặc mạng cắt giữa chừng) → app vẫn báo "Bạn vừa gọi, vui lòng chờ" chứ không vỡ hoặc báo "gọi thất bại". Test ở Task 1.
3. **Danh mục rỗng hoặc 1 món** → `pickProductLayout` không chia cho 0, trả `list`. Test ở Task 2.
4. **Tên món rất dài / giá 7 chữ số trên khổ 360px** → tên cắt 2 dòng, giá một dòng, nút + không bị đẩy ra ngoài. Kiểm bằng ảnh chụp Task 8 (thêm món giả dài trong dữ liệu mock của bước chụp).
5. **Lối vào thường của quán chỉ xem menu (Bảo Lương mở không qua QR)** → không hiện Gọi NV, chip bàn, giỏ, nút +. Test `tabsFor`/`toolbarModeFor` ở Task 2 + ảnh Task 8.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/087_call_staff_cooldown_3m.sql` (mới) | `ping_service_request` chặn 3 phút/phiên (hoặc bàn), trả giờ được gọi lại trong `DETAIL` |
| `mini-app/src/services/service-request.ts` (sửa) | Ném `CallStaffCooldownError` có `retryAt` khi server chặn |
| `mini-app/src/utils/product-layout.ts` (mới) | `pickProductLayout(products)` → `"grid" \| "list"` |
| `mini-app/src/utils/nav-sets.ts` (mới) | `tabsFor(...)`, `toolbarModeFor(...)` — bộ tab + chế độ thanh công cụ theo lối vào |
| `mini-app/src/utils/call-staff-message.ts` (mới) | Chữ thông báo gọi NV (thành công / đang chặn / lỗi) |
| `scripts/gen-mini-app-icons.cjs` + `mini-app/src/components/common/icons.tsx` (sinh lại) | Thêm icon ShoppingCart, Heart, Search, ChevronLeft, Plus, Minus, ArrowRight, CalendarDays |
| `mini-app/src/components/ui/section-card.tsx` (mới) | Khối trắng bo góc + tiêu đề có icon |
| `mini-app/src/components/ui/section-heading.tsx` (mới) | Tiêu đề nhóm vạch trái + số đếm |
| `mini-app/src/components/ui/status-pill.tsx` (mới) | Nhãn trạng thái 4 tông |
| `mini-app/src/components/ui/sticky-action-bar.tsx` (mới) | Thanh dính đáy (dạng `dark` / `primary`) |
| `mini-app/src/components/ui/product-card.tsx` (mới) | Thẻ món `grid` / `list` |
| `mini-app/src/components/ui/category-chips.tsx` (mới) | Chip danh mục dính đầu |
| `mini-app/src/hooks/use-oa-follow.ts` (mới) | Trạng thái + hành động quan tâm OA (tách từ store-info) |
| `mini-app/src/components/ui/call-staff-button.tsx` (mới) | Nút Gọi NV đỏ, chuông rung, thông báo |
| `mini-app/src/components/ui/app-toolbar.tsx` (mới) | Thanh công cụ 2 hàng |
| `mini-app/src/components/ui/tab-bar.tsx` (mới) | Thanh tab theo `tabsFor` |
| `mini-app/src/components/ui/sticky-cart-bar.tsx` (mới) | Thanh giỏ tối m06 |
| `mini-app/src/components/layout/layout.tsx` (sửa) | Dùng 3 component trên |
| `mini-app/src/pages/account/index.tsx` (mới) + `router.tsx` (sửa) | Trang Tài khoản tạm |
| `mini-app/src/pages/menu/index.tsx` (sửa) | Thực đơn m06 |
| `mini-app/src/pages/checkout/index.tsx` (sửa) | Giỏ hàng ngôn ngữ mới |
| `mini-app/src/css/app.scss` (sửa) | Keyframe chuông rung + `prefers-reduced-motion` |
| `docs/testing/mini-app-stitch/MA-1.md` (mới) + `TESTING.md` | Checklist |

Xoá sau khi thay: `components/layout/header.tsx`, `components/layout/bottom-tabs.tsx`, `components/common/cart-float-button.tsx` (chỉ khi `grep` không còn import nào).

---

### Task 1: Server chặn gọi nhân viên 3 phút + client đọc giờ gọi lại

**Files:**
- Create: `supabase/migrations/087_call_staff_cooldown_3m.sql`
- Modify: `mini-app/src/services/service-request.ts`
- Test: `mini-app/src/services/service-request.test.ts`

**Interfaces:**
- Produces: `class CallStaffCooldownError extends Error { retryAt: Date | null }`; `pingCallStaff(tableId: string): Promise<void>` ném `CallStaffCooldownError` khi bị chặn, ném lỗi gốc khi lỗi khác.

- [ ] **Step 1: Viết test thất bại** — thêm vào `service-request.test.ts` (giữ 2 test cũ, đổi test "trả lỗi server" thành 3 test dưới):

```ts
import { CallStaffCooldownError, pingCallStaff } from "./service-request";

  it("server chặn kèm giờ gọi lại → CallStaffCooldownError có retryAt", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Vui lòng chờ trước khi gọi nhân viên lần nữa", details: "2026-10-05T12:28:00Z", code: "P0001" },
    });
    const err = await pingCallStaff("table-1").catch((e) => e);
    expect(err).toBeInstanceOf(CallStaffCooldownError);
    expect((err as CallStaffCooldownError).retryAt?.toISOString()).toBe("2026-10-05T12:28:00.000Z");
  });

  it("server chặn nhưng details hỏng/thiếu → vẫn là lỗi chặn, retryAt null", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Vui lòng chờ trước khi gọi nhân viên lần nữa", details: null } });
    const err = await pingCallStaff("table-1").catch((e) => e);
    expect(err).toBeInstanceOf(CallStaffCooldownError);
    expect((err as CallStaffCooldownError).retryAt).toBeNull();
  });

  it("lỗi khác (bàn không hoạt động) → ném nguyên lỗi server", async () => {
    const error = { message: "Bàn không thuộc quán hoặc không hoạt động", details: null };
    rpc.mockResolvedValue({ data: null, error });
    await expect(pingCallStaff("table-1")).rejects.toBe(error);
  });
```

- [ ] **Step 2: Chạy thấy fail** — `cd mini-app && npx vitest run src/services/service-request.test.ts` → FAIL ("CallStaffCooldownError is not exported").

- [ ] **Step 3: Sửa `service-request.ts`**

```ts
import { getOrCreateDeviceId } from "@/services/device-id";
import { supabase } from "@/services/supabase";

// Câu server ném khi đang trong khoảng chặn (mig 087). Nhận diện theo câu chữ vì
// bản server cũ (trước 087) cũng ném đúng câu này nhưng không có DETAIL.
const COOLDOWN_MESSAGE = "Vui lòng chờ trước khi gọi nhân viên lần nữa";

export class CallStaffCooldownError extends Error {
  constructor(readonly retryAt: Date | null) {
    super(COOLDOWN_MESSAGE);
    this.name = "CallStaffCooldownError";
  }
}

/** Khách chỉ ping qua RPC; server tự suy quán/mâm và chống spam 3 phút (mig 087). */
export async function pingCallStaff(tableId: string): Promise<void> {
  const { error } = await supabase.rpc("ping_service_request", {
    p_table_id: tableId,
    p_type: "call_staff",
    p_device_id: getOrCreateDeviceId(),
  });
  if (!error) return;
  if (error.message === COOLDOWN_MESSAGE) {
    const at = typeof error.details === "string" ? new Date(error.details) : null;
    throw new CallStaffCooldownError(at && !Number.isNaN(at.getTime()) ? at : null);
  }
  throw error;
}
```

- [ ] **Step 4: Chạy test pass** — cùng lệnh → PASS (5 test).

- [ ] **Step 5: Viết migration 087** — lấy nguyên văn hàm prod hiện tại (`select pg_get_functiondef('public.ping_service_request(uuid,text,text)'::regprocedure)`) rồi chèn khối chặn ngay sau đoạn tìm `v_session_id`, đổi 2 chỗ `interval '10 seconds'` → `interval '3 minutes'`, và đổi `RAISE` cuối kèm DETAIL:

```sql
-- 087: Gọi nhân viên chặn 3 PHÚT cho mỗi phiên bàn (hoặc mỗi bàn khi chưa có phiên),
-- KỂ CẢ khi yêu cầu trước đã được nhân viên xử lý xong (bản 050 chỉ chặn 10 giây và chỉ khi
-- yêu cầu còn mở). DETAIL = giờ được gọi lại (UTC ISO) để Mini App hiện "gọi lại sau HH:MM".
-- File này CHỈ chứa ping_service_request — không gộp RPC khác (quy tắc 2026-09-01).
CREATE OR REPLACE FUNCTION public.ping_service_request(p_table_id uuid, p_type text, p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table public.tables%ROWTYPE;
  v_session_id uuid;
  v_request public.service_requests%ROWTYPE;
  v_last_ping timestamptz;
BEGIN
  IF p_type IS DISTINCT FROM 'call_staff' THEN
    RAISE EXCEPTION 'Loại yêu cầu không hợp lệ';
  END IF;

  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bàn không thuộc quán hoặc không hoạt động';
  END IF;

  SELECT s.id INTO v_session_id
  FROM public.table_sessions s
  WHERE s.id = public.open_session_id_for_table(v_table.id)
    AND s.store_id = v_table.store_id
    AND s.status = 'open';

  -- Lần gọi gần nhất của CÙNG phiên (hoặc cùng bàn khi chưa có phiên), đã xử lý hay chưa.
  SELECT max(r.last_ping_at) INTO v_last_ping
  FROM public.service_requests r
  WHERE r.store_id = v_table.store_id
    AND r.type = 'call_staff'
    AND CASE WHEN v_session_id IS NOT NULL THEN r.session_id = v_session_id
             ELSE r.session_id IS NULL AND r.table_id = v_table.id END;

  IF v_last_ping IS NOT NULL AND v_last_ping > now() - interval '3 minutes' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Vui lòng chờ trước khi gọi nhân viên lần nữa',
      DETAIL = to_char((v_last_ping + interval '3 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.service_requests AS current_request (
      store_id, table_id, table_number, type, session_id, last_ping_at, last_device_id, ping_count
    ) VALUES (
      v_table.store_id, v_table.id, v_table.table_number, 'call_staff', v_session_id, now(), p_device_id, 1
    )
    ON CONFLICT (store_id, session_id, type)
      WHERE resolved_at IS NULL AND session_id IS NOT NULL
    DO UPDATE
      SET table_id = EXCLUDED.table_id,
          table_number = EXCLUDED.table_number,
          last_ping_at = EXCLUDED.last_ping_at,
          last_device_id = EXCLUDED.last_device_id,
          ping_count = current_request.ping_count + 1
      -- Chốt chặn thứ hai cho 2 lần gọi chạy song song cùng lúc.
      WHERE current_request.last_ping_at <= EXCLUDED.last_ping_at - interval '3 minutes'
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.service_requests AS current_request (
      store_id, table_id, table_number, type, session_id, last_ping_at, last_device_id, ping_count
    ) VALUES (
      v_table.store_id, v_table.id, v_table.table_number, 'call_staff', NULL, now(), p_device_id, 1
    )
    ON CONFLICT (store_id, table_id, type)
      WHERE resolved_at IS NULL AND session_id IS NULL
    DO UPDATE
      SET table_number = EXCLUDED.table_number,
          last_ping_at = EXCLUDED.last_ping_at,
          last_device_id = EXCLUDED.last_device_id,
          ping_count = current_request.ping_count + 1
      WHERE current_request.last_ping_at <= EXCLUDED.last_ping_at - interval '3 minutes'
    RETURNING * INTO v_request;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Vui lòng chờ trước khi gọi nhân viên lần nữa',
      DETAIL = to_char((now() + interval '3 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  END IF;

  RETURN to_jsonb(v_request);
END;
$function$;
```

- [ ] **Step 6: Áp lên prod** (được phép tự áp qua Supabase MCP) — `apply_migration` tên `087_call_staff_cooldown_3m`.

- [ ] **Step 7: Kiểm bằng SQL trong transaction rồi ROLLBACK** (không để rác ở bảng thật) — trên một bàn Bảo Lương đang trống:

```sql
begin;
select public.ping_service_request('<table_id>', 'call_staff', 'test-device');           -- OK
update public.service_requests set resolved_at = now() where table_id = '<table_id>' and resolved_at is null;
select public.ping_service_request('<table_id>', 'call_staff', 'test-device');           -- PHẢI lỗi, có DETAIL
rollback;
```
Expected: lệnh thứ 2 lỗi `Vui lòng chờ trước khi gọi nhân viên lần nữa` (Review Focus #1).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/087_call_staff_cooldown_3m.sql mini-app/src/services/service-request.ts mini-app/src/services/service-request.test.ts
git commit -m "feat: chan goi nhan vien 3 phut o server (mig 087)"
```

---

### Task 2: Hàm thuần — chọn lưới/danh sách, bộ tab, chữ thông báo gọi NV

**Files:**
- Create: `mini-app/src/utils/product-layout.ts`, `mini-app/src/utils/nav-sets.ts`, `mini-app/src/utils/call-staff-message.ts`
- Test: `mini-app/src/utils/product-layout.test.ts`, `mini-app/src/utils/nav-sets.test.ts`, `mini-app/src/utils/call-staff-message.test.ts`

**Interfaces:**
- Consumes: `CallStaffCooldownError` (Task 1).
- Produces:
  - `pickProductLayout(products: Array<{ image?: string | null }>): "grid" | "list"`
  - `type TabKey = "home" | "reserve" | "my-orders" | "menu" | "session"`; `type TabDef = { key: TabKey; path: string; matchPaths: string[]; label: string }`
  - `tabsFor(input: { entryKind: "root" | "table"; readOnlyMenu: boolean; showReservations: boolean }): TabDef[]`
  - `type ToolbarMode = { callStaff: boolean; tableChip: boolean; cart: boolean }`
  - `toolbarModeFor(input: { entryKind: "root" | "table"; canOrder: boolean }): ToolbarMode`
  - `callStaffMessage(result: { ok: true } | { ok: false; error: unknown }): { text: string; type: "success" | "warning" | "error" }`

- [ ] **Step 1: Viết test thất bại**

`product-layout.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { pickProductLayout } from "./product-layout";

describe("pickProductLayout", () => {
  const img = { image: "https://x/a.jpg" };
  const none = { image: null };
  it("≥60% món có ảnh → lưới", () => {
    expect(pickProductLayout([img, img, img, none, none])).toBe("grid"); // 60%
  });
  it("dưới 60% → danh sách", () => {
    expect(pickProductLayout([img, none, none])).toBe("list");
  });
  it("danh mục rỗng hoặc 1 món → danh sách, không chia cho 0", () => {
    expect(pickProductLayout([])).toBe("list");
    expect(pickProductLayout([img])).toBe("list");
  });
  it("chuỗi ảnh rỗng coi như không có ảnh", () => {
    expect(pickProductLayout([{ image: "" }, { image: "  " }, img])).toBe("list");
  });
});
```

`nav-sets.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { tabsFor, toolbarModeFor } from "./nav-sets";

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe("tabsFor", () => {
  it("quét QR bàn → Thực đơn · Đơn gọi", () => {
    expect(keys(tabsFor({ entryKind: "table", readOnlyMenu: false, showReservations: true }))).toEqual(["menu", "session"]);
  });
  it("mở thường, quán chỉ xem menu + có đặt bàn (Bảo Lương) → Trang chủ · Đặt bàn", () => {
    expect(keys(tabsFor({ entryKind: "root", readOnlyMenu: true, showReservations: true }))).toEqual(["home", "reserve"]);
  });
  it("mở thường, quán mang về không đặt bàn (Pubu) → Trang chủ · Đơn của tôi", () => {
    expect(keys(tabsFor({ entryKind: "root", readOnlyMenu: false, showReservations: false }))).toEqual(["home", "my-orders"]);
  });
  it("nhãn đúng chữ Stitch", () => {
    expect(tabsFor({ entryKind: "root", readOnlyMenu: false, showReservations: true }).map((t) => t.label))
      .toEqual(["Trang chủ", "Đặt bàn", "Đơn của tôi"]);
  });
});

describe("toolbarModeFor", () => {
  it("ở bàn gọi được món → đủ Gọi NV, chip bàn, giỏ", () => {
    expect(toolbarModeFor({ entryKind: "table", canOrder: true })).toEqual({ callStaff: true, tableChip: true, cart: true });
  });
  it("ở bàn nhưng bàn bị khoá → vẫn Gọi NV + chip bàn, ẩn giỏ", () => {
    expect(toolbarModeFor({ entryKind: "table", canOrder: false })).toEqual({ callStaff: true, tableChip: true, cart: false });
  });
  it("mở thường chỉ xem menu → không Gọi NV, không chip, không giỏ", () => {
    expect(toolbarModeFor({ entryKind: "root", canOrder: false })).toEqual({ callStaff: false, tableChip: false, cart: false });
  });
});
```

`call-staff-message.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CallStaffCooldownError } from "@/services/service-request";
import { callStaffMessage } from "./call-staff-message";

describe("callStaffMessage", () => {
  it("thành công", () => {
    expect(callStaffMessage({ ok: true })).toEqual({ text: "Đã gọi nhân viên, vui lòng chờ trong giây lát", type: "success" });
  });
  it("đang chặn có giờ → hiện giờ đã gọi và giờ gọi lại (giờ VN)", () => {
    // retryAt 12:28 UTC = 19:28 VN → đã gọi lúc 19:25
    const msg = callStaffMessage({ ok: false, error: new CallStaffCooldownError(new Date("2026-10-05T12:28:00Z")) });
    expect(msg).toEqual({ text: "Bạn vừa gọi lúc 19:25, có thể gọi lại sau 19:28", type: "warning" });
  });
  it("đang chặn không rõ giờ", () => {
    expect(callStaffMessage({ ok: false, error: new CallStaffCooldownError(null) }))
      .toEqual({ text: "Bạn vừa gọi nhân viên, vui lòng chờ ít phút", type: "warning" });
  });
  it("lỗi mạng/khác", () => {
    expect(callStaffMessage({ ok: false, error: new Error("fetch failed") }))
      .toEqual({ text: "Chưa gọi được, kiểm tra mạng rồi thử lại", type: "error" });
  });
});
```

- [ ] **Step 2: Chạy thấy fail** — `npx vitest run src/utils/product-layout.test.ts src/utils/nav-sets.test.ts src/utils/call-staff-message.test.ts` → FAIL (module không tồn tại).

- [ ] **Step 3: Viết code**

`product-layout.ts`:
```ts
// Danh mục có ảnh đẹp → lưới 2 cột kiểu Stitch m06; danh mục không ảnh → danh sách gọn,
// tránh hàng loạt ô ảnh trống (Bảo Lương 0/65 món có ảnh). 1 món thì lưới chỉ còn nửa hàng → danh sách.
const GRID_MIN_RATIO = 0.6;

export function pickProductLayout(products: Array<{ image?: string | null }>): "grid" | "list" {
  if (products.length < 2) return "list";
  const withImage = products.filter((p) => typeof p.image === "string" && p.image.trim() !== "").length;
  return withImage / products.length >= GRID_MIN_RATIO ? "grid" : "list";
}
```

`nav-sets.ts`:
```ts
// Hai bộ tab theo lối vào (spec Q2): mở thường = Trang chủ · Đặt bàn · Đơn của tôi;
// quét QR bàn = Thực đơn · Đơn gọi. Đường dẫn giữ route hiện có — MA-3 sẽ tách
// "Đơn của tôi" cho quán vừa mang về vừa đặt bàn.
export type TabKey = "home" | "reserve" | "my-orders" | "menu" | "session";
export type TabDef = { key: TabKey; path: string; matchPaths: string[]; label: string };

export function tabsFor(input: { entryKind: "root" | "table"; readOnlyMenu: boolean; showReservations: boolean }): TabDef[] {
  if (input.entryKind === "table") {
    return [
      { key: "menu", path: "/", matchPaths: ["/", "/menu"], label: "Thực đơn" },
      { key: "session", path: "/session-orders", matchPaths: ["/session-orders"], label: "Đơn gọi" },
    ];
  }
  const tabs: TabDef[] = [{ key: "home", path: "/", matchPaths: ["/", "/menu"], label: "Trang chủ" }];
  if (input.showReservations) tabs.push({ key: "reserve", path: "/reservations", matchPaths: ["/reservations"], label: "Đặt bàn" });
  if (!input.readOnlyMenu) tabs.push({ key: "my-orders", path: "/session-orders", matchPaths: ["/session-orders"], label: "Đơn của tôi" });
  return tabs;
}

export type ToolbarMode = { callStaff: boolean; tableChip: boolean; cart: boolean };

export function toolbarModeFor(input: { entryKind: "root" | "table"; canOrder: boolean }): ToolbarMode {
  const atTable = input.entryKind === "table";
  return { callStaff: atTable, tableChip: atTable, cart: input.canOrder };
}
```

`call-staff-message.ts`:
```ts
import { CallStaffCooldownError } from "@/services/service-request";

const COOLDOWN_MS = 3 * 60 * 1000; // khớp mig 087
const hhmm = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

export function callStaffMessage(result: { ok: true } | { ok: false; error: unknown }): { text: string; type: "success" | "warning" | "error" } {
  if (result.ok) return { text: "Đã gọi nhân viên, vui lòng chờ trong giây lát", type: "success" };
  if (result.error instanceof CallStaffCooldownError) {
    const retry = result.error.retryAt;
    if (!retry) return { text: "Bạn vừa gọi nhân viên, vui lòng chờ ít phút", type: "warning" };
    return { text: `Bạn vừa gọi lúc ${hhmm(new Date(retry.getTime() - COOLDOWN_MS))}, có thể gọi lại sau ${hhmm(retry)}`, type: "warning" };
  }
  return { text: "Chưa gọi được, kiểm tra mạng rồi thử lại", type: "error" };
}
```

- [ ] **Step 4: Chạy pass** — cùng lệnh → PASS. Nếu `toLocaleTimeString` ra "19:25" kèm ký tự lạ trên Node, so sánh bằng `.replace(/‎/g, "")` trong `hhmm`.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/utils/product-layout.* mini-app/src/utils/nav-sets.* mini-app/src/utils/call-staff-message.*
git commit -m "feat: ham thuan chon luoi/danh sach, bo tab, thong bao goi NV"
```

---

### Task 3: Icon mới + component trình bày (không trạng thái)

**Files:**
- Modify: `scripts/gen-mini-app-icons.cjs` (thêm vào `NAMES`), sinh lại `mini-app/src/components/common/icons.tsx`
- Create: `mini-app/src/components/ui/section-card.tsx`, `section-heading.tsx`, `status-pill.tsx`, `sticky-action-bar.tsx`

**Interfaces:**
- Produces:
  - Icon: `ShoppingCartIcon`, `HeartIcon`, `SearchIcon`, `ChevronLeftIcon`, `PlusIcon` (lucide `plus`), `MinusIcon` (lucide `minus`), `ArrowRightIcon`, `CalendarDaysIcon`. ⚠️ `PlusIcon`/`MinusIcon` trùng tên với `components/common/vectors` — import mới lấy từ `icons`, file nào dùng cả hai thì alias.
  - `SectionCard({ title?, subtitle?, icon?, action?, children, className? })`
  - `SectionHeading({ title, count?, id? })` — `count` hiện "N món"
  - `type PillTone = "success" | "info" | "warning" | "critical" | "neutral"`; `StatusPill({ tone, children })`
  - `StickyActionBar({ variant: "dark" | "primary", children, aboveTabBar: boolean })`

- [ ] **Step 1: Thêm icon** — trong `NAMES` của `scripts/gen-mini-app-icons.cjs` thêm:
```js
  ShoppingCart: 'shopping-cart', Heart: 'heart', Search: 'search', ChevronLeft: 'chevron-left',
  Plus: 'plus', Minus: 'minus', ArrowRight: 'arrow-right', CalendarDays: 'calendar-days',
```
Chạy: `node scripts/gen-mini-app-icons.cjs` → `icons.tsx` có 7 export mới.

- [ ] **Step 2: `section-card.tsx`**
```tsx
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// Khối nội dung trắng bo góc (Stitch m02/m05). Icon nằm trong ô tròn nền màu chủ đạo nhạt.
export default function SectionCard({ title, subtitle, icon, action, children, className }: {
  title?: string; subtitle?: string; icon?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={cn("mx-3 mt-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start gap-3">
          {icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-normal-sb font-bold text-text-primary">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xxsmall text-text-secondary">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
```

- [ ] **Step 3: `section-heading.tsx`**
```tsx
// Tiêu đề nhóm món (Stitch m06): vạch trái màu chủ đạo, chữ in hoa, số món bên phải.
export default function SectionHeading({ title, count, id }: { title: string; count?: number; id?: string }) {
  return (
    <div id={id} className="flex scroll-mt-28 items-center gap-2 px-4 pb-2 pt-5">
      <span className="h-4 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
      <h2 className="min-w-0 flex-1 truncate text-small-m font-bold uppercase tracking-wide text-text-primary">{title}</h2>
      {count !== undefined && <span className="shrink-0 text-xxsmall text-text-secondary">{count} món</span>}
    </div>
  );
}
```

- [ ] **Step 4: `status-pill.tsx`**
```tsx
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type PillTone = "success" | "info" | "warning" | "critical" | "neutral";
const TONE: Record<PillTone, string> = {
  success: "bg-success-bg text-success border-success-border",
  info: "bg-info-bg text-info border-info-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  critical: "bg-critical-bg text-critical border-critical-border",
  neutral: "bg-neutral100 text-text-secondary border-neutral200",
};
const DOT: Record<PillTone, string> = {
  success: "bg-success-dot", info: "bg-info-dot", warning: "bg-warning-dot", critical: "bg-critical-dot", neutral: "bg-neutral400",
};

// Nhãn trạng thái — màu theo Ý NGHĨA, không theo màu quán; luôn có chữ.
export default function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xxsmall font-semibold", TONE[tone])}>
      <span className={cn("size-1.5 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
```
(Nếu `neutral400` không có trong `tokens.js`, dùng `bg-neutral300`.)

- [ ] **Step 5: `sticky-action-bar.tsx`**
```tsx
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

// Thanh hành động dính đáy. Nằm TRONG luồng flex của Layout (không fixed) nên không bao giờ đè
// TabBar; trang không có TabBar thì tự cộng safe-area đáy.
export default function StickyActionBar({ variant, children, aboveTabBar }: { variant: "dark" | "primary"; children: ReactNode; aboveTabBar: boolean }) {
  return (
    <div
      className={cn("shrink-0 px-3 pt-2", variant === "dark" ? "bg-transparent" : "border-t border-neutral100 bg-surface")}
      style={{ paddingBottom: aboveTabBar ? "8px" : "calc(var(--zaui-safe-area-inset-bottom, 0px) + 12px)" }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Type-check** — `cd mini-app && npm run typecheck` → không lỗi mới.

- [ ] **Step 7: Commit**
```bash
git add scripts/gen-mini-app-icons.cjs mini-app/src/components/common/icons.tsx mini-app/src/components/ui/
git commit -m "feat: component trinh bay dung chung cho mini app (Stitch)"
```

---

### Task 4: Thanh công cụ + Gọi NV + Quan tâm OA + trang Tài khoản

**Files:**
- Create: `mini-app/src/hooks/use-oa-follow.ts`, `mini-app/src/components/ui/call-staff-button.tsx`, `mini-app/src/components/ui/app-toolbar.tsx`, `mini-app/src/pages/account/index.tsx`
- Modify: `mini-app/src/pages/store-info/index.tsx` (dùng `useOaFollow`), `mini-app/src/router.tsx` (route `/account`), `mini-app/src/css/app.scss` (keyframe chuông)

**Interfaces:**
- Consumes: `toolbarModeFor`, `callStaffMessage` (Task 2); `useCallStaff` (`services/order/order.mutations.ts`); icon Task 3.
- Produces:
  - `useOaFollow(): { available: boolean; connected: boolean; follow: () => Promise<void>; pending: boolean }`
  - `CallStaffButton({ tableId }: { tableId: string })`
  - `AppToolbar({ title, back, mode, cartCount }: { title?: string; back?: boolean; mode: ToolbarMode; cartCount: number })`

- [ ] **Step 1: `use-oa-follow.ts`** — chuyển nguyên logic khoá localStorage của store-info sang hook (giữ key `mevo_oa_connected_v2_<storeId>` để khách đã quan tâm không bị hỏi lại):
```ts
import { useState } from "react";
import { followOA } from "zmp-sdk";
import { useAppStore } from "@/stores/app.store";

// Chỉ đánh dấu "đã quan tâm" khi followOA THÀNH CÔNG (bài học 2026-07-06: cờ cũ set cả khi
// khách từ chối nên CTA biến mất vĩnh viễn).
export function useOaFollow() {
  const { storeId, zaloOaId } = useAppStore();
  const key = storeId ? `mevo_oa_connected_v2_${storeId}` : "";
  const [connected, setConnected] = useState(() => !!key && !!localStorage.getItem(key));
  const [pending, setPending] = useState(false);
  const follow = async () => {
    if (!zaloOaId || !key || pending) return;
    setPending(true);
    try {
      await followOA({ id: zaloOaId });
      localStorage.setItem(key, "1");
      setConnected(true);
    } catch {
      /* khách từ chối / ngoài Zalo — giữ nút để bấm lại */
    } finally {
      setPending(false);
    }
  };
  return { available: !!zaloOaId, connected, follow, pending };
}
```
Trong `store-info/index.tsx`: thay `CONNECTED_KEY`/`isConnected`/`setIsConnected` bằng `const oa = useOaFollow()`; `handleGranted(followed)` gọi `localStorage` cũ → bỏ, dùng `oa.connected`. Giữ nguyên `PermissionSheet` và sessionStorage của sheet.

- [ ] **Step 2: Keyframe chuông** — cuối `css/app.scss`:
```scss
// Chuông nút Gọi NV lắc nhẹ mỗi 3 giây; tắt hẳn khi người dùng bật giảm chuyển động.
@keyframes mevo-bell-ring {
  0%, 84%, 100% { transform: rotate(0); }
  88% { transform: rotate(14deg); }
  92% { transform: rotate(-12deg); }
  96% { transform: rotate(8deg); }
}
.mevo-bell { transform-origin: 50% 10%; animation: mevo-bell-ring 3s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .mevo-bell { animation: none; } }
```

- [ ] **Step 3: `call-staff-button.tsx`**
```tsx
import { useSnackbar } from "zmp-ui";
import { BellIcon } from "@/components/common/icons";
import { useCallStaff } from "@/services/order/order.mutations";
import { callStaffMessage } from "@/utils/call-staff-message";

// Một loại yêu cầu duy nhất (spec Q5). Chặn 3 phút là việc của SERVER (mig 087);
// client chỉ khoá nút trong lúc đang gửi và hiện đúng câu server trả.
export default function CallStaffButton({ tableId }: { tableId: string }) {
  const { mutate, isPending } = useCallStaff();
  const { openSnackbar } = useSnackbar();
  const call = () =>
    mutate({ tableId }, {
      onSuccess: () => openSnackbar(callStaffMessage({ ok: true })),
      onError: (error) => openSnackbar(callStaffMessage({ ok: false, error })),
    });
  return (
    <button
      type="button"
      onClick={call}
      disabled={isPending}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-critical px-3.5 text-small-m font-bold text-white shadow-sm active:opacity-80 disabled:opacity-60"
    >
      <BellIcon className="mevo-bell size-4" />
      {isPending ? "Đang gọi…" : "Gọi NV"}
    </button>
  );
}
```
Nếu `useCallStaff` khai báo kiểu `ServiceRequest` có thêm field ngoài `tableId`, truyền đúng như `pages/menu/index.tsx` đang truyền (`{ tableId }`).

- [ ] **Step 4: `app-toolbar.tsx`**
```tsx
import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon, HeartIcon, ShoppingCartIcon, UserIcon, UtensilsIcon } from "@/components/common/icons";
import { useAppStore } from "@/stores/app.store";
import { useOaFollow } from "@/hooks/use-oa-follow";
import type { ToolbarMode } from "@/utils/nav-sets";
import { cn } from "@/utils/cn";
import CallStaffButton from "./call-staff-button";

const ZALO_CAPSULE_GAP = 96; // px — chỗ Zalo tự vẽ nút "··· ⊗" ở góc phải

// Thanh công cụ m06–m08 cho MỌI màn (spec Q3). Hàng 1: quay lại + tiêu đề. Hàng 2: logo quán
// (→ Thông tin nhà hàng) · Gọi NV · chip bàn · Quan tâm OA · giỏ · tài khoản.
export default function AppToolbar({ title, back, mode, cartCount }: { title?: string; back?: boolean; mode: ToolbarMode; cartCount: number }) {
  const navigate = useNavigate();
  const { storeName, storeLogoUrl, tableId, tableNumber } = useAppStore();
  const oa = useOaFollow();
  const initials = (storeName || "M").trim().split(/\s+/).filter(Boolean);
  const mark = (initials.length >= 2 ? initials[0][0] + initials[initials.length - 1][0] : initials[0]?.[0] ?? "M").toUpperCase();

  return (
    <header className="shrink-0 bg-surface shadow-[0_1px_0_rgba(15,23,42,0.06)]" style={{ paddingTop: "var(--zaui-safe-area-inset-top, 0px)" }}>
      <div className="flex h-11 items-center gap-1 pl-2" style={{ paddingRight: ZALO_CAPSULE_GAP }}>
        {back ? (
          <button type="button" aria-label="Quay lại" onClick={() => navigate(-1)} className="grid size-9 place-items-center rounded-full active:bg-neutral100">
            <ChevronLeftIcon className="size-5 text-text-primary" />
          </button>
        ) : <span className="w-2" />}
        <div className="min-w-0">
          <p className="truncate text-normal-sb font-bold leading-tight text-text-primary">{title || storeName || "MEVO"}</p>
          {title && storeName && <p className="truncate text-xxxsmall leading-tight text-text-secondary">{storeName}</p>}
        </div>
      </div>
      <div className="flex h-12 items-center gap-2 px-3 pb-2">
        <button type="button" aria-label="Thông tin nhà hàng" onClick={() => navigate("/store-info")} className="relative shrink-0">
          {storeLogoUrl ? (
            <img src={storeLogoUrl} alt="" className="size-9 rounded-full object-cover ring-2 ring-primary/20" draggable={false} />
          ) : (
            <span className="grid size-9 place-items-center rounded-full bg-primary text-small-m font-bold text-white">{mark || <UtensilsIcon className="size-4" />}</span>
          )}
        </button>
        {mode.callStaff && tableId && <CallStaffButton tableId={tableId} />}
        {mode.tableChip && tableNumber && (
          <span className="inline-flex h-8 min-w-0 items-center truncate rounded-full bg-neutral100 px-3 text-small-m font-semibold text-text-primary">{tableNumber}</span>
        )}
        <span className="flex-1" />
        {oa.available && (
          <button
            type="button"
            aria-label={oa.connected ? "Đã quan tâm quán" : "Quan tâm quán trên Zalo"}
            onClick={() => void oa.follow()}
            disabled={oa.connected || oa.pending}
            className={cn("inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xxsmall font-semibold", oa.connected ? "bg-primary/10 text-primary" : "border border-primary/40 text-primary active:bg-primary/10")}
          >
            <HeartIcon className={cn("size-4", oa.connected && "fill-current")} />
            {oa.connected ? "Đã quan tâm" : "Quan tâm"}
          </button>
        )}
        {mode.cart && (
          <button type="button" aria-label={`Giỏ hàng, ${cartCount} món`} onClick={() => navigate("/checkout")} className="relative grid size-9 place-items-center rounded-full active:bg-neutral100">
            <ShoppingCartIcon className="size-5 text-text-primary" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-xxxsmall font-bold text-white">{cartCount > 9 ? "9+" : cartCount}</span>
            )}
          </button>
        )}
        <button type="button" aria-label="Tài khoản" onClick={() => navigate("/account")} className="grid size-9 place-items-center rounded-full active:bg-neutral100">
          <UserIcon className="size-5 text-text-primary" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Trang Tài khoản** — `pages/account/index.tsx`:
```tsx
import { UserIcon } from "@/components/common/icons";

// Khung chờ (spec Q7): sau này là nơi lấy thông tin Zalo, điểm tích luỹ, mã giảm giá.
export default function AccountPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><UserIcon className="size-8" /></span>
      <p className="text-large-m font-bold text-text-primary">Tài khoản</p>
      <p className="text-small text-text-secondary">Cập nhật trong phiên bản sắp tới</p>
    </div>
  );
}
```
`router.tsx` thêm cạnh `/store-info`:
```tsx
{ path: "/account", element: <AccountPage />, handle: { title: "Tài khoản", back: true, hideBottomTabs: true, hideCart: true } satisfies RouteHandle },
```

- [ ] **Step 6: Type-check** — `npm run typecheck` → sạch. Chạy `npx vitest run` → toàn bộ test cũ vẫn pass.

- [ ] **Step 7: Commit**
```bash
git add mini-app/src/hooks mini-app/src/components/ui mini-app/src/pages/account mini-app/src/pages/store-info mini-app/src/router.tsx mini-app/src/css/app.scss
git commit -m "feat: thanh cong cu mini app (goi NV, quan tam OA, tai khoan)"
```

---

### Task 5: TabBar + thanh giỏ + Layout

**Files:**
- Create: `mini-app/src/components/ui/tab-bar.tsx`, `mini-app/src/components/ui/sticky-cart-bar.tsx`
- Modify: `mini-app/src/components/layout/layout.tsx`, `mini-app/src/router.tsx` (`/` và `/menu` bỏ `hideHeader`)
- Delete (nếu không còn import): `components/layout/header.tsx`, `components/layout/bottom-tabs.tsx`, `components/common/cart-float-button.tsx`

**Interfaces:**
- Consumes: `tabsFor`, `toolbarModeFor` (Task 2); `AppToolbar` (Task 4); `StickyActionBar` (Task 3); `rootCapabilities`, `canOrderInEntry` (`utils/entry-context`); `getBookingAccesses` (`services/reservation/reservation-storage`); `calculateCartTotal` (`utils/cart`).
- Produces: `TabBar({ tabs }: { tabs: TabDef[] })`; `StickyCartBar({ count, total, tableLabel, aboveTabBar })`.

- [ ] **Step 1: `tab-bar.tsx`** — icon theo `key`:
```tsx
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDaysIcon, ClipboardListIcon, UtensilsIcon } from "@/components/common/icons";
import type { TabDef, TabKey } from "@/utils/nav-sets";
import { cn } from "@/utils/cn";

const ICON: Record<TabKey, (p: { className: string }) => JSX.Element> = {
  home: (p) => <UtensilsIcon {...p} />,
  menu: (p) => <UtensilsIcon {...p} />,
  reserve: (p) => <CalendarDaysIcon {...p} />,
  "my-orders": (p) => <ClipboardListIcon {...p} />,
  session: (p) => <ClipboardListIcon {...p} />,
};

export default function TabBar({ tabs }: { tabs: TabDef[] }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav className="flex shrink-0 border-t border-neutral100 bg-surface" style={{ paddingBottom: "var(--zaui-safe-area-inset-bottom, 0px)" }}>
      {tabs.map((tab) => {
        const active = tab.matchPaths.includes(pathname);
        return (
          <button key={tab.key} type="button" onClick={() => navigate(tab.path)} aria-current={active ? "page" : undefined}
            className="relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2">
            {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
            {ICON[tab.key]({ className: cn("size-6", active ? "text-primary" : "text-neutral300") })}
            <span className={cn("text-xxsmall font-semibold", active ? "text-primary" : "text-text-secondary")}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: `sticky-cart-bar.tsx`**
```tsx
import { useNavigate } from "react-router-dom";
import { ArrowRightIcon, ShoppingCartIcon } from "@/components/common/icons";
import { formatCurrency } from "@/utils/format";
import StickyActionBar from "./sticky-action-bar";

// Thanh giỏ tối kiểu Stitch m06: "N món đã chọn · Bàn 09 · tổng" + Xem đơn.
export default function StickyCartBar({ count, total, tableLabel, aboveTabBar }: { count: number; total: number; tableLabel?: string; aboveTabBar: boolean }) {
  const navigate = useNavigate();
  if (count === 0) return null;
  return (
    <StickyActionBar variant="dark" aboveTabBar={aboveTabBar}>
      <button type="button" onClick={() => navigate("/checkout")} className="flex w-full items-center gap-3 rounded-2xl bg-neutral900 px-3 py-2.5 text-left text-white shadow-lg active:opacity-90">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
          <ShoppingCartIcon className="size-5" />
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-xxxsmall font-bold">{count > 99 ? "99+" : count}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small-m font-semibold">{count} món đã chọn{tableLabel ? ` · ${tableLabel}` : ""}</span>
          <span className="block text-normal-sb font-bold">{formatCurrency(total)}đ</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-small-m font-bold">Xem đơn<ArrowRightIcon className="size-4" /></span>
      </button>
    </StickyActionBar>
  );
}
```
(`neutral900` có trong `tokens.js` — dùng `base.colors.neutral900`; nếu Tailwind không sinh class đó, dùng `bg-[#0F172A]`.)

- [ ] **Step 3: Viết lại `layout.tsx`**
```tsx
import { Outlet, useMatches } from "react-router-dom";
import AppToolbar from "@/components/ui/app-toolbar";
import TabBar from "@/components/ui/tab-bar";
import StickyCartBar from "@/components/ui/sticky-cart-bar";
import { useCartStore } from "@/stores/cart.store";
import { useAppStore } from "@/stores/app.store";
import { canOrderInEntry, rootCapabilities } from "@/utils/entry-context";
import { tabsFor, toolbarModeFor } from "@/utils/nav-sets";
import { calculateCartTotal } from "@/utils/cart";
import { getBookingAccesses } from "@/services/reservation/reservation-storage";
import type { RouteHandle } from "@/types/router.types";

export default function Layout() {
  const matches = useMatches();
  const handle = matches[matches.length - 1].handle as RouteHandle | undefined;
  const { hideBottomTabs, hideCart, hideHeader } = handle ?? {};
  const { items, totalItems } = useCartStore();
  const { workflow, entryContext, tableId, tableNumber, storeId } = useAppStore();

  const hasVerifiedTable = entryContext.kind === "root" || tableId === entryContext.tableId;
  const canOrder = workflow !== null && hasVerifiedTable && canOrderInEntry(workflow, entryContext);
  const readOnlyMenu = entryContext.kind === "root" && (!workflow || rootCapabilities(workflow).readOnlyMenu);
  const showReservations = entryContext.kind === "root" && (workflow?.reservationsEnabled === true || getBookingAccesses(storeId).length > 0);
  const tabs = tabsFor({ entryKind: entryContext.kind, readOnlyMenu, showReservations });
  const showTabs = !hideBottomTabs && tabs.length > 1;

  return (
    <div className="relative flex h-screen w-screen flex-col bg-background">
      {!hideHeader && (
        <AppToolbar title={handle?.title} back={handle?.back} mode={toolbarModeFor({ entryKind: entryContext.kind, canOrder })} cartCount={totalItems} />
      )}
      <main className="relative min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      {!hideCart && canOrder && (
        <StickyCartBar count={totalItems} total={calculateCartTotal(items)} tableLabel={entryContext.kind === "table" ? tableNumber : undefined} aboveTabBar={showTabs} />
      )}
      {showTabs && <TabBar tabs={tabs} />}
    </div>
  );
}
```

- [ ] **Step 4: Router** — `/` và `/menu`: bỏ `hideHeader: true` (thực đơn giờ dùng thanh công cụ chung). Các route khác giữ handle; `/session-orders` và `/store-info` **vẫn `hideHeader: true`** tới MA-2 (chúng còn header riêng).

- [ ] **Step 5: Xoá file cũ** — `grep -rn "layout/header\|bottom-tabs\|cart-float-button" mini-app/src` → nếu rỗng thì `git rm` 3 file.

- [ ] **Step 6: Type-check + test** — `npm run typecheck && npx vitest run` → sạch.

- [ ] **Step 7: Commit**
```bash
git add -A mini-app/src/components mini-app/src/router.tsx
git commit -m "feat: layout mini app moi - thanh cong cu, 2 bo tab, thanh gio"
```

---

### Task 6: Thẻ món + chip danh mục + Thực đơn m06

**Files:**
- Create: `mini-app/src/components/ui/product-card.tsx`, `mini-app/src/components/ui/category-chips.tsx`
- Modify: `mini-app/src/pages/menu/index.tsx`

**Interfaces:**
- Consumes: `pickProductLayout` (Task 2); `SectionHeading` (Task 3); `Product` (`types/product.types`).
- Produces:
  - `ProductCard({ product, layout, canOrder, count, onAdd, onDecrease }: { product: Product; layout: "grid" | "list"; canOrder: boolean; count: number; onAdd: () => void; onDecrease: () => void })`
  - `CategoryChips({ items, activeId, onSelect }: { items: { id: string; name: string }[]; activeId: string; onSelect: (id: string) => void })`

- [ ] **Step 1: `product-card.tsx`** — giữ nguyên các quy tắc hiện có của `MenuItemRow` (`soldOutByVariants` theo `hasVariantGroup` đếm thô — bẫy mig 042; "Từ " trước giá khi có biến thể; món có tuỳ chọn không cho − trên thẻ):
```tsx
import { useState } from "react";
import { MinusIcon, PlusIcon, UtensilsIcon } from "@/components/common/icons";
import type { Product } from "@/types/product.types";
import { formatCurrency } from "@/utils/format";
import { cn } from "@/utils/cn";

export default function ProductCard({ product, layout, canOrder, count, onAdd, onDecrease }: {
  product: Product; layout: "grid" | "list"; canOrder: boolean; count: number; onAdd: () => void; onDecrease: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasVariants = product.variants.length > 0;
  // Đếm THÔ (hasVariantGroup) — món tắt hết lựa chọn phải là "Tạm hết", không bán giá cũ (bẫy mig 042).
  const soldOutByVariants = product.hasVariantGroup && !hasVariants;
  const available = product.isAvailable && !soldOutByVariants;
  const hasOptions = hasVariants || product.toppings.length > 0;
  const price = `${hasVariants || soldOutByVariants ? "Từ " : ""}${formatCurrency(product.price)}đ`;
  const image = product.image && !imageFailed ? product.image : null;

  const control = available && canOrder ? (
    !hasOptions && count > 0 ? (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 p-0.5">
        <button type="button" aria-label="Giảm" onClick={onDecrease} className="grid size-7 place-items-center rounded-full bg-surface text-primary active:scale-90"><MinusIcon className="size-3.5" /></button>
        <span className="min-w-5 text-center text-small-m font-bold text-text-primary">{count}</span>
        <button type="button" aria-label="Thêm" onClick={onAdd} className="grid size-7 place-items-center rounded-full bg-primary text-white active:scale-90"><PlusIcon className="size-3.5" /></button>
      </span>
    ) : (
      <button type="button" aria-label={`Thêm ${product.name}`} onClick={onAdd} className="relative grid size-8 shrink-0 place-items-center rounded-full bg-primary text-white shadow-sm active:scale-90">
        <PlusIcon className="size-4" />
        {hasOptions && count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-neutral900 px-1 text-xxxsmall font-bold">{count}</span>}
      </button>
    )
  ) : !available ? <span className="shrink-0 rounded-full bg-neutral100 px-2 py-0.5 text-xxxsmall font-semibold text-text-secondary">Tạm hết</span> : null;

  if (layout === "grid") {
    return (
      <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]", !available && "opacity-60")}>
        <div className="aspect-[4/3] w-full bg-primary/5">
          {image ? <img src={image} alt={product.name} onError={() => setImageFailed(true)} className="h-full w-full object-cover" draggable={false} />
            : <div className="grid h-full place-items-center text-primary/40"><UtensilsIcon className="size-8" /></div>}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2.5">
          <p className="line-clamp-2 text-small-m font-semibold text-text-primary">{product.name}</p>
          <div className="mt-auto flex items-center justify-between gap-2">
            <span className="whitespace-nowrap text-small-m font-bold text-primary">{price}</span>
            {control}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", !available && "opacity-60")}>
      {image && <img src={image} alt={product.name} onError={() => setImageFailed(true)} className="size-16 shrink-0 rounded-xl object-cover" draggable={false} />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-normal-sb font-semibold text-text-primary">{product.name}</p>
        {product.description && <p className="mt-0.5 line-clamp-2 text-xxsmall text-text-secondary">{product.description}</p>}
        <p className="mt-1 whitespace-nowrap text-small-m font-bold text-primary">{price}</p>
      </div>
      {control}
    </div>
  );
}
```

- [ ] **Step 2: `category-chips.tsx`**
```tsx
import { useEffect, useRef } from "react";
import { cn } from "@/utils/cn";

// Chip danh mục cuộn ngang (m06). Chip đang chọn tự cuộn vào giữa tầm nhìn.
export default function CategoryChips({ items, activeId, onSelect }: { items: { id: string; name: string }[]; activeId: string; onSelect: (id: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => { refs.current[activeId]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [activeId]);
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2">
      {items.map((c) => (
        <button key={c.id} ref={(el) => { refs.current[c.id] = el; }} type="button" onClick={() => onSelect(c.id)}
          className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xxsmall font-bold uppercase tracking-wide transition-colors",
            activeId === c.id ? "bg-primary text-white shadow-sm" : "border border-neutral200 bg-surface text-text-secondary")}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Sửa `pages/menu/index.tsx`**
  1. Xoá khối header quán riêng (dòng "Header quán + bàn", `div` có `paddingTop: calc(var(--zaui-safe-area-inset-top…)`) — thanh công cụ chung đã có logo + bàn. Giữ `TakeawayBanner`? → **xoá** (thanh công cụ + TabBar đã nói lối vào); giữ `TakeawayBannerCard` (ảnh banner thật).
  2. Giữ nguyên `ClosedBanner`, `OrderingUnavailableBanner`, `TableLockedBanner`, `TableReservedBanner`, `SessionBar`, `OptionSheet`, `UnpaidOrderPrompt` và toàn bộ handler (`handleAdd`, `handleConfirmOptions`, `handleDecrease`, `handleCallStaff` cho 2 banner khoá bàn).
  3. Thêm ô tìm món (lọc theo tên, không dấu không phân biệt hoa thường) phía trên chip:
```tsx
const [query, setQuery] = useState("");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const visibleMenu = query.trim()
  ? menu.map((c) => ({ ...c, products: c.products.filter((p) => fold(p.name).includes(fold(query.trim()))) })).filter((c) => c.products.length > 0)
  : menu;
```
```tsx
<div className="sticky top-0 z-10 shrink-0 bg-background/95 backdrop-blur">
  <label className="mx-3 mt-2 flex h-10 items-center gap-2 rounded-full border border-neutral200 bg-surface px-3">
    <SearchIcon className="size-4 text-text-secondary" />
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm món…" className="min-w-0 flex-1 bg-transparent text-small outline-none" />
  </label>
  <CategoryChips items={visibleMenu.map((c) => ({ id: c.id, name: c.name }))} activeId={activeCategoryId} onSelect={(id) => { setActiveCategoryId(id); scrollToId(id); }} />
</div>
```
     Tìm không ra món nào → `<p className="px-6 py-10 text-center text-small text-text-secondary">Không tìm thấy món "{query}"</p>`.
  4. Thay `CategorySection`/`MenuItemRow` bằng:
```tsx
function CategorySection({ category, canOrder, getCount, onAdd, onDecrease }: { category: CategoryWithProducts; canOrder: boolean; getCount: (id: string) => number; onAdd: (p: Product) => void; onDecrease: (p: Product) => void }) {
  const layout = pickProductLayout(category.products);
  return (
    <section>
      <SectionHeading id={category.id} title={category.name} count={category.products.length} />
      {category.products.length === 0 ? (
        <p className="px-4 py-6 text-center text-small text-text-secondary">Chưa có món trong danh mục này</p>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-3 px-3">
          {category.products.map((p) => <ProductCard key={p.id} product={p} layout="grid" canOrder={canOrder} count={getCount(p.id)} onAdd={() => onAdd(p)} onDecrease={() => onDecrease(p)} />)}
        </div>
      ) : (
        <div className="mx-3 divide-y divide-neutral100 overflow-hidden rounded-2xl bg-surface">
          {category.products.map((p) => <ProductCard key={p.id} product={p} layout="list" canOrder={canOrder} count={getCount(p.id)} onAdd={() => onAdd(p)} onDecrease={() => onDecrease(p)} />)}
        </div>
      )}
    </section>
  );
}
```
  5. Phần cuộn: trang không tự `overflow-y-auto` nữa (Layout `<main>` đã cuộn) — đổi `onScroll` dò danh mục sang `IntersectionObserver` trên các `SectionHeading` (`rootMargin: "-120px 0px -70% 0px"`), cập nhật `activeCategoryId`.
  6. `MenuSkeleton`: đổi khung chờ cho khớp (ô tìm + 3 chip + 4 dòng danh sách), bỏ phần header riêng.
  7. Xoá import không dùng (`MinusIcon`/`PlusIcon` từ `vectors`, `cn` nếu hết dùng).

- [ ] **Step 4: Type-check + test** — `npm run typecheck && npx vitest run` → sạch.

- [ ] **Step 5: Commit**
```bash
git add mini-app/src/components/ui mini-app/src/pages/menu
git commit -m "feat: thuc don tai ban theo Stitch m06 (luoi/danh sach theo anh)"
```

---

### Task 7: Giỏ hàng theo ngôn ngữ mới

**Files:**
- Modify: `mini-app/src/pages/checkout/index.tsx` (chỉ phần `return (...)` dòng ~441–748 và `PaymentOption`)

**Interfaces:**
- Consumes: `SectionCard`, `StickyActionBar` (Task 3). Không đổi state/handler nào.

- [ ] **Step 1: Thay khung** — giữ nguyên mọi biến/handler; đổi trình bày:
  - `div` ngoài: `flex h-full flex-col bg-background`; vùng cuộn `flex-1 overflow-y-auto pb-4` (bỏ `pb-32` vì thanh đáy giờ nằm trong luồng flex).
  - Thẻ bàn (`!isTakeaway`) → `<SectionCard icon={<ArmchairIcon />} title={tableNumber || "Bàn không xác định"} subtitle="Món sẽ được gửi cho bàn này" />`.
  - Form mang về → `<SectionCard title="Thông tin nhận món" icon={takeawayType === "pickup" ? <FootprintsIcon /> : <BikeIcon />} className={lockedClass}>…form cũ giữ nguyên…</SectionCard>`; ô input đổi `rounded-xl border-neutral200 bg-neutral50 px-3 py-3`.
  - "Món đã chọn" → `<SectionCard title={`Món đã chọn (${cartItems.reduce((n, i) => n + i.quantity, 0)})`} icon={<UtensilsIcon />}>`; mỗi dòng: ảnh (nếu có, `size-14 rounded-xl`) + tên `line-clamp-2` + loại/topping + `formatCurrency(calculateCartItemPrice(item))đ` màu `primary` + `QuantityStepper` giữ nguyên props.
  - Ghi chú → `<SectionCard title="Ghi chú cho bếp" icon={<FileTextIcon />} className={lockedClass}><NoteInput … giữ nguyên props, bỏ label (đã có tiêu đề) /></SectionCard>`. Nếu `NoteInput` bắt buộc `label` thì truyền `label=""`.
  - Thanh toán → `<SectionCard title="Thanh toán" icon={<CreditCardIcon />}>`; `PaymentOption` đổi viền chọn `border-primary bg-primary/5`, ô tròn chọn giữ.
  - Voucher giữ nguyên component.
  - Tóm tắt tiền → `SectionCard` không tiêu đề: "Tạm tính món", "Giảm giá" (success), đường kẻ, "Tổng cộng" chữ to `primary`.
  - Thanh đáy: thay `div fixed bottom-0 …` bằng `<StickyActionBar variant="primary" aboveTabBar={false}>…nội dung cũ (cả nhánh isLocked)…</StickyActionBar>`; nút chính `h-12 w-full rounded-2xl bg-primary text-normal-sb font-bold text-white shadow`.
- [ ] **Step 2: Hộp thoại "Món này đã có trong bill"** — giữ logic, đổi bo `rounded-3xl`, nút chính `bg-primary`.
- [ ] **Step 3: Type-check + test** — `npm run typecheck && npx vitest run` → sạch.
- [ ] **Step 4: Commit**
```bash
git add mini-app/src/pages/checkout
git commit -m "feat: gio hang mini app theo ngon ngu Stitch"
```

---

### Task 8: Kiểm bằng ảnh chụp + checklist

**Files:**
- Create: `docs/testing/mini-app-stitch/MA-1.md`; Modify: `TESTING.md` (thêm mục MA-1, "chờ test")
- Scratchpad: script Playwright (không commit)

- [ ] **Step 1: Đưa nhánh vào worktree Bảo Lương** — `cd mini-app-instances/bia-lau-bao-luong && git merge feat/mini-app-stitch` (nhánh local, chưa push). Không đụng `.env`/`app-config.json`.
- [ ] **Step 2: Chạy dev** — `cd mini-app-instances/bia-lau-bao-luong/mini-app && npm run dev` (nền), mở `http://localhost:5173/?table=<id bàn Bảo Lương>` và `http://localhost:5173/` (lối thường). Lấy id bàn bằng SQL `select id, table_number from tables where store_id = (select id from stores where slug='bia-lau-bao-luong') order by table_number limit 1`.
- [ ] **Step 3: Chụp khổ 360 và 390** (Playwright, `deviceScaleFactor: 2`): thực đơn ở bàn (chưa có món / có 2 món), giỏ hàng, lối thường, trang Tài khoản; bấm Gọi NV 2 lần liên tiếp → lần 2 thấy thông báo "Bạn vừa gọi lúc…". Kiểm: không cuộn ngang (`scrollWidth <= innerWidth`), thanh giỏ không đè TabBar, góc phải hàng 1 trống, tên món dài cắt 2 dòng (Review Focus #4 — thêm tạm 1 món tên 80 ký tự giá 1.250.000đ vào dữ liệu trả về bằng `page.route` chặn request menu, không sửa DB).
- [ ] **Step 4: Lặp Step 2–3 với Pubu** (`mini-app-instances/pho-ga-pubu`) — thực đơn phải ra **lưới 2 cột** (Pubu 16/17 món có ảnh).
- [ ] **Step 5: Viết `docs/testing/mini-app-stitch/MA-1.md`** gồm: Đã làm · Cố ý chưa làm (Đơn gọi/Thông tin nhà hàng giữ header cũ tới MA-2; chấm báo "còn lượt chờ duyệt" trên tab Đơn gọi làm ở MA-2 vì cần dữ liệu lượt gọi; Trang chủ/Đặt bàn tới MA-3) · cách chạy `npm run dev` · bài test đánh số:
  1. QR bàn Bảo Lương: thanh công cụ 2 hàng, hàng 1 góc phải trống; hàng 2 có logo/chữ viết tắt, Gọi NV đỏ chuông lắc, chip bàn, Quan tâm, giỏ, tài khoản.
  2. Bấm Gọi NV → "Đã gọi nhân viên…"; POS hiện thẻ gọi. Bấm lại ngay → "Bạn vừa gọi lúc HH:MM, có thể gọi lại sau HH:MM". Thu ngân bấm xử lý xong rồi khách gọi lại trong 3 phút → vẫn bị chặn. Sau 3 phút gọi được.
  3. Bấm logo → trang Thông tin nhà hàng. Bấm tài khoản → "Cập nhật trong phiên bản sắp tới".
  4. Bấm Quan tâm → hộp follow OA của Zalo; quan tâm xong nút thành "Đã quan tâm" (chỉ thử được trong Zalo; ở `npm run dev` nút bấm không có tác dụng là đúng).
  5. Thực đơn Bảo Lương ra danh sách (không ô ảnh trống); tiêu đề nhóm có vạch màu chủ đạo + "N món"; chip danh mục dính đầu, cuộn tới đâu sáng tới đó; tìm "bia" lọc đúng; tìm từ không có → "Không tìm thấy món".
  6. Thêm món thường → nút thành [− 1 +]; món nhiều loại → mở bảng chọn; món tắt hết loại → "Tạm hết".
  7. Thanh giỏ tối: "N món đã chọn · Bàn 09 · tổng" + Xem đơn, nằm trên thanh tab, không đè.
  8. Thanh tab ở bàn chỉ còn Thực đơn · Đơn gọi. Mở thường: Trang chủ · Đặt bàn (Bảo Lương), không có Gọi NV/chip bàn/giỏ/nút +.
  9. Giỏ hàng: các khối thẻ mới; sửa số lượng, ghi chú, gửi món chạy như cũ; quán đóng cửa thì nút khoá + dòng báo.
  10. Pubu: thực đơn lưới 2 cột ảnh; đặt mang về + thanh toán chạy như cũ.
  11. Đổi Màu chủ đạo trong `/admin` settings → mở lại app thấy nút, chip, giá, vạch đổi theo (Gọi NV vẫn đỏ).
- [ ] **Step 6: Commit** — `git add docs/testing/mini-app-stitch/MA-1.md TESTING.md && git commit -m "docs: checklist MA-1 mini app Stitch"`
- [ ] **Step 7: DỪNG** — báo anh Tú test theo `docs/testing/mini-app-stitch/MA-1.md`, chờ `MA-1 PASS` (quy tắc CLAUDE.md). Không `zmp deploy` ở bước này.
