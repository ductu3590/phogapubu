# Trang Tài khoản Mini App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến `/account` của Mini App thành trang hồ sơ + quyền riêng tư: tên/ảnh Zalo, lấy SĐT thật từ Zalo (dự phòng nhập tay), xoá thông tin cá nhân trên máy, điều khoản.

**Architecture:** Hồ sơ nằm DUY NHẤT trên máy khách, dùng lại `ReservationProfile` (localStorage `mevo_reservation_profile:<storeId>`). SĐT lấy qua `getPhoneNumber()` → edge function mới `zalo-phone` đổi token ra số bằng `store_zalo_configs.zalo_app_secret_key` của đúng quán, KHÔNG ghi DB. Logic thuần (gộp hồ sơ, xoá dữ liệu, map lỗi, handler edge) tách file riêng để test bằng vitest node.

**Tech Stack:** React 18 + TypeScript + zmp-sdk 2.49 + zmp-ui (snackbar) + Tailwind; Supabase Edge Function (Deno); vitest 4 (node).

**Spec:** `docs/superpowers/specs/2026-10-09-mini-app-account-page-design.md`

## Global Constraints

- Không migration, không ghi DB ở bất kỳ đâu trong tính năng này.
- Edge function KHÔNG log số điện thoại, token, access token, secret.
- Text UI tiếng Việt; comment tiếng Việt cho logic phức tạp.
- SĐT lưu dạng `0xxxxxxxxx` — luôn đi qua `normalizeVnPhone` (`src/utils/booking-validation.ts`).
- "Xoá thông tin cá nhân" CỐ Ý giữ: `mevo_reservation_access*`, `mevo_device_id`, `mevo_cart`.
- Sửa core ở repo/worktree hiện tại (`mini-app/src`), KHÔNG sửa trong `mini-app-instances/`.
- Mini App vitest chỉ chạy `src/**/*.test.ts`, môi trường node — không test component.
- Commit format `feat:` / `fix:` / `chore:` / `docs:`, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Token SĐT chỉ dùng được 1 lần, hết hạn sau 2 phút** (typings zmp-sdk) → bấm "Lấy số" lần 2 phải gọi lại `getPhoneNumber()` lấy token mới, không cache token. Pin: test Task 3 "mỗi lần gọi lấy token mới".
2. **Zalo trả số dạng `84…`** → phải ra `0…`; số rác → coi là lỗi Zalo, không lưu. Pin: test Task 3 "84 → 0" và "số rác → zalo_error".
3. **Tên khách tự sửa không bị tên Zalo đè** khi mở lại trang. Pin: test Task 1 `mergeProfile` overwriteName=false.
4. **Form mang về đã có dữ liệu khách gõ** không bị hồ sơ đè. Pin: test Task 1 `prefillContact`.
5. **Xoá thông tin không làm mất lịch hẹn / chủ phiên bàn.** Pin: test Task 1 `clearPersonalData` giữ access + device id + cart.

## File Structure

| File | Trách nhiệm |
|---|---|
| `mini-app/src/constants/storage-keys.ts` (mới) | Key `TAKEAWAY_FORM_KEY` dùng chung (checkout + xoá dữ liệu) |
| `mini-app/src/services/reservation/reservation-storage.ts` (sửa) | Thêm `clearReservationProfile` |
| `mini-app/src/utils/account-profile.ts` (mới) | Hàm thuần: `mergeProfile`, `prefillContact`, `formatPhoneDisplay` |
| `mini-app/src/services/account-storage.ts` (mới) | `clearPersonalData` — MỘT chỗ liệt kê dữ liệu cá nhân |
| `supabase/functions/zalo-phone/handler.ts` (mới) | Logic đổi token → số, tiêm deps để test |
| `supabase/functions/zalo-phone/index.ts` (mới) | HTTP entry + CORS + đọc `store_zalo_configs` |
| `mini-app/src/services/zalo-phone.ts` (mới) | Client: SDK → edge function → kết quả có mã lỗi + câu tiếng Việt |
| `mini-app/src/pages/account/index.tsx` (viết lại) | Màn Tài khoản |
| `mini-app/src/pages/checkout/index.tsx` (sửa) | Dùng key chung + điền sẵn từ hồ sơ |
| `docs/testing/account-page/ACC-1.md` (mới) | Checklist test tay |

---

### Task 0: Chuẩn bị môi trường

- [ ] **Step 1:** Worktree này chưa có `node_modules`. Chạy:

```bash
cd mini-app && npm ci && cd ../admin-web && npm ci
```

- [ ] **Step 2:** Xác nhận test hiện có xanh trước khi sửa:

```bash
cd mini-app && npm test && npm run typecheck
```
Expected: tất cả PASS, typecheck 0 lỗi. Nếu typecheck có lỗi sẵn → ghi lại số lỗi làm mốc, không sửa.

---

### Task 1: Hồ sơ trên máy — hàm thuần + xoá dữ liệu cá nhân

**Files:**
- Create: `mini-app/src/constants/storage-keys.ts`
- Modify: `mini-app/src/services/reservation/reservation-storage.ts` (thêm hàm cuối file)
- Create: `mini-app/src/utils/account-profile.ts`
- Create: `mini-app/src/services/account-storage.ts`
- Test: `mini-app/src/utils/account-profile.test.ts`, `mini-app/src/services/account-storage.test.ts`

**Interfaces:**
- Consumes: `ReservationProfile { customerName: string; customerPhone: string }` (`@/types/reservation.types`), `normalizeVnPhone(raw): {ok:true,value}|{ok:false,error}`, `clearBookingDraft(storeId)`.
- Produces:
  - `TAKEAWAY_FORM_KEY = "mevo_takeaway_form"`
  - `clearReservationProfile(storeId: string): void`
  - `mergeProfile(current: ReservationProfile | null, patch: { customerName?: string; customerPhone?: string }, opts: { overwriteName: boolean }): ReservationProfile`
  - `prefillContact<T extends { customerName: string; customerPhone: string }>(form: T, profile: ReservationProfile | null): T`
  - `formatPhoneDisplay(phone: string): string`
  - `clearPersonalData(storeId: string): void`

