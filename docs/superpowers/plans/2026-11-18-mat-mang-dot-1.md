# Mất mạng tạm thời — Đợt 1 (POS báo mất mạng + tờ quy trình) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi quầy mất mạng quá 1 phút, MEVO POS nói rõ là đang mất mạng; khi có mạng lại, POS chỉ ra các lượt món gọi trong lúc mất mạng để thu ngân hỏi lại khách; quán có một tờ quy trình A4 dán ở quầy.

**Architecture:** Toàn bộ nằm ở phía trình duyệt của `admin-web`, **không có migration, không RPC mới, không server action mới**. Một tệp hàm thuần (`lib/pos-offline-watch.ts`) giữ mọi luật (ngưỡng 60 giây, khoảng mất mạng, đếm lượt món, nhãn chờ 10 phút); một hook mỏng theo dõi cờ `live` sẵn có của POS; một component băng thông báo; hai chỗ vẽ lượt món chờ duyệt đổi nhãn giờ. Tờ quy trình là một tệp HTML tĩnh in A4.

**Tech Stack:** Next.js 16 (App Router) + React 19, Tailwind 4, vitest (`renderToStaticMarkup`, không có DOM giả). Đọc `admin-web/AGENTS.md` trước khi viết.

**Spec:** `docs/superpowers/specs/2026-11-18-xu-ly-mat-mang-tam-thoi-design.md` — Đợt 1 = mục A6 dòng 1, B5.7 "Đợt 1", B6 (đoạn chính sách `automatic`), B8 "Đợt 1". Đợt 2 và 3 có plan riêng, **không làm ở đây**.

## Global Constraints

- Chỉ sửa trong `admin-web/` và `docs/`. Không đụng `supabase/`, `print-agent/`, `mini-app/`.
- Ngày thường (có mạng) POS phải chạy y như trước (AG1): không thêm lần đọc máy chủ nào, không đổi luồng Duyệt / Từ chối, không đổi nhãn "Trực tuyến / Mất kết nối — đang thử lại" và băng "Không tải được dữ liệu mới nhất" đang có.
- Ngưỡng báo mất mạng: **60 giây** `live` sai liên tục. Ngưỡng nhãn chờ: **10 phút**.
- "Lượt món chờ duyệt" luôn suy qua `isReviewableOrder` (`admin-web/lib/table-status.ts`), không so `status` trần.
- Mọi chữ người dùng thấy bằng tiếng Việt, đúng nguyên văn ghi trong plan này. Comment tiếng Việt cho logic khó.
- Giờ hiển thị dùng `clock()` của `admin-web/lib/pos-timeline.ts` (múi giờ Việt Nam).
- Không đọc / in `.env*`. Commit dạng `feat: …` / `docs: …`, không thêm dòng ghi công.
- Xong mỗi task: `cd admin-web && npm run test -- <tệp test>` xanh. Xong cả plan: `python scripts/verify.py` xanh hoặc chỉ còn nợ cũ.
- Luật test của `CLAUDE.md`: xong Task 4 thì **dừng**, báo anh Tú test theo `docs/testing/mat-mang/DOT-1.md`, chờ "PASS".

## Review Focus

1. **Mạng chập chờn** (mất 70 giây, có lại 10 giây, mất tiếp 2 phút): băng "Vừa có mạng lại" phải giữ mốc đầu tiên của cả chuỗi, không quên các lượt món của lần mất đầu. → test ở Task 1.
2. **Vừa mở trang POS** (`connected` sai vài giây đầu trước khi kênh realtime nối): không được hiện băng đỏ, không được hiện "Vừa có mạng lại". → test ở Task 1.
3. **Máy ngủ / tab bị trình duyệt hãm đồng hồ**: băng đỏ phải tính từ mốc thời gian, không đếm nhịp; máy thức dậy sau 5 phút mất mạng là thấy băng ngay. → test ở Task 1.
4. **Đồng hồ máy quầy lệch máy chủ một hai phút** (`created_at` là giờ máy chủ, khoảng mất mạng là giờ máy quầy): lượt món sát mép khoảng không được lọt. → nới mép đầu 2 phút, test ở Task 1.
5. **Đơn không phải "chờ duyệt"**: món thu ngân ghi tay (`pos`), món đặt trước, đơn đã được máy khác duyệt không được đếm; đơn "tự vào bếp" (quán chính sách `automatic`) phải được đếm riêng với câu "kiểm tra bếp". → test ở Task 1.

---

### Task 1: Luật mất mạng dạng hàm thuần