- [ ] **Step 1: Viết test hàm thuần (fail)** — `mini-app/src/utils/account-profile.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, mergeProfile, prefillContact } from "./account-profile";

describe("mergeProfile", () => {
  it("hồ sơ trống: nhận tên Zalo và chuẩn hoá SĐT 84… về 0…", () => {
    expect(mergeProfile(null, { customerName: " An ", customerPhone: "84912345678" }, { overwriteName: false }))
      .toEqual({ customerName: "An", customerPhone: "0912345678" });
  });

  it("overwriteName=false: KHÔNG đè tên khách đã tự sửa", () => {
    const current = { customerName: "Anh Nam bàn 5", customerPhone: "" };
    expect(mergeProfile(current, { customerName: "Nguyễn Văn Nam" }, { overwriteName: false }).customerName).toBe("Anh Nam bàn 5");
  });

  it("overwriteName=true: đè tên, kể cả xoá trống", () => {
    const current = { customerName: "Cũ", customerPhone: "0912345678" };
    expect(mergeProfile(current, { customerName: "Mới" }, { overwriteName: true }).customerName).toBe("Mới");
    expect(mergeProfile(current, { customerName: "  " }, { overwriteName: true }).customerName).toBe("");
  });

  it("SĐT không hợp lệ: giữ số cũ", () => {
    const current = { customerName: "", customerPhone: "0912345678" };
    expect(mergeProfile(current, { customerPhone: "12345" }, { overwriteName: false }).customerPhone).toBe("0912345678");
  });

  it("patch không có SĐT: giữ SĐT cũ", () => {
    const current = { customerName: "A", customerPhone: "0912345678" };
    expect(mergeProfile(current, { customerName: "B" }, { overwriteName: true }).customerPhone).toBe("0912345678");
  });
});

describe("prefillContact", () => {
  const profile = { customerName: "An", customerPhone: "0912345678" };

  it("ô trống thì điền từ hồ sơ", () => {
    expect(prefillContact({ customerName: "", customerPhone: "", deliveryAddress: "x" }, profile))
      .toEqual({ customerName: "An", customerPhone: "0912345678", deliveryAddress: "x" });
  });

  it("KHÔNG đè dữ liệu khách đã gõ", () => {
    expect(prefillContact({ customerName: "Bình", customerPhone: "0987654321" }, profile))
      .toEqual({ customerName: "Bình", customerPhone: "0987654321" });
  });

  it("không có hồ sơ: trả nguyên form", () => {
    const form = { customerName: "", customerPhone: "" };
    expect(prefillContact(form, null)).toBe(form);
  });
});

describe("formatPhoneDisplay", () => {
  it("nhóm 4-3-3 cho số 10 chữ số", () => expect(formatPhoneDisplay("0912345678")).toBe("0912 345 678"));
  it("chuỗi lạ trả nguyên", () => expect(formatPhoneDisplay("abc")).toBe("abc"));
});
```

- [ ] **Step 2: Viết test xoá dữ liệu (fail)** — `mini-app/src/services/account-storage.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { clearPersonalData } from "./account-storage";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
});

describe("clearPersonalData", () => {
  it("xoá hồ sơ, nháp đặt bàn, form mang về; GIỮ quyền xem lịch hẹn, device id, giỏ hàng, dữ liệu quán khác", () => {
    const keep = [
      "mevo_reservation_access:store-a:r1",
      "mevo_reservation_accesses:store-a",
      "mevo_device_id",
      "mevo_cart",
      "mevo_reservation_profile:store-b",
    ];
    const gone = [
      "mevo_reservation_profile:store-a",
      "mevo_reservation_draft:store-a",
      "mevo_takeaway_form",
    ];
    for (const k of [...keep, ...gone]) storage.set(k, "{}");

    clearPersonalData("store-a");

    for (const k of gone) expect(storage.has(k), k).toBe(false);
    for (const k of keep) expect(storage.has(k), k).toBe(true);
  });

  it("localStorage ném lỗi: không văng ra ngoài", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { removeItem: () => { throw new Error("blocked"); } },
    });
    expect(() => clearPersonalData("store-a")).not.toThrow();
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận fail**

Run: `cd mini-app && npx vitest run src/utils/account-profile.test.ts src/services/account-storage.test.ts`
Expected: FAIL — không tìm thấy module `./account-profile` / `./account-storage`.

- [ ] **Step 4: Viết code**

`mini-app/src/constants/storage-keys.ts`:

```ts
// Key localStorage dùng ở nhiều nơi. Key nào chứa dữ liệu cá nhân thì PHẢI có mặt trong
// clearPersonalData (services/account-storage.ts).
export const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";
```

Thêm cuối `mini-app/src/services/reservation/reservation-storage.ts`:

```ts
export function clearReservationProfile(storeId: string): void {
  try { localStorage.removeItem(key(PROFILE_PREFIX, storeId)); } catch { /* storage không khả dụng */ }
}
```

`mini-app/src/utils/account-profile.ts`:

```ts
import type { ReservationProfile } from "@/types/reservation.types";
import { normalizeVnPhone } from "@/utils/booking-validation";

export type ProfilePatch = { customerName?: string; customerPhone?: string };

const EMPTY: ReservationProfile = { customerName: "", customerPhone: "" };

/**
 * Gộp hồ sơ trên máy (spec 2026-10-09 §5).
 * - Tên: overwriteName=true (khách tự sửa) thì đè, kể cả xoá trống; overwriteName=false (tên Zalo
 *   tự điền) chỉ điền khi hồ sơ CHƯA có tên — không đè tên khách đã tự sửa.
 * - SĐT: chuẩn hoá về 0xxxxxxxxx; số không hợp lệ thì giữ số cũ.
 */
export function mergeProfile(
  current: ReservationProfile | null,
  patch: ProfilePatch,
  opts: { overwriteName: boolean },
): ReservationProfile {
  const base = current ?? EMPTY;
  let customerName = base.customerName;
  if (patch.customerName !== undefined) {
    const name = patch.customerName.trim();
    if (opts.overwriteName) customerName = name;
    else if (!base.customerName.trim() && name) customerName = name;
  }
  let customerPhone = base.customerPhone;
  if (patch.customerPhone !== undefined) {
    const normalized = normalizeVnPhone(patch.customerPhone);
    if (normalized.ok) customerPhone = normalized.value;
  }
  return { customerName, customerPhone };
}

/** Điền ô tên/SĐT còn TRỐNG của một form từ hồ sơ; ô khách đã gõ thì giữ nguyên. */
export function prefillContact<T extends { customerName: string; customerPhone: string }>(
  form: T,
  profile: ReservationProfile | null,
): T {
  if (!profile) return form;
  return {
    ...form,
    customerName: form.customerName || profile.customerName,
    customerPhone: form.customerPhone || profile.customerPhone,
  };
}

/** 0912345678 → "0912 345 678"; chuỗi khác trả nguyên. */
export function formatPhoneDisplay(phone: string): string {
  return /^0\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}
```

`mini-app/src/services/account-storage.ts`:

```ts
import { TAKEAWAY_FORM_KEY } from "@/constants/storage-keys";
import { clearBookingDraft, clearReservationProfile } from "@/services/reservation/reservation-storage";

/**
 * Xoá dữ liệu cá nhân trên máy (spec 2026-10-09 §6) — MỘT chỗ duy nhất liệt kê key cá nhân.
 * CỐ Ý KHÔNG xoá:
 *  - mevo_reservation_access* : xoá là khách không xem / huỷ được lịch hẹn của chính mình
 *  - mevo_device_id            : xoá là mất quyền chủ phiên bàn đang ngồi (mig 039)
 *  - mevo_cart                 : không phải dữ liệu cá nhân, tự hết hạn 6h
 */