**Files:**
- Create: `admin-web/lib/pos-offline-watch.ts`
- Test: `admin-web/lib/pos-offline-watch.test.ts`

**Interfaces:**
- Consumes: `isReviewableOrder` từ `./table-status`; `clock` từ `./pos-timeline`; `waitLabel` từ `./pos-work-queue`.
- Produces (Task 2 và 3 dùng đúng các tên này):

```ts
export const OFFLINE_NOTICE_MS = 60_000
export const STALE_ORDER_MS = 600_000
export const OUTAGE_SLACK_MS = 120_000
export type Outage = { from: number; to: number }
export type OfflineState = { downSince: number | null; lastOutage: Outage | null }
export const INITIAL_OFFLINE_STATE: OfflineState   // { downSince: null, lastOutage: null }
export type OutageSession = { status: string; orders: { id: string; status: string; created_at: string; order_source: string; needs_pos_confirmation?: boolean }[] }
export type OutageOrders = { review: number; autoKitchen: number; firstAt: number | null }

export function nextOfflineState(state: OfflineState, live: boolean, now: number): OfflineState
export function dismissOutage(state: OfflineState): OfflineState
export function offlineSince(state: OfflineState, now: number): number | null
export function outageOrders(sessions: OutageSession[], outage: Outage): OutageOrders
export function staleOrderLabel(createdAt: number, now: number): string | null
```

- [ ] **Step 1: Viết test (đỏ)** — `admin-web/lib/pos-offline-watch.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  INITIAL_OFFLINE_STATE as S0, dismissOutage, nextOfflineState, offlineSince, outageOrders, staleOrderLabel,
} from './pos-offline-watch'

const T = Date.parse('2026-11-18T12:40:00Z') // 19:40 giờ Việt Nam
const sec = (n: number) => T + n * 1000

describe('nextOfflineState', () => {
  it('đang có mạng: không đổi, trả đúng object cũ', () => {
    expect(nextOfflineState(S0, true, T)).toBe(S0)
  })
  it('mất mạng: ghi mốc lần đầu, các lần sau giữ nguyên mốc', () => {
    const a = nextOfflineState(S0, false, T)
    expect(a).toEqual({ downSince: T, lastOutage: null })
    expect(nextOfflineState(a, false, sec(30))).toBe(a)
  })
  it('rớt dưới 60 giây rồi có lại: coi như chưa có gì (kể cả lúc vừa mở trang)', () => {
    const a = nextOfflineState(S0, false, T)
    expect(nextOfflineState(a, true, sec(59))).toEqual(S0)
  })
  it('mất từ 60 giây rồi có lại: ghi khoảng mất mạng', () => {
    const a = nextOfflineState(S0, false, T)
    expect(nextOfflineState(a, true, sec(60))).toEqual({ downSince: null, lastOutage: { from: T, to: sec(60) } })
  })
  it('chập chờn: lần mất sau nối vào khoảng trước, giữ mốc đầu', () => {
    let s = nextOfflineState(S0, false, T)
    s = nextOfflineState(s, true, sec(70))
    s = nextOfflineState(s, false, sec(80))
    s = nextOfflineState(s, true, sec(200))
    expect(s).toEqual({ downSince: null, lastOutage: { from: T, to: sec(200) } })
  })
  it('đã có khoảng cũ, rớt ngắn dưới 60 giây: khoảng cũ giữ nguyên', () => {
    let s = nextOfflineState(S0, false, T)
    s = nextOfflineState(s, true, sec(70))
    s = nextOfflineState(nextOfflineState(s, false, sec(80)), true, sec(90))
    expect(s.lastOutage).toEqual({ from: T, to: sec(70) })
  })
  it('dismissOutage xoá khoảng, không đụng mốc đang mất', () => {
    expect(dismissOutage({ downSince: sec(5), lastOutage: { from: T, to: sec(1) } })).toEqual({ downSince: sec(5), lastOutage: null })
  })
})

describe('offlineSince', () => {
  const down = { downSince: T, lastOutage: null }
  it('chưa đủ 60 giây: null', () => expect(offlineSince(down, sec(59))).toBeNull())
  it('đủ 60 giây: trả mốc bắt đầu', () => expect(offlineSince(down, sec(60))).toBe(T))
  it('máy ngủ 5 phút rồi thức: vẫn trả mốc (tính theo thời gian, không đếm nhịp)', () => expect(offlineSince(down, sec(300))).toBe(T))
  it('đang có mạng: null', () => expect(offlineSince(S0, sec(300))).toBeNull())
})

describe('outageOrders', () => {
  const outage = { from: T, to: sec(600) }
  const o = (id: string, at: number, over: Record<string, unknown> = {}) =>
    ({ id, status: 'pending', created_at: new Date(at).toISOString(), order_source: 'customer_zalo', needs_pos_confirmation: true, ...over })
  const open = (...orders: ReturnType<typeof o>[]) => [{ status: 'open', orders }]

  it('đếm lượt chờ duyệt tạo trong khoảng, firstAt là lượt sớm nhất', () => {
    expect(outageOrders(open(o('a', sec(300)), o('b', sec(120))), outage)).toEqual({ review: 2, autoKitchen: 0, firstAt: sec(120) })
  })
  it('nới mép đầu 2 phút, không nới mép cuối', () => {
    const r = outageOrders(open(o('sat-truoc', sec(-120)), o('qua-som', sec(-121)), o('sau-khi-co-mang', sec(601))), outage)
    expect(r).toEqual({ review: 1, autoKitchen: 0, firstAt: sec(-120) })
  })
  it('không đếm món ghi tay, món đặt trước, đơn đã duyệt, phiên không mở', () => {
    const r = outageOrders([
      ...open(
        o('pos', sec(10), { order_source: 'pos', needs_pos_confirmation: false }),
        o('dat-truoc', sec(10), { order_source: 'reservation_preorder', needs_pos_confirmation: false }),
        o('da-duyet', sec(10), { status: 'confirmed', needs_pos_confirmation: false }),
      ),
      { status: 'expired', orders: [o('phien-het-han', sec(10))] },
    ], outage)
    expect(r).toEqual({ review: 0, autoKitchen: 0, firstAt: null })
  })
  it('đơn tự vào bếp (pending nhưng không cần duyệt) đếm riêng', () => {
    const r = outageOrders(open(o('tu-vao-bep', sec(10), { order_source: 'staff', needs_pos_confirmation: false })), outage)
    expect(r).toEqual({ review: 0, autoKitchen: 1, firstAt: sec(10) })
  })
})

describe('staleOrderLabel', () => {
  it('chờ dưới 10 phút: null', () => expect(staleOrderLabel(T, sec(599))).toBeNull())
  it('chờ từ 10 phút: nhãn có giờ gọi và thời gian chờ', () => {
    expect(staleOrderLabel(T, sec(600))).toBe('Gọi lúc 19:40 · đã chờ 10 phút')
    expect(staleOrderLabel(T, sec(75 * 60))).toBe('Gọi lúc 19:40 · đã chờ 1 giờ 15 phút')
  })
})
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd admin-web && npm run test -- lib/pos-offline-watch.test.ts`
Expected: FAIL (không tìm thấy module `./pos-offline-watch`).

- [ ] **Step 3: Viết `admin-web/lib/pos-offline-watch.ts`** theo đúng khối Produces ở trên. Các luật mà chữ ký chưa nói hết:
  - `nextOfflineState`: không có gì đổi thì trả **đúng object đầu vào** (để hook không vẽ lại thừa). Khi `live` trở lại và `now - downSince >= OFFLINE_NOTICE_MS`: `lastOutage = { from: min(lastOutage?.from, downSince), to: now }`. Dưới ngưỡng: chỉ đặt `downSince = null`, giữ `lastOutage`.
  - `outageOrders`: chỉ xét phiên `status === 'open'`; bỏ `order_source` là `pos` / `reservation_preorder`; đơn tính vào khoảng khi `from - OUTAGE_SLACK_MS <= created_at <= to`. `review` = `isReviewableOrder(o)`. `autoKitchen` = không reviewable **và** `status === 'pending'` (đơn tự vào bếp vẫn nằm `pending`; đơn đã duyệt thì không còn `pending`).
  - `staleOrderLabel`: `` `Gọi lúc ${clock(createdAt)} · đã chờ ${waitLabel(createdAt, now)}` `` khi `now - createdAt >= STALE_ORDER_MS`.
  - Đầu tệp có comment tiếng Việt: tệp này là nguồn duy nhất của ngưỡng 60 giây / 10 phút; trỏ về spec.

- [ ] **Step 4: Chạy, thấy xanh**

Run: `cd admin-web && npm run test -- lib/pos-offline-watch.test.ts`
Expected: PASS, 17 test.

- [ ] **Step 5: Commit**

```bash
git add admin-web/lib/pos-offline-watch.ts admin-web/lib/pos-offline-watch.test.ts
git commit -m "feat: luật báo mất mạng ở POS (ngưỡng 60 giây, khoảng mất mạng, đếm lượt món, nhãn chờ 10 phút)"
```