export function clearPersonalData(storeId: string): void {
  clearReservationProfile(storeId);
  clearBookingDraft(storeId);
  try { localStorage.removeItem(TAKEAWAY_FORM_KEY); } catch { /* storage không khả dụng */ }
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `cd mini-app && npx vitest run src/utils/account-profile.test.ts src/services/account-storage.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/constants/storage-keys.ts mini-app/src/services/reservation/reservation-storage.ts mini-app/src/utils/account-profile.ts mini-app/src/utils/account-profile.test.ts mini-app/src/services/account-storage.ts mini-app/src/services/account-storage.test.ts
git commit -m "feat: ho so tren may cho trang Tai khoan (gop ho so + xoa du lieu ca nhan)"
```

---

### Task 2: Edge function `zalo-phone`

**Files:**
- Create: `supabase/functions/zalo-phone/handler.ts`
- Create: `supabase/functions/zalo-phone/handler.test.ts`
- Create: `supabase/functions/zalo-phone/index.ts`

**Interfaces:**
- Consumes: bảng `store_zalo_configs(store_id, zalo_app_secret_key, is_enabled)` (mig 021, chỉ service_role).
- Produces (HTTP, Task 3 dùng): `POST /functions/v1/zalo-phone` body `{ storeId, token, accessToken }` →
  - `200 { phone: string }` (số Zalo trả về, dạng thô, thường `84…`)
  - `400 { error: "bad_request" }`
  - `409 { error: "not_configured" }`
  - `502 { error: "zalo_error" }`

- [ ] **Step 1: Viết test (fail)** — `supabase/functions/zalo-phone/handler.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleZaloPhone, ZALO_PHONE_URL } from './handler'

const STORE = '2139c162-9677-4cbd-87e3-d2e1ac22e6e8'
const body = { storeId: STORE, token: 'tok-1', accessToken: 'acc-1' }
const SECRET = 'secret-abc'

function zaloResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function deps(over: Partial<Parameters<typeof handleZaloPhone>[1]> = {}) {
  const logs: string[] = []
  return {
    logs,
    d: {
      loadConfig: vi.fn(async () => ({ secret: SECRET, enabled: true })),
      fetch: vi.fn(async () => zaloResponse({ data: { number: '84912345678' }, error: 0, message: 'Success' })),
      log: (m: string) => { logs.push(m) },
      ...over,
    },
  }
}

describe('zalo-phone handler', () => {
  it.each([
    [null],
    [{}],
    [{ ...body, storeId: 'khong-phai-uuid' }],
    [{ ...body, token: '' }],
    [{ ...body, accessToken: 42 }],
  ])('thiếu/sai input → 400 bad_request, không đọc config: %j', async (input) => {
    const { d } = deps()
    expect(await handleZaloPhone(input as never, d)).toEqual({ status: 400, body: { error: 'bad_request' } })
    expect(d.loadConfig).not.toHaveBeenCalled()
  })

  it.each([
    [null],
    [{ secret: SECRET, enabled: false }],
    [{ secret: '  ', enabled: true }],
    [{ secret: null, enabled: true }],
  ])('quán chưa cấu hình → 409 not_configured, không gọi Zalo: %j', async (config) => {
    const { d } = deps({ loadConfig: vi.fn(async () => config) })
    expect(await handleZaloPhone(body, d)).toEqual({ status: 409, body: { error: 'not_configured' } })
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('thành công → 200 phone, gọi Zalo đúng header', async () => {
    const { d } = deps()
    expect(await handleZaloPhone(body, d)).toEqual({ status: 200, body: { phone: '84912345678' } })
    expect(d.loadConfig).toHaveBeenCalledWith(STORE)
    expect(d.fetch).toHaveBeenCalledWith(ZALO_PHONE_URL, {
      method: 'GET',
      headers: { access_token: 'acc-1', code: 'tok-1', secret_key: SECRET },
    })
  })

  it.each([
    ['Zalo trả error khác 0', zaloResponse({ error: -501, message: 'token expired' })],
    ['thiếu data.number', zaloResponse({ data: {}, error: 0 })],
    ['HTTP 500', zaloResponse({ error: 0, data: { number: '84912345678' } }, 500)],
    ['body không phải JSON', new Response('oops', { status: 200 })],
  ])('%s → 502 zalo_error', async (_name, res) => {
    const { d } = deps({ fetch: vi.fn(async () => res) })
    expect(await handleZaloPhone(body, d)).toEqual({ status: 502, body: { error: 'zalo_error' } })
  })

  it('mạng tới Zalo lỗi → 502 zalo_error', async () => {
    const { d } = deps({ fetch: vi.fn(async () => { throw new Error('ECONNRESET') }) })
    expect(await handleZaloPhone(body, d)).toEqual({ status: 502, body: { error: 'zalo_error' } })
  })

  it('log KHÔNG BAO GIỜ chứa số, token, access token, secret', async () => {
    const cases = [
      deps(),
      deps({ fetch: vi.fn(async () => zaloResponse({ error: -501, data: { number: '84912345678' } })) }),
      deps({ fetch: vi.fn(async () => { throw new Error('tok-1 acc-1') }) }),
    ]
    for (const { d, logs } of cases) {
      await handleZaloPhone(body, d)
      for (const line of logs) {
        for (const secretish of ['84912345678', '0912345678', 'tok-1', 'acc-1', SECRET]) {
          expect(line).not.toContain(secretish)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd admin-web && npx vitest run ../supabase/functions/zalo-phone/handler.test.ts`
Expected: FAIL — không tìm thấy `./handler`.

- [ ] **Step 3: Viết handler** — `supabase/functions/zalo-phone/handler.ts`

```ts
// Đổi token SĐT của Zalo Mini App ra số điện thoại thật (spec 2026-10-09 §4.2).
// Token do getPhoneNumber() cấp: dùng 1 lần, hết hạn sau 2 phút.
// KHÔNG ghi DB. KHÔNG log số, token, access token, secret — chỉ log mã lỗi Zalo / HTTP status.
// Không import gì để chạy được cả trên Deno (index.ts) lẫn vitest.

export const ZALO_PHONE_URL = 'https://graph.zalo.me/v2.0/me/info'

export type ZaloPhoneBody = { storeId?: unknown; token?: unknown; accessToken?: unknown } | null
export type ZaloPhoneConfig = { secret: string | null; enabled: boolean } | null
export type ZaloPhoneResult =
  | { status: 200; body: { phone: string } }
  | { status: 400 | 409 | 502; body: { error: 'bad_request' | 'not_configured' | 'zalo_error' } }

export type ZaloPhoneDeps = {
  loadConfig: (storeId: string) => Promise<ZaloPhoneConfig>
  fetch: (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<Response>
  log: (message: string) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function handleZaloPhone(body: ZaloPhoneBody, deps: ZaloPhoneDeps): Promise<ZaloPhoneResult> {
  const storeId = str(body?.storeId)
  const token = str(body?.token)
  const accessToken = str(body?.accessToken)
  if (!UUID.test(storeId) || !token || !accessToken) {
    return { status: 400, body: { error: 'bad_request' } }
  }

  // Secret theo ĐÚNG quán (store_zalo_configs, mig 021) — mỗi quán là một Zalo App riêng.
  const config = await deps.loadConfig(storeId)
  const secret = config?.secret?.trim() ?? ''
  if (!config || !config.enabled || !secret) {
    return { status: 409, body: { error: 'not_configured' } }
  }

  let res: Response
  try {
    res = await deps.fetch(ZALO_PHONE_URL, {
      method: 'GET',
      headers: { access_token: accessToken, code: token, secret_key: secret },
    })
  } catch {
    deps.log('[zalo-phone] không gọi được Zalo (lỗi mạng)')
    return { status: 502, body: { error: 'zalo_error' } }
  }

  let payload: { error?: unknown; data?: { number?: unknown } } | null = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }
  const number = payload?.data?.number
  if (!res.ok || payload?.error !== 0 || typeof number !== 'string' || !number) {
    const code = typeof payload?.error === 'number' ? payload.error : 'n/a'
    deps.log(`[zalo-phone] Zalo trả lỗi http=${res.status} error=${code}`)
    return { status: 502, body: { error: 'zalo_error' } }
  }
  return { status: 200, body: { phone: number } }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd admin-web && npx vitest run ../supabase/functions/zalo-phone/handler.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Viết entry** — `supabase/functions/zalo-phone/index.ts`

```ts
// Supabase Edge Function — đổi token getPhoneNumber() của Mini App ra số điện thoại (spec 2026-10-09).
// verify_jwt: true (mini app gửi anon JWT, giống checkout-create-mac).
// Secret: store_zalo_configs.zalo_app_secret_key theo quán. KHÔNG ghi DB.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleZaloPhone, type ZaloPhoneBody } from './handler.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405)

  let body: ZaloPhoneBody = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const result = await handleZaloPhone(body, {
    loadConfig: async (storeId) => {
      const { data, error } = await db
        .from('store_zalo_configs')
        .select('zalo_app_secret_key, is_enabled')
        .eq('store_id', storeId)
        .maybeSingle()
      if (error || !data) return null
      return { secret: data.zalo_app_secret_key as string | null, enabled: data.is_enabled as boolean }
    },
    fetch: (url, init) => fetch(url, init),
    log: (message) => console.warn(message),
  })
  return json(result.body, result.status)
})
```

- [ ] **Step 6: Deploy lên prod** (function mới, không đụng function cũ)

Dùng MCP `mcp__claude_ai_Supabase__deploy_edge_function`: project `dlkgdpexjtyynbotkwka`, name `zalo-phone`, `verify_jwt: true`, files `index.ts` + `handler.ts` (nội dung y hệt trên đĩa).

- [ ] **Step 7: Kiểm nhanh bằng curl** (input rác phải ra 400, không cần token thật)

```bash
curl -s -X POST "https://dlkgdpexjtyynbotkwka.supabase.co/functions/v1/zalo-phone" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"storeId":"x"}'
```
Expected: `{"error":"bad_request"}`. (Lấy anon key từ `mini-app-instances/<slug>/mini-app/.env` hoặc MCP `get_publishable_keys`.)

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/zalo-phone
git commit -m "feat: edge function zalo-phone doi token SDT Zalo ra so (khong ghi DB)"
```

---

### Task 3: Client lấy SĐT từ Zalo

**Files:**
- Create: `mini-app/src/services/zalo-phone.ts`
- Test: `mini-app/src/services/zalo-phone.test.ts`