---

### Task 2: Băng "Mất mạng" và băng "Vừa có mạng lại" trên POS

**Files:**
- Create: `admin-web/app/admin/pos/use-offline-watch.ts`
- Create: `admin-web/app/admin/pos/offline-banner.tsx`
- Test: `admin-web/app/admin/pos/offline-banner.test.tsx`
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (thêm import; gọi hook ngay sau dòng `const live = …` ~1192; vẽ băng ngay trước `<PrintStatusBanner` ~1293)

**Interfaces:**
- Consumes (Task 1): `INITIAL_OFFLINE_STATE`, `nextOfflineState`, `dismissOutage`, `offlineSince`, `outageOrders`, `OFFLINE_NOTICE_MS`, kiểu `Outage`, `OutageOrders`.
- Produces:

```ts
// use-offline-watch.ts ('use client')
export function useOfflineWatch(live: boolean): { downSince: number | null; outage: Outage | null; dismiss: () => void }
// downSince chỉ khác null khi đã mất mạng ĐỦ 60 giây (đã qua offlineSince).

// offline-banner.tsx ('use client'), export default
export default function OfflineBanner(props: {
  downSince: number | null
  outage: (Outage & OutageOrders) | null
  onDismiss: () => void
  onShowOrders: () => void
}): JSX.Element | null
```

- [ ] **Step 1: Viết test component (đỏ)** — `admin-web/app/admin/pos/offline-banner.test.tsx`, cùng kiểu `print-status-banner.test.tsx` (`renderToStaticMarkup`):

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import OfflineBanner from './offline-banner'

const T = Date.parse('2026-11-18T12:40:00Z') // 19:40 giờ Việt Nam
const outage = (over: Record<string, unknown> = {}) =>
  ({ from: T, to: T + 900_000, review: 3, autoKitchen: 0, firstAt: T + 720_000, ...over })
const render = (p: Partial<Parameters<typeof OfflineBanner>[0]>) =>
  renderToStaticMarkup(<OfflineBanner downSince={null} outage={null} onDismiss={vi.fn()} onShowOrders={vi.fn()} {...p} />)