**Interfaces:**
- Consumes: HTTP contract Task 2; `getPhoneNumber(): Promise<{ token?: string }>`, `getAccessToken(): Promise<string>` (zmp-sdk); `normalizeVnPhone`.
- Produces:
  - `type ZaloPhoneError = "denied" | "not_configured" | "zalo_error" | "network"`
  - `type ZaloPhoneOutcome = { ok: true; phone: string } | { ok: false; error: ZaloPhoneError }`
  - `fetchZaloPhone(storeId: string): Promise<ZaloPhoneOutcome>` — `phone` đã chuẩn hoá `0xxxxxxxxx`
  - `zaloPhoneErrorMessage(error: ZaloPhoneError): string`

- [ ] **Step 1: Viết test (fail)** — `mini-app/src/services/zalo-phone.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock bị hoist lên đầu file → biến dùng trong factory phải tạo bằng vi.hoisted (như payment.service.test.ts).
const sdk = vi.hoisted(() => ({
  getPhoneNumber: vi.fn(),
  getAccessToken: vi.fn(),
}));
vi.mock("zmp-sdk", () => sdk);

import { fetchZaloPhone, zaloPhoneErrorMessage } from "./zalo-phone";

const fetchMock = vi.fn();

function reply(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  sdk.getPhoneNumber.mockResolvedValue({ token: "tok-1" });
  sdk.getAccessToken.mockResolvedValue("acc-1");
  fetchMock.mockImplementation(() => reply({ phone: "84912345678" }));
});

describe("fetchZaloPhone", () => {
  it("thành công: gửi storeId + token + accessToken, trả số đã chuẩn hoá 84 → 0", async () => {
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: true, phone: "0912345678" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/functions\/v1\/zalo-phone$/);
    expect(JSON.parse(init.body)).toEqual({ storeId: "store-a", token: "tok-1", accessToken: "acc-1" });
  });

  it("mỗi lần gọi lấy token MỚI (token Zalo dùng 1 lần)", async () => {
    await fetchZaloPhone("store-a");
    await fetchZaloPhone("store-a");
    expect(sdk.getPhoneNumber).toHaveBeenCalledTimes(2);
  });

  it("khách từ chối (SDK ném lỗi) → denied, không gọi server", async () => {
    sdk.getPhoneNumber.mockRejectedValue(new Error("-1402"));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "denied" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SDK không trả token → denied", async () => {
    sdk.getPhoneNumber.mockResolvedValue({});
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "denied" });
  });

  it("không lấy được access token → zalo_error", async () => {
    sdk.getAccessToken.mockRejectedValue(new Error("x"));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });

  it("server báo quán chưa cấu hình → not_configured", async () => {
    fetchMock.mockImplementation(() => reply({ error: "not_configured" }, 409));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "not_configured" });
  });

  it("server báo lỗi Zalo → zalo_error", async () => {
    fetchMock.mockImplementation(() => reply({ error: "zalo_error" }, 502));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });

  it("số rác từ server → zalo_error, không trả số", async () => {
    fetchMock.mockImplementation(() => reply({ phone: "12" }));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });

  it("fetch ném lỗi mạng → network", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "network" });
  });

  it("body không phải JSON → zalo_error", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("oops", { status: 500 })));
    expect(await fetchZaloPhone("store-a")).toEqual({ ok: false, error: "zalo_error" });
  });
});

describe("zaloPhoneErrorMessage", () => {
  it.each(["denied", "not_configured", "zalo_error", "network"] as const)("%s có câu tiếng Việt nhắc nhập tay", (code) => {
    expect(zaloPhoneErrorMessage(code)).toMatch(/nhập tay/);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd mini-app && npx vitest run src/services/zalo-phone.test.ts`
Expected: FAIL — không tìm thấy `./zalo-phone`.

- [ ] **Step 3: Viết code** — `mini-app/src/services/zalo-phone.ts`

```ts
import { getAccessToken, getPhoneNumber } from "zmp-sdk";
import { normalizeVnPhone } from "@/utils/booking-validation";

// Lấy SĐT thật từ Zalo (spec 2026-10-09 §4.1): getPhoneNumber() → token (dùng 1 lần, hết hạn 2 phút)
// → edge function zalo-phone đổi ra số bằng secret của quán. Số chỉ trả về máy khách, server không lưu.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type ZaloPhoneError = "denied" | "not_configured" | "zalo_error" | "network";
export type ZaloPhoneOutcome = { ok: true; phone: string } | { ok: false; error: ZaloPhoneError };

export async function fetchZaloPhone(storeId: string): Promise<ZaloPhoneOutcome> {
  // Luôn xin token mới — token cũ đã dùng hoặc đã hết hạn.
  let token: string | undefined;
  try {
    ({ token } = await getPhoneNumber());
  } catch {
    return { ok: false, error: "denied" };
  }
  if (!token) return { ok: false, error: "denied" };

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch {
    return { ok: false, error: "zalo_error" };
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/zalo-phone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ storeId, token, accessToken }),
    });
  } catch {
    return { ok: false, error: "network" };
  }

  const body = (await res.json().catch(() => null)) as { phone?: unknown; error?: unknown } | null;
  if (typeof body?.phone === "string") {
    const normalized = normalizeVnPhone(body.phone);
    return normalized.ok ? { ok: true, phone: normalized.value } : { ok: false, error: "zalo_error" };
  }
  if (body?.error === "not_configured") return { ok: false, error: "not_configured" };
  return { ok: false, error: "zalo_error" };
}

export function zaloPhoneErrorMessage(error: ZaloPhoneError): string {
  switch (error) {
    case "denied":
      return "Bạn chưa cho phép lấy số điện thoại. Bạn có thể nhập tay bên dưới.";
    case "not_configured":
      return "Quán chưa hỗ trợ lấy số từ Zalo. Bạn nhập tay bên dưới nhé.";
    case "network":
      return "Mất kết nối mạng. Bạn thử lại hoặc nhập tay bên dưới.";
    default:
      return "Zalo chưa trả được số điện thoại. Bạn thử lại hoặc nhập tay bên dưới.";
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd mini-app && npx vitest run src/services/zalo-phone.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add mini-app/src/services/zalo-phone.ts mini-app/src/services/zalo-phone.test.ts
git commit -m "feat: client lay SDT tu Zalo qua edge function zalo-phone"
```

---

### Task 4: Màn Tài khoản + điền sẵn form mang về