describe('OfflineBanner', () => {
  it('có mạng, không có khoảng mất mạng: không vẽ gì', () => {
    expect(render({})).toBe('')
  })
  it('đang mất mạng: băng đỏ có giờ bắt đầu, không có nút đóng', () => {
    const html = render({ downSince: T })
    expect(html).toContain('Mất mạng từ 19:40')
    expect(html).toContain('Các nút sẽ báo lỗi. Mất lâu thì làm theo tờ quy trình mất mạng.')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('Vừa có mạng lại')
  })
  it('đang mất mạng thì không hiện băng có mạng lại của lần trước', () => {
    expect(render({ downSince: T, outage: outage() })).not.toContain('Vừa có mạng lại')
  })
  it('có mạng lại, có lượt chờ duyệt: đếm, giờ lượt sớm nhất, nút xem', () => {
    const html = render({ outage: outage() })
    expect(html).toContain('Vừa có mạng lại')
    expect(html).toContain('Có 3 lượt món gọi lúc mất mạng (từ 19:52). Hỏi lại khách trước khi duyệt; đã nhập tay rồi thì Từ chối.')
    expect(html).toContain('Xem lượt chờ duyệt')
    expect(html).not.toContain('tự vào bếp')
  })
  it('có mạng lại, chỉ có đơn tự vào bếp: câu kiểm tra bếp, không có nút xem', () => {
    const html = render({ outage: outage({ review: 0, autoKitchen: 2 }) })
    expect(html).toContain('Có 2 đơn tự vào bếp lúc mất mạng: kiểm tra bếp đã có phiếu chưa.')
    expect(html).not.toContain('Xem lượt chờ duyệt')
  })
  it('có mạng lại nhưng không có lượt món nào trong khoảng: không vẽ gì', () => {
    expect(render({ outage: outage({ review: 0, autoKitchen: 0, firstAt: null }) })).toBe('')
  })
})
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd admin-web && npm run test -- app/admin/pos/offline-banner.test.tsx`
Expected: FAIL (không tìm thấy `./offline-banner`).

- [ ] **Step 3: Viết `offline-banner.tsx`** bằng `Banner` + `Button` của `@/components/ui/feedback`, `@/components/ui/button`, bọc ngoài `<div className="mx-4 mt-2 space-y-2 md:mx-5">` như `PrintStatusBanner`.
  - Đang mất mạng (`downSince !== null`): `<Banner tone="error" title={`Mất mạng từ ${clock(downSince)}`}>` + câu thân đúng như test. Không vẽ gì khác.
  - Ngược lại, `outage` có `review > 0` hoặc `autoKitchen > 0`: `<Banner tone="warning" title="Vừa có mạng lại" onClose={onDismiss}>`; thân gồm câu lượt chờ duyệt (khi `review > 0`, giờ = `clock(firstAt)`) và / hoặc câu tự vào bếp (khi `autoKitchen > 0`), mỗi câu một dòng; `action` = nút "Xem lượt chờ duyệt" gọi `onShowOrders`, chỉ khi `review > 0`.

- [ ] **Step 4: Viết `use-offline-watch.ts`.** `useReducer` trên `OfflineState` với hai action (`{ live, now }` → `nextOfflineState`, `dismiss` → `dismissOutage`). Một effect phụ thuộc `live` phát action với `Date.now()`. Một effect thứ hai: khi `state.downSince !== null` và chưa đủ ngưỡng, đặt `setTimeout` tới đúng `downSince + OFFLINE_NOTICE_MS` để vẽ lại (đồng hồ `useNow` nhịp 30 giây là không đủ sát); khi tab quay lại (`visibilitychange`) cũng vẽ lại. `downSince` trả ra = `offlineSince(state, Date.now())`. Không `localStorage`, không gọi mạng. Comment đầu tệp: tải lại trang giữa lúc mất mạng thì mất mốc, nhãn chờ 10 phút (Task 3) là lưới đỡ cho trường hợp đó.

- [ ] **Step 5: Nối vào `pos-client.tsx`.**
  - Ngay sau `const live = online && connected && error?.source !== 'reload'`: `const offlineWatch = useOfflineWatch(live)`; và `const outageInfo = useMemo(() => offlineWatch.outage ? { ...offlineWatch.outage, ...outageOrders(sessions, offlineWatch.outage) } : null, [offlineWatch.outage, sessions])`.
  - Ngay trước `<PrintStatusBanner`: `<OfflineBanner downSince={offlineWatch.downSince} outage={outageInfo} onDismiss={offlineWatch.dismiss} onShowOrders={() => openWork('orders')} />`.
  - Không sửa dòng nào khác của tệp. Nếu `sessions` không khớp kiểu `OutageSession[]` thì nới kiểu ở `pos-offline-watch.ts`, không ép kiểu ở chỗ gọi.

- [ ] **Step 6: Chạy test + kiểm kiểu + lint**

Run: `cd admin-web && npm run test -- app/admin/pos/offline-banner.test.tsx lib/pos-offline-watch.test.ts && npx tsc --noEmit && npm run lint`
Expected: test PASS; `tsc` và lint không có lỗi mới (so với trước task).

- [ ] **Step 7: Nhìn tận mắt** (luật "đừng đoán, hãy nhìn"). Chạy app (`python scripts/run.py start`), mở `/admin/pos` của Bảo Lương, trong DevTools đặt Network = Offline hơn 60 giây → thấy băng đỏ "Mất mạng từ HH:MM" ngay dưới thanh trên; bật lại → băng đỏ tắt. Chụp `python scripts/ui_shot.py /admin/pos pos-mat-mang` nếu chụp được trạng thái đó, không thì ghi lại bằng lời trong báo cáo.

- [ ] **Step 8: Commit**

```bash
git add admin-web/app/admin/pos/use-offline-watch.ts admin-web/app/admin/pos/offline-banner.tsx admin-web/app/admin/pos/offline-banner.test.tsx admin-web/app/admin/pos/pos-client.tsx
git commit -m "feat: POS báo mất mạng sau 60 giây và nhắc lượt món gọi lúc mất mạng khi có mạng lại"
```

---

### Task 3: Nhãn "Gọi lúc HH:MM · đã chờ N phút" cho lượt món chờ lâu

Nhãn này độc lập với băng ở Task 2: POS vừa được mở lại (không biết đã mất mạng) vẫn thấy lượt món nào đã chờ lâu.

**Files:**
- Modify: `admin-web/app/admin/pos/work-queue.tsx` (thẻ `item.kind === 'order'`, dòng giờ ~166)
- Modify: `admin-web/app/admin/pos/bill-panel.tsx` (`PosBillPanelProps` thêm `now: number`; thẻ lượt chờ duyệt, dòng giờ ~416)
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (truyền `now={now}` cho `<PosBillPanel`)
- Modify: các test đang dựng `PosBillPanel` (`order-rejection-ui.test.tsx`, `bill-discount-ui.test.tsx`, `confirm-dialog.test.tsx`, `free-table-panel.test.tsx`): thêm prop `now` cho đủ kiểu
- Test: `admin-web/app/admin/pos/stale-order-ui.test.tsx`

**Interfaces:**
- Consumes (Task 1): `staleOrderLabel(createdAt: number, now: number): string | null`.
- Produces: prop bắt buộc `now: number` trên `PosBillPanelProps`.

- [ ] **Step 1: Viết test (đỏ)** — `stale-order-ui.test.tsx`. Chép cách dựng `session` + props của `order-rejection-ui.test.tsx` (cùng thư mục) rồi viết bốn ca, `now = Date.parse('2026-11-18T13:00:00Z')`, đơn chờ duyệt có `created_at` là `2026-11-18T12:40:00Z` (chờ 20 phút) hoặc `2026-11-18T12:55:00Z` (chờ 5 phút):

```tsx
it('Việc cần xử lý: lượt chờ 20 phút hiện nhãn gọi lúc', () => {
  expect(renderQueue('2026-11-18T12:40:00Z')).toContain('Gọi lúc 19:40 · đã chờ 20 phút')
})
it('Việc cần xử lý: lượt chờ 5 phút giữ nhãn cũ', () => {
  const html = renderQueue('2026-11-18T12:55:00Z')
  expect(html).not.toContain('Gọi lúc')
  expect(html).toContain('19:55 · 5 phút')
})
it('Bảng bill, thẻ chờ duyệt: lượt chờ 20 phút hiện nhãn gọi lúc', () => {
  expect(renderBill('2026-11-18T12:40:00Z')).toContain('Gọi lúc 19:40 · đã chờ 20 phút')
})
it('Bảng bill, thẻ chờ duyệt: lượt chờ 5 phút không có nhãn', () => {
  expect(renderBill('2026-11-18T12:55:00Z')).not.toContain('Gọi lúc')
})
```

`renderQueue(createdAt)` dựng `WorkQueue` với `items = buildWorkQueue({ …, now })` và `now`; `renderBill(createdAt)` dựng `PosBillPanel` ở thẻ đang hiện lượt chờ duyệt, với `now`.

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd admin-web && npm run test -- app/admin/pos/stale-order-ui.test.tsx`
Expected: FAIL (chưa có chữ "Gọi lúc"; `PosBillPanel` chưa nhận `now`).

- [ ] **Step 3: Sửa `work-queue.tsx`.** Dòng giờ của thẻ lượt món thành `staleOrderLabel(item.since, now) ?? \`${clock(item.since)} · ${waitLabel(item.since, now)}\``. Chỉ thẻ `kind === 'order'`; thẻ gọi nhân viên / đặt bàn giữ nguyên.

- [ ] **Step 4: Sửa `bill-panel.tsx` + chỗ gọi.** Thêm `now: number` vào `PosBillPanelProps`. Ở thẻ lượt chờ duyệt (khối `pending.map`), chỗ đang in `gio(o.created_at)`: có nhãn thì in nhãn bằng chữ đậm màu hổ phách (`font-semibold text-amber-700`), không thì giữ nguyên như cũ. Dòng lượt đã duyệt bên dưới không đổi. `pos-client.tsx` truyền `now={now}`. Thêm `now` vào các test cũ đang dựng `PosBillPanel`.

- [ ] **Step 5: Chạy toàn bộ test admin-web + kiểm kiểu**

Run: `cd admin-web && npm run test && npx tsc --noEmit`
Expected: PASS toàn bộ, không lỗi kiểu.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/pos
git commit -m "feat: lượt món chờ duyệt từ 10 phút hiện nhãn 'Gọi lúc … · đã chờ …' ở POS"
```

---

### Task 4: Tờ quy trình A4, tài liệu, checklist test — rồi DỪNG

**Files:**
- Create: `docs/van-hanh/quy-trinh-mat-mang.html`
- Create: `docs/testing/mat-mang/DOT-1.md`
- Create: `docs/features/mat-mang-dot-1.md`
- Modify: `TESTING.md` (thêm một dòng mục lục ở nhóm đang chờ)
- Modify: `docs/PROJECT.md` (mục "Phạm vi giai đoạn tới" + dòng "Ý tưởng đã hoãn")
- Modify: `docs/decisions.md` (một dòng cuối bảng chính)

**Interfaces:**
- Consumes: hành vi của Task 1–3. Produces: không có mã.

- [ ] **Step 1: Viết `docs/van-hanh/quy-trinh-mat-mang.html`.** Một tệp HTML tự đứng (CSS viết trong tệp, không tải gì từ mạng), `@page { size: A4; margin: 12mm }`, **vừa đúng một trang A4** khi in, chữ thân tối thiểu 11pt, tiêu đề từng ô đậm, có dòng "Bản Đợt 1 — chưa có Quầy dự phòng" ở chân trang. Nội dung đúng như sau (đây là bản quy trình **làm bằng giấy + 4G**; bản có Quầy dự phòng thuộc Đợt 2):

```
KHI QUẦY MẤT MẠNG                                  Quán: ____________