**Files:**
- Modify (viết lại): `mini-app/src/pages/account/index.tsx`
- Modify: `mini-app/src/pages/checkout/index.tsx:33` (bỏ hằng cục bộ) và dòng `const initialForm = useRef(loadTakeawayForm()).current;`

**Interfaces:**
- Consumes: Task 1 (`mergeProfile`, `formatPhoneDisplay`, `prefillContact`, `clearPersonalData`, `TAKEAWAY_FORM_KEY`), Task 3 (`fetchZaloPhone`, `zaloPhoneErrorMessage`), `getReservationProfile`/`saveReservationProfile`, `useAppStore` (`storeId`, `termsOfUse`), `SectionCard`, `ConfirmSheet`, `TermsSheet`, `DEFAULT_TERMS`, icons `UserIcon PhoneIcon LockIcon FileTextIcon`, `useSnackbar` (zmp-ui, `openSnackbar({ text, type })`), `getSetting`/`getUserInfo` (zmp-sdk).
- Produces: route `/account` (đã khai báo sẵn trong `router.tsx` với `back`, `hideBottomTabs`, `hideCart` — không sửa router).

- [ ] **Step 1: Sửa checkout dùng key chung + điền sẵn**

Trong `mini-app/src/pages/checkout/index.tsx`:
- Xoá dòng `const TAKEAWAY_FORM_KEY = "mevo_takeaway_form";`
- Thêm import:

```ts
import { TAKEAWAY_FORM_KEY } from "@/constants/storage-keys";
import { prefillContact } from "@/utils/account-profile";
import { getReservationProfile } from "@/services/reservation/reservation-storage";
```

- Đổi dòng khởi tạo form:

```ts
  // Ô tên/SĐT còn trống thì điền từ hồ sơ trang Tài khoản (spec 2026-10-09 §5) — không đè chữ khách đã gõ.
  const initialForm = useRef(
    prefillContact(loadTakeawayForm(), getReservationProfile(useAppStore.getState().storeId)),
  ).current;
```
(`useAppStore` là store zustand — `getState()` có sẵn; dùng vì hook `useAppStore()` trong component nằm SAU dòng này.)

Nếu `getReservationProfile` đã được import sẵn trong file thì không import lại.

- [ ] **Step 2: Viết lại trang** — `mini-app/src/pages/account/index.tsx`