CHUẨN BỊ SẴN Ở QUẦY: bảng giá in · sổ phiếu 2 liên · bút · cách bật mạng 4G dự phòng: ______________

① RỚT DƯỚI 1 PHÚT — chờ
• Nút vừa bấm báo "Lỗi kết nối": chờ nhãn "Trực tuyến" xanh lại rồi bấm lại ngay trên MEVO POS. Không bị trùng món, không thu tiền hai lần.

② QUÁ 1 PHÚT — POS hiện băng đỏ "Mất mạng từ …"
• Thu ngân báo bộ đàm: "Quầy mất mạng, ghi món vào giấy, đừng gửi qua máy."
• Người phụ trách bật mạng 4G dự phòng cho máy quầy. Có mạng lại thì dùng POS như thường.

③ CHƯA CÓ MẠNG MÀ VẪN PHẢI BÁN — làm bằng giấy
• Việc vừa bấm trên POS đúng lúc rớt mạng: ghi ra giấy "bàn nào, vừa bấm gì". Máy có thể đã nhận rồi.
• Gọi món: nhân viên ghi phiếu 2 liên (bàn, giờ, món, số lượng). Một liên đưa Bếp / Nướng / Bar, một liên về quầy.
• Bàn muốn về: thu ngân cộng tay theo bảng giá, nhận TIỀN MẶT. Ghi lên liên ở quầy: ĐÃ THU, số tiền, giờ.
• Khách muốn chuyển khoản: chỉ cho về khi đã thấy tiền về trên điện thoại của quán.
• KHÔNG kết ca khi quầy đang mất mạng, kể cả kết hộ bằng điện thoại.

④ KHI CÓ MẠNG LẠI — làm theo thứ tự
1. Nhập các phiếu giấy vào POS theo thứ tự giờ (bàn đang mở: Thêm món; bàn mới: Khách lẻ). Bếp không in lại phiếu.
2. Bàn có ghi "vừa bấm lúc rớt mạng": mở bill, thấy hai lượt giống nhau thì bỏ một.
3. POS báo "Có N lượt món gọi lúc mất mạng": bộ đàm hỏi lại khách. Còn dùng → Duyệt. Không dùng nữa, hoặc đã nhập tay rồi → Từ chối.
4. Phiếu in báo lỗi / hết hạn: bếp đã làm rồi thì Bỏ qua, chưa làm thì In lại.
5. Bàn đã thu tiền bằng giấy: thu trên POS đúng số đã nhận.
6. Mất mạng cả tối: sáng hôm sau làm bước 1–5 trước, rồi kết ca tối hôm trước, rồi mới mở ca mới. Tiền tối đó nằm trong báo cáo của ngày hôm sau.
```

- [ ] **Step 2: Kiểm tờ in.** Mở tệp bằng trình duyệt, Ctrl+P, khổ A4: đúng **1 trang**, không chữ nào bị cắt. Ghi kết quả vào báo cáo.

- [ ] **Step 3: Viết `docs/testing/mat-mang/DOT-1.md`** — checklist test tay trên **Bảo Lương** (theo mẫu các tệp trong `docs/testing/pos-so-do-ban/`), mỗi bài có Bước / Mong đợi / ô PASS-FAIL:
  1. Ngày thường: mở POS 2 phút, không có băng nào mới; nhãn "Trực tuyến" như cũ.
  2. Rớt ngắn: tắt Wi-Fi 30 giây rồi bật → **không** có băng đỏ, không có băng "Vừa có mạng lại".
  3. Mất mạng: tắt Wi-Fi 2 phút → sau khoảng 1 phút hiện băng đỏ "Mất mạng từ HH:MM" đúng giờ tắt; không có nút đóng.
  4. Gọi món lúc mất mạng: trong lúc bài 3 còn tắt, dùng điện thoại bằng 4G gửi một đơn nhân viên (`/staff`) cho một bàn đang mở → bật Wi-Fi → băng đỏ tắt, hiện "Vừa có mạng lại. Có 1 lượt món gọi lúc mất mạng (từ HH:MM)…"; bấm "Xem lượt chờ duyệt" mở Việc cần xử lý đúng bộ lọc; Duyệt / Từ chối chạy như cũ; bấm đóng thì băng mất.
  5. Chập chờn: tắt 70 giây, bật 10 giây, tắt 70 giây, bật → băng "Vừa có mạng lại" vẫn tính lượt món của cả hai lần tắt.
  6. Nhãn chờ: để một lượt món chờ duyệt quá 10 phút (hoặc tải lại POS sau bài 4 mà chưa duyệt, chờ đủ 10 phút) → thẻ ở Việc cần xử lý và thẻ chờ duyệt trong bill đều ghi "Gọi lúc HH:MM · đã chờ N phút"; lượt mới gửi thì không có nhãn.
  7. Tải lại trang giữa lúc mất mạng rồi có mạng: không có băng "Vừa có mạng lại" (đã biết, chấp nhận), nhưng nhãn bài 6 vẫn có.
  8. Tờ quy trình: in `docs/van-hanh/quy-trinh-mat-mang.html` ra A4, đúng 1 trang, anh Tú đọc và sửa chữ nếu cần (đặc biệt ô ③ về chuyển khoản và bảng giá in).

- [ ] **Step 4: Tài liệu.**
  - `docs/features/mat-mang-dot-1.md`: tính năng làm gì, tệp chính (4 tệp mã + tờ quy trình), cách kiểm tay (trỏ về checklist), giới hạn đã biết (tải lại trang là mất mốc; đồng hồ máy quầy lệch quá 2 phút thì đếm có thể thiếu).
  - `TESTING.md`: thêm dòng `- ⏳ [Mất mạng Đợt 1 — POS báo mất mạng + tờ quy trình](docs/testing/mat-mang/DOT-1.md) — chờ anh Tú test 8 bài`.
  - `docs/PROJECT.md`: thêm mục 7 vào "Phạm vi giai đoạn tới": "Xử lý mất mạng tạm thời theo `docs/superpowers/specs/2026-11-18-xu-ly-mat-mang-tam-thoi-design.md` (anh Tú duyệt 2026-11-18): Đợt 1 trước 01/12; Đợt 2 (Quầy dự phòng trong MEVO In) chỉ lên nếu thử đạt với 4 máy in ngày 24–25/11; Đợt 3 (tiền mặt lúc mất mạng) sau go-live." Ở dòng "Ý tưởng đã hoãn" bỏ hai cụm "cảnh báo đơn dồn sau mất mạng" và "POS offline". Dòng "không offline-first" giữ nguyên.
  - `docs/decisions.md`: một dòng cuối bảng chính, ngày 2026-11-18: mất mạng xử lý ba lớp (chờ → 4G → Quầy dự phòng trong MEVO In), chia ba đợt, POS báo sau 60 giây / nhãn chờ 10 phút, nguồn luật ở `admin-web/lib/pos-offline-watch.ts`.

- [ ] **Step 5: Kiểm toàn bộ**

Run: `python scripts/verify.py`
Expected: xanh, hoặc chỉ còn "nợ cũ" đã có từ trước (không tăng).

- [ ] **Step 6: Commit**

```bash
git add docs TESTING.md
git commit -m "docs: tờ quy trình mất mạng A4, checklist test Đợt 1, cập nhật phạm vi dự án"
```

- [ ] **Step 7: DỪNG.** Mở sẵn admin-web của worktree bằng `preview_start`, đưa link, và nói với anh Tú: "Xong rồi anh, test theo `docs/testing/mat-mang/DOT-1.md` — bài 1 đến 8 nhé". Chờ "PASS". Không tự chuyển sang Đợt 2, không push `main`, không deploy.

---

## Ngoài phạm vi plan này (ghi để không ai làm nhầm)

- Mọi thứ của Quầy dự phòng, MEVO In, bảng nhật ký, RPC mới: Đợt 2.
- Băng nhắc "món nhập lúc mất mạng chưa vào bill hết", nhãn "Kiểm tra trùng": Đợt 2 (cần dữ liệu từ máy chủ).
- Tiền mặt lúc mất mạng, chặn kết ca: Đợt 3.
- Câu thân của băng đỏ đổi thành "…mở Quầy dự phòng ở MEVO In" khi Đợt 2 lên; hiện tại là "…làm theo tờ quy trình mất mạng".