```tsx
import { useCallback, useEffect, useState } from "react";
import { getSetting, getUserInfo } from "zmp-sdk";
import { useSnackbar } from "zmp-ui";
import SectionCard from "@/components/ui/section-card";
import ConfirmSheet from "@/components/ui/confirm-sheet";
import TermsSheet from "@/components/common/terms-sheet";
import { FileTextIcon, LockIcon, PhoneIcon, UserIcon } from "@/components/common/icons";
import { DEFAULT_TERMS } from "@/constants/terms";
import { useAppStore } from "@/stores/app.store";
import { getReservationProfile, saveReservationProfile } from "@/services/reservation/reservation-storage";
import { clearPersonalData } from "@/services/account-storage";
import { fetchZaloPhone, zaloPhoneErrorMessage } from "@/services/zalo-phone";
import { formatPhoneDisplay, mergeProfile, type ProfilePatch } from "@/utils/account-profile";
import { normalizeVnPhone } from "@/utils/booking-validation";
import type { ReservationProfile } from "@/types/reservation.types";

// Trang Tài khoản (spec 2026-10-09): hồ sơ + quyền riêng tư. Mọi thông tin chỉ nằm trên máy khách.
const EMPTY: ReservationProfile = { customerName: "", customerPhone: "" };

export default function AccountPage() {
  const { storeId, termsOfUse } = useAppStore();
  const { openSnackbar } = useSnackbar();

  const [profile, setProfile] = useState<ReservationProfile>(() => getReservationProfile(storeId) ?? EMPTY);
  const [nameDraft, setNameDraft] = useState(profile.customerName);
  const [zaloUser, setZaloUser] = useState<{ name: string; avatar: string } | null>(null);
  const [fromZalo, setFromZalo] = useState(false);
  const [fetchingPhone, setFetchingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualError, setManualError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // Đọc lại từ storage mỗi lần ghi — tránh đè thay đổi của form khác bằng state cũ.
  const update = useCallback((patch: ProfilePatch, overwriteName: boolean) => {
    const next = mergeProfile(getReservationProfile(storeId), patch, { overwriteName });
    saveReservationProfile(storeId, next);
    setProfile(next);
    return next;
  }, [storeId]);

  const applyZaloUser = useCallback((info: { name: string; avatar: string }) => {
    setZaloUser({ name: info.name, avatar: info.avatar });
    // Tên Zalo chỉ điền khi hồ sơ chưa có tên — không đè tên khách đã tự sửa.
    const next = update({ customerName: info.name }, false);
    setNameDraft(next.customerName);
  }, [update]);

  // Chỉ đọc tên/ảnh khi khách ĐÃ cho quyền — mở trang không tự bật hộp xin quyền.
  useEffect(() => {
    let alive = true;
    getSetting()
      .then(({ authSetting }) => (authSetting?.["scope.userInfo"] ? getUserInfo({ avatarType: "normal" }) : null))
      .then((res) => { if (alive && res?.userInfo?.name) applyZaloUser(res.userInfo); })
      .catch(() => { /* không đọc được thì giữ "Khách" */ });
    return () => { alive = false; };
  }, [applyZaloUser]);

  const connectZalo = async () => {
    try {
      const { userInfo } = await getUserInfo({ autoRequestPermission: true, avatarType: "normal" });
      if (userInfo?.name) applyZaloUser(userInfo);
    } catch { /* khách từ chối — giữ "Khách", không báo lỗi to */ }
  };

  const getPhoneFromZalo = async () => {
    setFetchingPhone(true);
    setPhoneError("");
    const result = await fetchZaloPhone(storeId);
    setFetchingPhone(false);
    if (result.ok) {
      update({ customerPhone: result.phone }, false);
      setFromZalo(true);
      setManualOpen(false);
      return;
    }
    setPhoneError(zaloPhoneErrorMessage(result.error));
    setManualOpen(true);
  };

  const saveManualPhone = () => {
    const normalized = normalizeVnPhone(manualPhone);
    if (!normalized.ok) { setManualError(normalized.error); return; }
    update({ customerPhone: normalized.value }, false);
    setFromZalo(false);
    setManualOpen(false);
    setManualPhone("");
    setManualError("");
    setPhoneError("");
    openSnackbar({ text: "Đã lưu số điện thoại", type: "success" });
  };

  const saveName = () => {
    if (nameDraft.trim() === profile.customerName) return;
    const next = update({ customerName: nameDraft }, true);
    setNameDraft(next.customerName);
  };

  const clearAll = () => {
    clearPersonalData(storeId);
    setProfile(EMPTY);
    setNameDraft("");
    setZaloUser(null);
    setFromZalo(false);
    setManualOpen(false);
    setPhoneError("");
    setConfirmClear(false);
    openSnackbar({ text: "Đã xoá thông tin cá nhân trên máy này", type: "success" });
  };

  const hasPhone = !!profile.customerPhone;

  return (
    <div className="pb-6">
      {/* Thẻ hồ sơ */}
      <section className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        {zaloUser?.avatar ? (
          <img src={zaloUser.avatar} alt="" className="size-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserIcon className="size-7" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-large-m font-bold text-text-primary">{zaloUser?.name || profile.customerName || "Khách"}</p>
          {zaloUser ? (
            <p className="mt-0.5 text-xxsmall text-text-secondary">Đã kết nối tài khoản Zalo</p>
          ) : (
            <button type="button" onClick={() => void connectZalo()} className="mt-1 text-small-m font-semibold text-primary">
              Kết nối Zalo
            </button>
          )}
        </div>
      </section>

      {/* Thông tin liên hệ */}
      <SectionCard title="Thông tin liên hệ" subtitle="Tự điền khi bạn đặt bàn, đặt món mang về" icon={<PhoneIcon />}>
        <label className="block text-xxsmall text-text-secondary" htmlFor="account-name">Tên</label>
        <input
          id="account-name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={saveName}
          placeholder="Tên để quán gọi bạn"
          className="mt-1 h-12 w-full rounded-xl border border-neutral200 px-3 text-normal text-text-primary outline-none focus:border-primary"
        />

        <p className="mt-3 text-xxsmall text-text-secondary">Số điện thoại</p>
        {hasPhone ? (
          <div className="mt-1 flex h-12 items-center justify-between rounded-xl border border-neutral200 pl-3 pr-2">
            <span className="text-normal font-semibold text-text-primary">{formatPhoneDisplay(profile.customerPhone)}</span>
            <button
              type="button"
              onClick={() => void getPhoneFromZalo()}
              disabled={fetchingPhone}
              className="rounded-full bg-primary/10 px-3 py-1.5 text-xxsmall font-semibold text-primary disabled:opacity-50"
            >
              {fetchingPhone ? "Đang lấy…" : "Cập nhật"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void getPhoneFromZalo()}
            disabled={fetchingPhone}
            className="mt-1 h-12 w-full rounded-xl bg-[#0068FF] text-small-m font-semibold text-white disabled:opacity-60"
          >
            {fetchingPhone ? "Đang lấy số…" : "Lấy số từ Zalo"}
          </button>
        )}
        {hasPhone && fromZalo && !phoneError && (
          <p className="mt-2 text-xxsmall text-success">Đã lấy từ Zalo · sẽ điền sẵn khi đặt bàn</p>
        )}
        {phoneError && <p className="mt-2 text-xxsmall text-critical">{phoneError}</p>}

        {manualOpen ? (
          <div className="mt-3 flex gap-2">
            <input
              value={manualPhone}
              onChange={(e) => { setManualPhone(e.target.value); setManualError(""); }}
              inputMode="tel"
              placeholder="0962 345 678"
              aria-label="Nhập số điện thoại"
              className="h-12 min-w-0 flex-1 rounded-xl border border-neutral200 px-3 text-normal outline-none focus:border-primary"
            />
            <button type="button" onClick={saveManualPhone} className="h-12 shrink-0 rounded-xl bg-primary px-4 text-small-m font-semibold text-white">
              Lưu
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setManualOpen(true)} className="mt-2 w-full text-center text-small-m font-semibold text-primary">
            Nhập tay
          </button>
        )}
        {manualError && <p className="mt-1 text-xxsmall text-critical">{manualError}</p>}
      </SectionCard>

      {/* Quyền riêng tư */}
      <SectionCard title="Quyền riêng tư" icon={<LockIcon />}>
        <p className="text-small text-text-secondary">
          Tên và số điện thoại chỉ lưu trên điện thoại này để điền sẵn khi đặt bàn. Quán chỉ nhận khi bạn gửi đơn.
        </p>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="mt-3 h-11 w-full rounded-xl border border-critical/40 text-small-m font-semibold text-critical"
        >
          Xoá thông tin cá nhân
        </button>
        <p className="mt-3 text-xxsmall text-text-secondary">
          Muốn thu hồi quyền Zalo đã cấp: Zalo → Cá nhân → Cài đặt → Quyền riêng tư → Ứng dụng đã cấp quyền.
        </p>
        <button
          type="button"
          onClick={() => setTermsOpen(true)}
          className="mt-3 flex w-full items-center gap-2 border-t border-neutral100 pt-3 text-left text-small-m text-text-primary"
        >
          <FileTextIcon className="size-4 text-text-secondary" />
          <span className="flex-1">Điều khoản sử dụng</span>
          <span className="text-text-secondary">›</span>
        </button>
      </SectionCard>

      <p className="mt-4 text-center text-xxsmall text-text-secondary">Vận hành bởi MEVO</p>

      <ConfirmSheet
        open={confirmClear}
        title="Xoá thông tin cá nhân?"
        description="Tên, số điện thoại và thông tin đang điền dở trên máy này sẽ bị xoá. Lịch đặt bàn và đơn đang gọi vẫn giữ nguyên."
        confirmLabel="Xoá"
        danger
        onConfirm={clearAll}
        onClose={() => setConfirmClear(false)}
      />
      <TermsSheet visible={termsOpen} content={termsOfUse.trim() || DEFAULT_TERMS} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 3: Kiểm class màu tồn tại**

Run: `cd mini-app && grep -rn "text-success\|text-critical\|border-critical" src --include=*.tsx | head -5`
Expected: thấy ít nhất một chỗ dùng mỗi class. Class nào chưa từng dùng → kiểm `tailwind.config` có token đó không; không có thì đổi sang token đang có (ví dụ `text-green-700` / `text-red-600`) — KHÔNG thêm token mới.

- [ ] **Step 4: Typecheck + toàn bộ test**

Run: `cd mini-app && npm run typecheck && npm test`
Expected: typecheck không tăng lỗi so với mốc Task 0; test PASS toàn bộ.
Lỗi kiểu `authSetting?.["scope.userInfo"]` hoặc `getUserInfo` args → đọc `node_modules/zmp-sdk/apis/index.d.ts` (`GetSettingReturn`, `getUserInfoArgs`) và sửa cho khớp, không dùng `any`.

- [ ] **Step 5: Chạy thử trên trình duyệt** (Zalo SDK không có → kiểm nhánh lỗi + nhập tay)

Từ worktree quán Bảo Lương: `cd mini-app-instances/bia-lau-bao-luong && git merge <nhánh này>` rồi `cd mini-app && npm run dev`, mở `/account` khổ 360px. Kỳ vọng: hiện "Khách" + Kết nối Zalo; bấm Lấy số từ Zalo → câu lỗi + ô nhập tay mở; nhập `0962 345 678` → Lưu → số hiện `0962 345 678`; mở Đặt bàn thấy số đã điền; Xoá thông tin cá nhân → form Đặt bàn trống.

- [ ] **Step 6: Commit**

```bash
git add mini-app/src/pages/account/index.tsx mini-app/src/pages/checkout/index.tsx
git commit -m "feat: trang Tai khoan Mini App (ho so Zalo, lay SDT, xoa thong tin ca nhan)"
```

---

### Task 5: Checklist test tay + ghi quyết định

**Files:**
- Create: `docs/testing/account-page/ACC-1.md`
- Modify: `CLAUDE.md` (thêm 1 dòng cuối bảng §10)

- [ ] **Step 1: Viết checklist** — `docs/testing/account-page/ACC-1.md`

```markdown
# ACC-1 — Trang Tài khoản Mini App (test trên Bảo Lương, Zalo thật)

Spec: `docs/superpowers/specs/2026-10-09-mini-app-account-page-design.md`

Tự động (đã chạy): `account-profile`, `account-storage`, `zalo-phone` (client) — mini-app vitest;
`supabase/functions/zalo-phone/handler.test.ts` — chạy từ admin-web.

⚠️ Bài 2–3 cần Zalo DUYỆT quyền #100 (SĐT) cho app Bảo Lương. Chưa duyệt → chỉ chạy bài 1, 4–8.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| 1 | Mở app → icon người góc phải | Trang Tài khoản; chưa cho quyền: "Khách" + "Kết nối Zalo". Bấm → cho phép → tên + ảnh Zalo hiện, ô Tên điền tên Zalo |
| 2 | Bấm "Lấy số từ Zalo" → Cho phép | Số hiện dạng `09xx xxx xxx` + dòng xanh "Đã lấy từ Zalo" |
| 3 | Bấm "Cập nhật" lần nữa | Lấy lại được số (không lỗi token đã dùng) |
| 4 | Bấm "Lấy số từ Zalo" → Từ chối | Câu lỗi "Bạn chưa cho phép…" + ô nhập tay mở. Nhập `123` → báo sai; nhập số đúng → Lưu → số hiện |
| 5 | Sửa ô Tên thành "Anh Nam bàn 5", thoát app, mở lại Tài khoản | Tên vẫn "Anh Nam bàn 5" (không bị tên Zalo đè) |
| 6 | Tab Đặt bàn → form | Tên + SĐT đã điền sẵn |
| 7 | Tài khoản → Xoá thông tin cá nhân → Xoá | Toast "Đã xoá…"; form Đặt bàn trống; lịch hẹn cũ VẪN xem được; nếu đang ngồi bàn thì vẫn gọi món được |
| 8 | Điều khoản sử dụng | Mở đúng nội dung điều khoản của quán; khổ 360px không vỡ, góc phải thanh công cụ không bị nút Zalo đè |
```

- [ ] **Step 2: Thêm dòng quyết định vào `CLAUDE.md` §10** (cuối bảng):

```markdown
| 2026-10-09 | **Trang Tài khoản Mini App = hồ sơ + quyền riêng tư** (ACC-1): tên/ảnh Zalo (chỉ đọc khi đã cho quyền), **SĐT thật từ Zalo** qua edge function `zalo-phone` (đổi token bằng `store_zalo_configs.zalo_app_secret_key`, **KHÔNG ghi DB, không log số**), dự phòng nhập tay. Hồ sơ dùng lại `ReservationProfile` trên máy. "Xoá thông tin cá nhân" = `clearPersonalData()` — CỐ Ý giữ `mevo_reservation_access*`, `mevo_device_id`, `mevo_cart`. Spec `docs/superpowers/specs/2026-10-09-mini-app-account-page-design.md` | Khách gõ lại SĐT mỗi lần đặt bàn; giữ dữ liệu cá nhân ngoài server để không phải lo RLS/xoá phía server. ⚠️ Quyền SĐT phải xin RIÊNG từng app ở console Zalo Mini App (quyền #100, kèm ảnh + lý do) — quán chưa được duyệt thì nút Zalo rơi về nhập tay. ⚠️ Token `getPhoneNumber` dùng 1 lần, hết hạn 2 phút — không cache |
```

- [ ] **Step 3: Commit**

```bash
git add docs/testing/account-page/ACC-1.md CLAUDE.md
git commit -m "docs: checklist ACC-1 + quyet dinh trang Tai khoan"
```

- [ ] **Step 4: DỪNG** — theo quy tắc CLAUDE.md: báo anh Tú *"Xong rồi anh, test theo `docs/testing/account-page/ACC-1.md` nhé"*, kèm nhắc: merge vào worktree Bảo Lương trước, `zmp deploy` chọn **Development** (tự test) hay **Testing**. Chờ PASS, không tự chuyển việc khác.
