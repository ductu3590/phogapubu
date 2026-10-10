# PA-1 — Bánh răng, chuông, Báo cáo ngày — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút ⚙ Cài đặt trên rail, cho chủ quán chọn kiểu chuông (theo quán) + âm lượng (theo máy), và thay tab Báo cáo bằng Báo cáo ngày theo bill.

**Architecture:** Kiểu chuông là cột `stores.bell_style`, được "bơm" vào module `lib/bell.ts` bằng một component `BellStyleSync` đặt ở layout admin / staff và trong màn bếp; âm lượng đọc localStorage mỗi lần kêu. Báo cáo ngày là MỘT RPC chỉ đọc `get_daily_report` (SECURITY DEFINER, tính tiền ở server, ngày theo giờ VN); trang `/admin/dashboard` là server component đọc `?date=` và chỉ hiển thị.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase Postgres (RPC plpgsql), Tailwind, lucide-react, Vitest 4 (node, alias `@`).

**Spec:** `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` (mục PA-1)

## Global Constraints

- Mọi chữ người dùng thấy: tiếng Việt. Comment logic phức tạp: tiếng Việt.
- Không hardcode ID / key / URL.
- Màu: nút chính cam (`orange-600/700`); màu trạng thái lấy từ `components/ui/status.ts`; font/icon có sẵn (lucide).
- Tiền tính ở server; client chỉ hiển thị. Số tiền là `integer` VNĐ, hiển thị bằng `formatVND`.
- Ngày báo cáo theo `Asia/Ho_Chi_Minh`.
- Migration: file mới, số kế tiếp (091, 092). Áp prod bằng Supabase MCP `apply_migration` (project `dlkgdpexjtyynbotkwka`) — được phép tự chạy. File có `CREATE OR REPLACE` hàm sống không được ghi "rerun-safe".
- Không poll bằng server action trên trang có điều hướng mềm (quyết định 2026-10-04).
- localStorage: mọi đọc/ghi bọc try/catch, lỗi thì dùng mặc định.
- Commit format `feat: ...` / `fix: ...` / `docs: ...`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Lệnh chạy từ `admin-web/`: test `npx vitest run <file>`, type-check `npx tsc --noEmit`, lint `npx eslint <files>`.

## Review Focus

1. **Bill gộp N mâm** (đóng bằng `close_table_sessions_bulk`) phải ra **một dòng** trong danh sách bill với tổng chung — không phải N dòng, không đếm trùng tiền. → test SQL ở Task 4 Step 4.
2. **Đơn trả trước của Pubu** (không có phiên, `payment_instrument = 'wallet'` hoặc `NULL`) vẫn phải vào tổng thực thu, rơi vào cột "Ví / khác" chứ không lọt mất. → test SQL Task 4 Step 4 + test TS `instrumentLabel` Task 5.
3. **Đổi sang ngày cũ / ngày tương lai**: ngày tương lai bị chặn ở UI và RPC trả rỗng hợp lệ; thẻ "Đang mở" chỉ hiện khi xem hôm nay. → test `isViewingToday`/`clampReportDate` Task 5.
4. **Kiểu chuông `repeat` không được kêu mãi**: thao tác bất kỳ trên trang hoặc hàng việc rỗng → dừng; có trần an toàn 5 phút. → test `createRepeater` Task 2.
5. **localStorage hỏng / giá trị rác** (`"abc"`, `"250"`, ném lỗi) → âm lượng 80, kẹp 0–100, không crash. → test `readVolume` Task 2.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `admin-web/app/admin/admin-nav.tsx` (sửa) | Thêm `adminBottomItems()` (⚙ Cài đặt); bỏ "Cài đặt quán" khỏi `adminMoreItems` |
| `admin-web/components/ui/icon-rail-shell.tsx` (sửa) | Prop mới `bottomItems` vẽ ngay trên ô "Thêm"; ngăn kéo điện thoại hiện chúng đầu nhóm Thiết lập |
| `admin-web/lib/bell-settings.ts` (mới) | Hàm thuần: kiểu chuông, đọc/ghi âm lượng, quy đổi gain, bộ lặp chuông |
| `admin-web/lib/bell.ts` (sửa) | Phát âm theo kiểu + âm lượng; `setBellStyle`, `stopBell`, `previewBell` |
| `admin-web/components/bell-style-sync.tsx` (mới) | Client component bơm `bell_style` vào `lib/bell.ts` |
| `admin-web/components/bell-volume-control.tsx` (mới) | Thanh trượt âm lượng + Nghe thử (dùng ở Cài đặt và POS) |
| `admin-web/app/admin/settings/bell-settings-section.tsx` (mới) | Khối "Âm thanh thông báo" trong tab Cấu hình quán |
| `admin-web/lib/actions/store.ts` (sửa) | Server action `saveBellStyle` |
| `supabase/migrations/091_store_bell_style.sql` (mới) | Cột `stores.bell_style` |
| `supabase/migrations/092_daily_report.sql` (mới) | RPC `get_daily_report` |
| `admin-web/lib/daily-report.ts` (mới) | Kiểu dữ liệu + parse JSON RPC + hàm thuần ngày / nhãn |
| `admin-web/lib/actions/daily-report.ts` (mới) | Gọi RPC từ server component |
| `admin-web/app/admin/dashboard/page.tsx` (thay) | Trang Báo cáo ngày |
| `admin-web/app/admin/dashboard/report-date-picker.tsx` (mới) | Chọn ngày (không quá hôm nay) |
| `admin-web/app/admin/@modal/(config)/(.)dashboard/page.tsx` (sửa) | Chuyển tiếp `searchParams` |
| `docs/testing/pos-admin-complete/PA-1.md` (mới) | Checklist test tay |

---

### Task 1: Nút ⚙ Cài đặt trên rail

**Files:**
- Modify: `admin-web/app/admin/admin-nav.tsx`
- Modify: `admin-web/components/ui/icon-rail-shell.tsx`
- Modify: `admin-web/app/admin/layout.tsx`
- Test: `admin-web/app/admin/admin-nav.test.tsx`

**Interfaces:**
- Produces: `adminBottomItems(): AppNavItem[]`; `adminNavGroups(reservationsEnabled, kitchenEnabled)` giờ gồm 3 nhóm (rail, bottom, more); `IconRailShell` nhận prop tuỳ chọn `bottomItems?: AppNavItem[]`.

- [ ] **Step 1: Sửa test cho hành vi mới**

Trong `admin-nav.test.tsx`: sửa import và bài "Đặt bàn nằm trong ô Thêm", thêm 2 bài mới.

```tsx
import { adminBottomItems, adminMoreItems, adminNavGroups, adminRailItems } from './admin-nav'
```

Thay khối `expect(adminMoreItems(false)...toEqual([...]))` bằng:

```tsx
    expect(adminMoreItems(false).map((item) => item.href)).toEqual([
      '/admin/tables', '/admin/staff', '/admin/vouchers', '/admin/spin', '/admin/account',
    ])
```

Thêm vào cuối `describe`:

```tsx
  it('Cài đặt quán là nút ⚙ riêng ngay trên ô Thêm, không còn trong Thêm', () => {
    expect(adminBottomItems().map((item) => item.href)).toEqual(['/admin/settings'])
    expect(adminMoreItems(true).map((item) => item.href)).not.toContain('/admin/settings')
  })

  it('đang ở trang cài đặt thì sáng nút ⚙', () => {
    expect(findActiveHref('/admin/settings', adminNavGroups(false))).toBe('/admin/settings')
  })
```

Bài "không mất trang nào" giữ nguyên (tập href không đổi).

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npx vitest run app/admin/admin-nav.test.tsx`
Expected: FAIL — `adminBottomItems` is not exported / danh sách Thêm còn `/admin/settings`.

- [ ] **Step 3: Sửa `admin-nav.tsx`**

Trong `adminMoreItems` xoá dòng `{ href: '/admin/settings', label: 'Cài đặt quán', icon: <Settings /> },`. Thêm hàm mới và sửa `adminNavGroups`:

```tsx
// Nút ⚙ Cài đặt (PA-1, 2026-10-07): nằm riêng ngay trên ô "Thêm" — chủ quán mở cấu hình
// thường xuyên hơn các mục trong Thêm, không bắt bấm 2 lần.
export function adminBottomItems(): AppNavItem[] {
  return [{ href: '/admin/settings', label: 'Cài đặt', icon: <Settings /> }]
}

/** Toàn bộ mục (cho dò mục đang chọn và test). */
export function adminNavGroups(reservationsEnabled = false, kitchenEnabled = true): AppNavGroup[] {
  return [
    { items: adminRailItems(kitchenEnabled) },
    { items: adminBottomItems() },
    { items: adminMoreItems(reservationsEnabled) },
  ]
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npx vitest run app/admin/admin-nav.test.tsx`
Expected: PASS (6 bài).

- [ ] **Step 5: `IconRailShell` nhận `bottomItems`**

Trong `components/ui/icon-rail-shell.tsx`:

1. Thêm prop vào chữ ký và kiểu:

```tsx
  bottomItems = [],
```
```tsx
  /** Mục cố định ngay trên ô "Thêm" (⚙ Cài đặt). */
  bottomItems?: AppNavItem[]
```

2. `activeHref` dò cả 3 nhóm:

```tsx
  const activeHref = findActiveHref(pathname, [{ items: [...items, ...bottomItems, ...moreItems] }])
```

3. Ngay TRƯỚC `<div ref={moreRef} className="relative mt-2">` chèn:

```tsx
        {bottomItems.length > 0 && (
          <ul className="mt-2 flex flex-col items-center gap-1.5">{bottomItems.map(railLink)}</ul>
        )}
```

4. Trong ngăn kéo điện thoại, danh sách Thiết lập hiện bottom trước:

```tsx
          <ul className="flex flex-col gap-0.5">{[...bottomItems, ...moreItems].map((i) => listLink(i, () => setDrawerOpen(false)))}</ul>
```

- [ ] **Step 6: Truyền vào từ layout**

`app/admin/layout.tsx`: import `adminBottomItems` và thêm prop `bottomItems={adminBottomItems()}` vào `<IconRailShell ...>`.

- [ ] **Step 7: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint app/admin/admin-nav.tsx components/ui/icon-rail-shell.tsx app/admin/layout.tsx`
Expected: không lỗi.

- [ ] **Step 8: Commit**

```bash
git add admin-web/app/admin/admin-nav.tsx admin-web/app/admin/admin-nav.test.tsx admin-web/components/ui/icon-rail-shell.tsx admin-web/app/admin/layout.tsx
git commit -m "feat: nut Cai dat rieng tren o Them (PA-1)"
```

---

### Task 2: Thư viện chuông theo kiểu + âm lượng

**Files:**
- Create: `admin-web/lib/bell-settings.ts`
- Test: `admin-web/lib/bell-settings.test.ts`
- Modify: `admin-web/lib/bell.ts`

**Interfaces:**
- Produces (bell-settings.ts):
  - `type BellStyle = 'double' | 'soft' | 'repeat'`
  - `BELL_STYLES: ReadonlyArray<{ value: BellStyle; label: string; hint: string }>`
  - `parseBellStyle(v: unknown): BellStyle` (rác → `'double'`)
  - `VOLUME_KEY = 'mevo_bell_volume'`, `DEFAULT_VOLUME = 80`
  - `type KeyValueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `readVolume(storage: KeyValueStorage | null): number` (0–100)
  - `writeVolume(storage: KeyValueStorage | null, v: number): number` (trả giá trị đã kẹp)
  - `peakGain(style: BellStyle, volume: number): number`
  - `createRepeater(opts: { play: () => void; intervalMs: number; maxMs: number; now: () => number; setTimer: (fn: () => void, ms: number) => unknown; clearTimer: (h: unknown) => void }): { start(): void; stop(): void; running(): boolean }`
- Produces (bell.ts): `playBell(): void` (giữ chữ ký cũ), `setBellStyle(s: BellStyle): void`, `getBellStyle(): BellStyle`, `stopBell(): void`, `previewBell(style?: BellStyle): void`, `unlockBell()` giữ nguyên.

- [ ] **Step 1: Viết test hàm thuần**

`admin-web/lib/bell-settings.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createRepeater, parseBellStyle, peakGain, readVolume, writeVolume, DEFAULT_VOLUME, VOLUME_KEY } from './bell-settings'

function memory(init: Record<string, string> = {}) {
  const data = { ...init }
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v }, data }
}
const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }

describe('kiểu chuông', () => {
  it('nhận đúng 3 kiểu, rác thì về double', () => {
    expect(parseBellStyle('soft')).toBe('soft')
    expect(parseBellStyle('repeat')).toBe('repeat')
    expect(parseBellStyle('double')).toBe('double')
    expect(parseBellStyle('xyz')).toBe('double')
    expect(parseBellStyle(null)).toBe('double')
  })
})

describe('âm lượng theo máy', () => {
  it('chưa chỉnh → 80', () => expect(readVolume(memory())).toBe(DEFAULT_VOLUME))
  it('không có storage / storage ném lỗi → 80', () => {
    expect(readVolume(null)).toBe(80)
    expect(readVolume(broken)).toBe(80)
  })
  it('giá trị rác → 80; ngoài khoảng → kẹp', () => {
    expect(readVolume(memory({ [VOLUME_KEY]: 'abc' }))).toBe(80)
    expect(readVolume(memory({ [VOLUME_KEY]: '250' }))).toBe(100)
    expect(readVolume(memory({ [VOLUME_KEY]: '-5' }))).toBe(0)
    expect(readVolume(memory({ [VOLUME_KEY]: '35' }))).toBe(35)
  })
  it('ghi kẹp 0–100, làm tròn, storage hỏng không ném', () => {
    const m = memory()
    expect(writeVolume(m, 120.4)).toBe(100)
    expect(m.data[VOLUME_KEY]).toBe('100')
    expect(writeVolume(m, 42.6)).toBe(43)
    expect(() => writeVolume(broken, 50)).not.toThrow()
  })
})

describe('độ to đỉnh', () => {
  it('âm lượng 0 → im hẳn', () => expect(peakGain('double', 0)).toBe(0))
  it('80% kiểu chuẩn ≈ tiếng cũ (0.25)', () => expect(peakGain('double', 80)).toBeCloseTo(0.25, 5))
  it('gõ nhẹ nhỏ hơn chuẩn cùng âm lượng', () => expect(peakGain('soft', 80)).toBeLessThan(peakGain('double', 80)))
  it('không vượt 0.32 ở 100%', () => expect(peakGain('double', 100)).toBeLessThanOrEqual(0.32))
})

describe('chuông lặp (kiểu repeat)', () => {
  function rig() {
    let t = 0
    const timers = new Map<number, { fn: () => void; at: number }>()
    let id = 0
    const play = vi.fn()
    const r = createRepeater({
      play, intervalMs: 3000, maxMs: 300_000, now: () => t,
      setTimer: (fn, ms) => { id += 1; timers.set(id, { fn, at: t + ms }); return id },
      clearTimer: (h) => { timers.delete(h as number) },
    })
    const advance = (ms: number) => {
      const end = t + ms
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0]
        if (!next || next[1].at > end) break
        timers.delete(next[0]); t = next[1].at; next[1].fn()
      }
      t = end
    }
    return { r, play, advance }
  }

  it('kêu ngay rồi lặp mỗi 3 giây', () => {
    const { r, play, advance } = rig()
    r.start()
    expect(play).toHaveBeenCalledTimes(1)
    advance(9000)
    expect(play).toHaveBeenCalledTimes(4)
  })
  it('stop là im, start lần 2 khi đang chạy không nhân đôi', () => {
    const { r, play, advance } = rig()
    r.start(); r.start()
    expect(play).toHaveBeenCalledTimes(1)
    r.stop()
    advance(10_000)
    expect(play).toHaveBeenCalledTimes(1)
    expect(r.running()).toBe(false)
  })
  it('trần an toàn 5 phút: tự dừng dù không ai bấm', () => {
    const { r, advance } = rig()
    r.start()
    advance(301_000)
    expect(r.running()).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy test, phải FAIL**

Run: `npx vitest run lib/bell-settings.test.ts`
Expected: FAIL — cannot find module `./bell-settings`.

- [ ] **Step 3: Viết `lib/bell-settings.ts`**

```ts
// Thiết lập chuông báo (PA-1, 2026-10-07) — phần THUẦN, không đụng Web Audio để test được ở node.
// - Kiểu chuông: theo QUÁN (stores.bell_style), chủ quán chọn ở Cài đặt.
// - Âm lượng: theo MÁY (localStorage) — loa máy quầy và điện thoại nhân viên to nhỏ khác nhau.

export type BellStyle = 'double' | 'soft' | 'repeat'

export const BELL_STYLES: ReadonlyArray<{ value: BellStyle; label: string; hint: string }> = [
  { value: 'double', label: 'Ding-dong kép (chuẩn)', hint: 'Hai tiếng ngắn, đủ nghe giữa quán ồn' },
  { value: 'soft', label: 'Gõ nhẹ (không gây ồn)', hint: 'Một tiếng nhỏ, hợp quán yên tĩnh' },
  { value: 'repeat', label: 'Báo liên tục tới khi nhận', hint: 'Lặp mỗi 3 giây cho tới khi có người chạm màn hình' },
]

export function parseBellStyle(v: unknown): BellStyle {
  return v === 'soft' || v === 'repeat' || v === 'double' ? v : 'double'
}

export const VOLUME_KEY = 'mevo_bell_volume'
export const DEFAULT_VOLUME = 80

export type KeyValueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void }

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function readVolume(storage: KeyValueStorage | null): number {
  if (!storage) return DEFAULT_VOLUME
  try {
    const raw = storage.getItem(VOLUME_KEY)
    if (raw === null) return DEFAULT_VOLUME
    const n = Number(raw)
    return Number.isFinite(n) ? clamp(n) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

export function writeVolume(storage: KeyValueStorage | null, v: number): number {
  const value = clamp(v)
  try { storage?.setItem(VOLUME_KEY, String(value)) } catch { /* bỏ qua: chế độ ẩn danh / chặn storage */ }
  return value
}

// 80% kiểu chuẩn = 0.25 — đúng độ to của chuông cũ để quán không thấy tiếng đổi khi chưa chỉnh gì.
const BASE_PEAK: Record<BellStyle, number> = { double: 0.3125, soft: 0.16, repeat: 0.3125 }

export function peakGain(style: BellStyle, volume: number): number {
  return BASE_PEAK[style] * (clamp(volume) / 100)
}

/**
 * Bộ lặp cho kiểu "Báo liên tục": kêu ngay, rồi mỗi intervalMs một lần, tự dừng sau maxMs
 * (trần an toàn — không bao giờ kêu cả buổi nếu không ai ở quầy).
 */
export function createRepeater(opts: {
  play: () => void
  intervalMs: number
  maxMs: number
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (h: unknown) => void
}) {
  let handle: unknown = null
  let startedAt = 0
  const tick = () => {
    if (opts.now() - startedAt >= opts.maxMs) { handle = null; return }
    opts.play()
    handle = opts.setTimer(tick, opts.intervalMs)
  }
  return {
    start() {
      if (handle !== null) return
      startedAt = opts.now()
      tick()
    },
    stop() {
      if (handle !== null) opts.clearTimer(handle)
      handle = null
    },
    running() {
      return handle !== null
    },
  }
}
```

- [ ] **Step 4: Chạy test, phải PASS**

Run: `npx vitest run lib/bell-settings.test.ts`
Expected: PASS (tất cả).

- [ ] **Step 5: Viết lại `lib/bell.ts`**

Giữ nguyên `ctx`, `isRunning`, `getCtx`, `unlockBell`. Thay phần `playBell` bằng:

```ts
import { createRepeater, parseBellStyle, peakGain, readVolume, type BellStyle } from './bell-settings'

let style: BellStyle = 'double'

function localStore() {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

/** Gọi khi biết kiểu chuông của quán (BellStyleSync). Đổi kiểu thì dừng chuông lặp đang chạy. */
export function setBellStyle(s: BellStyle): void {
  const next = parseBellStyle(s)
  if (next !== style) stopBell()
  style = next
}

export function getBellStyle(): BellStyle {
  return style
}

function tone(c: AudioContext, freq: number, at: number, peak: number, length: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  // Vào/ra êm: bật tắt gain đột ngột sẽ nghe "tạch" ở loa rẻ tiền.
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length - 0.02)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(at)
  osc.stop(at + length)
}

/** Phát MỘT lần theo kiểu cho trước (không lặp). */
function ring(s: BellStyle): void {
  const c = getCtx()
  if (!c || c.state !== 'running') return
  const peak = peakGain(s, readVolume(localStore()))
  if (peak <= 0) return
  const now = c.currentTime
  if (s === 'soft') {
    tone(c, 1046, now, peak, 0.22)
    return
  }
  // double + repeat: hai tiếng "ting" ngắn — đủ nghe giữa quán ồn, không chói như còi báo động.
  tone(c, 880, now, peak, 0.18)
  tone(c, 1320, now + 0.18, peak, 0.18)
}

// Kiểu "Báo liên tục": lặp 3 giây/lần, tự dừng khi có người chạm/gõ trên trang hoặc sau 5 phút.
const repeater = createRepeater({
  play: () => ring('double'),
  intervalMs: 3000,
  maxMs: 5 * 60_000,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
})

function onPresence() {
  stopBell()
}

/** Dừng chuông lặp (gọi khi hàng việc rỗng). Không làm gì nếu không có chuông nào đang lặp. */
export function stopBell(): void {
  repeater.stop()
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointerdown', onPresence, true)
    window.removeEventListener('keydown', onPresence, true)
  }
}

/** Có việc mới → kêu theo kiểu của quán. Chữ ký giữ nguyên để mọi chỗ gọi cũ chạy như trước. */
export function playBell(): void {
  if (style !== 'repeat') {
    ring(style)
    return
  }
  if (repeater.running()) return
  repeater.start()
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', onPresence, true)
    window.addEventListener('keydown', onPresence, true)
  }
}

/** Nút "Nghe thử": luôn phát MỘT lần, kể cả kiểu repeat. */
export function previewBell(s: BellStyle = style): void {
  void unlockBell().then(() => ring(s === 'repeat' ? 'double' : s))
}
```

Sửa comment đầu file: thêm dòng "Kiểu chuông theo quán (setBellStyle), âm lượng theo máy (bell-settings.ts)."

- [ ] **Step 6: Màn bếp dùng chung `lib/bell.ts`**

Trong `app/kitchen/[storeSlug]/kitchen-display.tsx`:
- Xoá `sharedAudioCtx`, `getAudioCtx`, `unlockBellAudio`, hàm `playBell` cục bộ (khối "Âm thanh thông báo đơn mới" dòng ~26–67).
- Thêm `import { playBell, unlockBell } from '@/lib/bell'`.
- Đổi 3 chỗ gọi `unlockBellAudio()` thành `void unlockBell()`.
- 3 chỗ `playBell()` giữ nguyên tên.

- [ ] **Step 7: Kiểm**

Run: `npx vitest run lib/ && npx tsc --noEmit && npx eslint lib/bell.ts lib/bell-settings.ts "app/kitchen/[storeSlug]/kitchen-display.tsx"`
Expected: PASS / không lỗi. (`lib/reservation-reminders.test.ts` vẫn PASS — nó tiêm `playBell` giả.)

- [ ] **Step 8: Commit**

```bash
git add admin-web/lib/bell.ts admin-web/lib/bell-settings.ts admin-web/lib/bell-settings.test.ts "admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx"
git commit -m "feat: chuong theo kieu + am luong theo may, man bep dung chung lib/bell (PA-1)"
```

---

### Task 3: Cột `bell_style`, đồng bộ vào các màn, khối cài đặt + loa trên POS

**Files:**
- Create: `supabase/migrations/091_store_bell_style.sql`
- Create: `admin-web/components/bell-style-sync.tsx`
- Create: `admin-web/components/bell-volume-control.tsx`
- Create: `admin-web/app/admin/settings/bell-settings-section.tsx`
- Modify: `admin-web/lib/actions/store.ts`
- Modify: `admin-web/app/admin/settings/page.tsx`
- Modify: `admin-web/app/admin/layout.tsx`
- Modify: `admin-web/app/staff/layout.tsx`
- Modify: `admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx`
- Modify: `admin-web/app/admin/pos/pos-client.tsx`
- Modify: `admin-web/app/staff/tables/service-request-queue.tsx`

**Interfaces:**
- Consumes: `setBellStyle`, `stopBell`, `previewBell` (Task 2); `BELL_STYLES`, `readVolume`, `writeVolume`, `parseBellStyle`, `BellStyle` (Task 2).
- Produces: `saveBellStyle(style: BellStyle): Promise<{ ok: true } | { ok: false; error: string }>`; `<BellStyleSync style={string|null} />`; `<BellVolumeControl compact?: boolean />`.

- [ ] **Step 1: Migration 091**

`supabase/migrations/091_store_bell_style.sql`:

```sql
-- 091 (PA-1, 2026-10-07): kiểu chuông báo của quán. Âm lượng KHÔNG ở đây — mỗi máy tự chỉnh (localStorage).
-- Cột thường trên stores: anon / kitchen / authenticated đã có SELECT cả bảng nên màn bếp đọc được ngay.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS bell_style text NOT NULL DEFAULT 'double';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_bell_style_check;
ALTER TABLE public.stores
  ADD CONSTRAINT stores_bell_style_check CHECK (bell_style IN ('double', 'soft', 'repeat'));

COMMENT ON COLUMN public.stores.bell_style IS 'Kiểu chuông báo việc mới: double (chuẩn) | soft (gõ nhẹ) | repeat (lặp tới khi có người).';
```

- [ ] **Step 2: Áp prod + kiểm**

Gọi MCP `apply_migration` (name `store_bell_style`, query = nội dung file). Sau đó `execute_sql`:

```sql
select bell_style, count(*) from stores group by 1;
select has_column_privilege('anon', 'public.stores', 'bell_style', 'SELECT') anon_ok;
```

Expected: mọi quán `double`; `anon_ok = true`. Nếu `anon_ok = false` thì màn bếp không đọc được — dừng lại báo anh Tú (không tự GRANT).

- [ ] **Step 3: Server action `saveBellStyle`**

Cuối `lib/actions/store.ts`:

```ts
import { parseBellStyle, type BellStyle } from '@/lib/bell-settings'

// Kiểu chuông báo của quán (PA-1). Chỉ chủ quán; giá trị lạ bị chặn ở đây lẫn CHECK của DB.
export async function saveBellStyle(style: BellStyle): Promise<{ ok: true } | { ok: false; error: string }> {
  const storeId = await getStoreId()
  if (parseBellStyle(style) !== style) return { ok: false, error: 'Kiểu chuông không hợp lệ' }
  const { error } = await createAdminClient().from('stores').update({ bell_style: style }).eq('id', storeId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
```

(Đặt `import` lên nhóm import đầu file.)

- [ ] **Step 4: `BellStyleSync`**

`admin-web/components/bell-style-sync.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { setBellStyle } from '@/lib/bell'
import { parseBellStyle } from '@/lib/bell-settings'

// Đưa kiểu chuông của quán (stores.bell_style) vào lib/bell — đặt một lần ở layout, mọi chỗ gọi
// playBell() trong khu đó tự kêu đúng kiểu. Không vẽ gì.
export default function BellStyleSync({ style }: { style: string | null | undefined }) {
  useEffect(() => { setBellStyle(parseBellStyle(style)) }, [style])
  return null
}
```

- [ ] **Step 5: Gắn vào layout admin, layout staff, màn bếp**

- `app/admin/layout.tsx`: đổi `select('name')` thành `select('name, bell_style')`; trong JSX, ngay trước `{modal}` thêm `<BellStyleSync style={storeResult.data?.bell_style as string | undefined} />` (import `BellStyleSync from '@/components/bell-style-sync'`).
- `app/staff/layout.tsx`: đổi `select('name')` thành `select('name, bell_style')`; thêm `<BellStyleSync style={store?.bell_style as string | undefined} />` ngay trong `<div>` gốc, trước `<header>`.
- `kitchen-display.tsx`: đổi `.select('id, name, slug')` thành `.select('id, name, slug, bell_style')`; ngay sau khi có `storeData` (sau khối `if (storeErr || !storeData)`) thêm `setBellStyle(parseBellStyle((storeData as { bell_style?: string }).bell_style))` và import `setBellStyle` từ `@/lib/bell`, `parseBellStyle` từ `@/lib/bell-settings`.

- [ ] **Step 6: `BellVolumeControl`**

`admin-web/components/bell-volume-control.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { previewBell } from '@/lib/bell'
import { readVolume, writeVolume, DEFAULT_VOLUME } from '@/lib/bell-settings'

function store() {
  try { return window.localStorage } catch { return null }
}

// Âm lượng chuông TRÊN MÁY NÀY (localStorage) + nút Nghe thử. Lưu ngay khi kéo, không cần nút Lưu.
export default function BellVolumeControl() {
  // Giá trị thật chỉ đọc được ở trình duyệt → lần vẽ đầu dùng mặc định rồi cập nhật.
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  useEffect(() => { setVolume(readVolume(store())) }, [])

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3">
        {volume === 0 ? <VolumeX className="size-5 shrink-0 text-slate-400" aria-hidden /> : <Volume2 className="size-5 shrink-0 text-slate-600" aria-hidden />}
        <span className="sr-only">Âm lượng trên máy này</span>
        <input
          type="range" min={0} max={100} step={5} value={volume}
          onChange={(e) => setVolume(writeVolume(store(), Number(e.target.value)))}
          className="h-2 w-full cursor-pointer accent-orange-600"
        />
        <span className="w-11 shrink-0 text-right text-sm font-medium text-slate-700 tabular">{volume}%</span>
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-slate-500">Mỗi máy chỉnh riêng</p>
        <Button type="button" onClick={() => previewBell()}>Nghe thử</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Khối "Âm thanh thông báo" trong Cài đặt**

`admin-web/app/admin/settings/bell-settings-section.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import BellVolumeControl from '@/components/bell-volume-control'
import { previewBell, setBellStyle } from '@/lib/bell'
import { BELL_STYLES, type BellStyle } from '@/lib/bell-settings'
import { saveBellStyle } from '@/lib/actions/store'
import { cn } from '@/lib/utils'

export default function BellSettingsSection({ initial }: { initial: BellStyle }) {
  const [style, setStyle] = useState<BellStyle>(initial)
  const [saved, setSaved] = useState<BellStyle>(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () => start(async () => {
    setError(null)
    const res = await saveBellStyle(style)
    if (!res.ok) { setError(res.error); return }
    setSaved(style)
    setBellStyle(style)
  })

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Kiểu chuông của quán</legend>
        {BELL_STYLES.map((s) => (
          <label key={s.value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', style === s.value ? 'border-orange-600 bg-orange-50' : 'border-border')}>
            <input type="radio" name="bell_style" value={s.value} checked={style === s.value} onChange={() => { setStyle(s.value); previewBell(s.value) }} className="mt-1 accent-orange-600" />
            <span>
              <span className="block text-sm font-medium text-foreground">{s.label}</span>
              <span className="block text-[13px] text-muted">{s.hint}</span>
            </span>
          </label>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <Button type="button" variant="primary" disabled={pending || style === saved} onClick={save}>
            {pending ? 'Đang lưu…' : 'Lưu kiểu chuông'}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : style === saved ? <p className="text-[13px] text-muted">Áp dụng cho mọi máy của quán</p> : null}
        </div>
      </fieldset>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Âm lượng trên máy này</p>
        <BellVolumeControl />
      </div>
    </div>
  )
}
```

`app/admin/settings/page.tsx`: thêm `bell_style` vào chuỗi `select(...)` của `stores`; import `BellSettingsSection` và `parseBellStyle`; thêm section mới giữa "Thông tin quán" và "Quy trình vận hành":

```tsx
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Âm thanh thông báo</h2>
            <BellSettingsSection initial={parseBellStyle(store?.bell_style)} />
          </section>
```

- [ ] **Step 8: Nút loa trên POS + dừng chuông lặp khi hàng việc rỗng**

Trong `app/admin/pos/pos-client.tsx`:
1. Import `Volume2` (lucide), `stopBell` từ `@/lib/bell`, `BellVolumeControl` từ `@/components/bell-volume-control`.
2. State: `const [volumeOpen, setVolumeOpen] = useState(false)`.
3. Sau dòng `const workTotal = workItems.length` thêm:

```tsx
  // Kiểu chuông "Báo liên tục": hết việc chờ thì im ngay, không đợi người chạm màn hình.
  useEffect(() => { if (workTotal === 0) stopBell() }, [workTotal])
```

4. Trong cụm nút bên phải thanh trên (div `flex flex-wrap items-center gap-2` có nút "Đặt bàn mới"), thêm ở ĐẦU:

```tsx
            <div className="relative">
              <IconButton icon={<Volume2 />} label="Âm lượng chuông" aria-expanded={volumeOpen} onClick={() => setVolumeOpen((v) => !v)} />
              {volumeOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-modal">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Âm lượng chuông trên máy này</p>
                  <BellVolumeControl />
                  <div className="mt-2 flex justify-end"><Button type="button" variant="ghost" onClick={() => setVolumeOpen(false)}>Đóng</Button></div>
                </div>
              )}
            </div>
```

(Đảm bảo `IconButton`, `Button` đã được import từ `@/components/ui/button`; thêm nếu thiếu.)

Trong `app/staff/tables/service-request-queue.tsx`: import `stopBell`; thêm `useEffect(() => { if (requests.length === 0) stopBell() }, [requests.length])`.

- [ ] **Step 9: Kiểm**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib components app/admin/settings app/admin/pos/pos-client.tsx app/admin/layout.tsx app/staff "app/kitchen/[storeSlug]/kitchen-display.tsx"`
Expected: PASS / không lỗi.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/091_store_bell_style.sql admin-web/components/bell-style-sync.tsx admin-web/components/bell-volume-control.tsx admin-web/app/admin/settings admin-web/lib/actions/store.ts admin-web/app/admin/layout.tsx admin-web/app/staff/layout.tsx "admin-web/app/kitchen/[storeSlug]/kitchen-display.tsx" admin-web/app/admin/pos/pos-client.tsx admin-web/app/staff/tables/service-request-queue.tsx
git commit -m "feat: chon kieu chuong theo quan, am luong theo may, nut loa tren POS (PA-1, mig 091)"
```

---

### Task 4: RPC `get_daily_report` (mig 092)

**Files:**
- Create: `supabase/migrations/092_daily_report.sql`

**Interfaces:**
- Produces: `public.get_daily_report(p_store_id uuid, p_date date) RETURNS jsonb`:

```jsonc
{
  "date": "2026-10-07",
  "totals": { "revenue": 0, "cash": 0, "bank": 0, "other": 0, "bills_count": 0 },
  "open": { "tables_count": 0, "provisional_total": 0 },
  "bills": [ { "key": "S:…", "paid_at": "…", "session_ids": ["…"], "order_ids": ["…"],
               "table_label": "Bàn 3, Bàn 4", "items_count": 7, "total": 520000,
               "instrument": "cash|bank|other|mixed", "received_by_name": "…|null", "merged": false } ],
  "adjustments": [ { "at": "…", "table_label": "Bàn 2", "item_name": "Bia hơi (Tháp)", "quantity": 1,
                     "amount": 180000, "type": "cancelled|gift", "reason": "…", "by_name": "…|null" } ]
}
```

Luật (khớp `lib/revenue.ts` `hasRealMoney`):
- Có tiền thật = `status <> 'cancelled'` và (`payment_received_at` có giá trị, hoặc legacy `payment_method='cash' AND status='paid'`).
- Thời điểm nhận tiền = `payment_received_at`, legacy thì `COALESCE(completed_at, updated_at)`.
- Nhóm tiền: `payment_instrument` `cash`→cash, `bank`→bank; `NULL` + `payment_method='cash'`→cash, `NULL` + `bank_transfer`→bank; còn lại (ví / momo / vnpay / không rõ)→other.
- Một bill = các đơn có tiền trong ngày cùng khoá: đơn thuộc phiên đã đóng → `closed_by@closed_at` (gộp bill N mâm chạy trong MỘT transaction nên `now()` trùng nhau → tự gộp một dòng); phiên chưa đóng → `S:<session_id>`; đơn không phiên → `O:<order_id>`.

- [ ] **Step 1: Viết migration**

`supabase/migrations/092_daily_report.sql`:

```sql
-- 092 (PA-1, 2026-10-07): Báo cáo NGÀY theo bill cho tab Báo cáo (thay dashboard cũ).
-- Chỉ ĐỌC. Tiền tính ở đây, client chỉ hiển thị. Ngày theo giờ Việt Nam.
-- Luật "tiền thật" phải khớp admin-web/lib/revenue.ts (hasRealMoney).
-- PA-2 sẽ CREATE OR REPLACE hàm này ở file riêng để đổi kiểm quyền sang is_store_pos_operator.

CREATE OR REPLACE FUNCTION public.get_daily_report(p_store_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from timestamptz := (p_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_to   timestamptz := ((p_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_totals jsonb;
  v_open jsonb;
  v_bills jsonb;
  v_adjust jsonb;
BEGIN
  IF p_store_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Thiếu quán hoặc ngày';
  END IF;
  IF NOT public.is_store_owner_of(p_store_id) THEN
    RAISE EXCEPTION 'Không có quyền xem báo cáo quán này';
  END IF;

  -- Đơn có tiền thật, nhận trong ngày.
  CREATE TEMP TABLE IF NOT EXISTS _dr_money (
    id uuid, session_id uuid, table_id uuid, order_type text, total_amount integer,
    received_at timestamptz, bucket text, received_by uuid, bill_key text
  ) ON COMMIT DROP;
  TRUNCATE _dr_money;

  INSERT INTO _dr_money
  SELECT o.id, o.session_id, o.table_id, o.order_type, o.total_amount, m.received_at,
         CASE
           WHEN o.payment_instrument = 'cash' THEN 'cash'
           WHEN o.payment_instrument = 'bank' THEN 'bank'
           WHEN o.payment_instrument IS NULL AND o.payment_method = 'cash' THEN 'cash'
           WHEN o.payment_instrument IS NULL AND o.payment_method = 'bank_transfer' THEN 'bank'
           ELSE 'other'
         END,
         o.payment_received_by,
         CASE
           WHEN o.session_id IS NOT NULL AND s.closed_at IS NOT NULL
             THEN 'C:' || COALESCE(s.closed_by::text, '-') || '@' || s.closed_at::text
           WHEN o.session_id IS NOT NULL THEN 'S:' || o.session_id::text
           ELSE 'O:' || o.id::text
         END
  FROM public.orders o
  LEFT JOIN public.table_sessions s ON s.id = o.session_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(o.payment_received_at, o.completed_at, o.updated_at) AS received_at
  ) m
  WHERE o.store_id = p_store_id
    AND o.status <> 'cancelled'
    AND (o.payment_received_at IS NOT NULL OR (o.payment_method = 'cash' AND o.status = 'paid'))
    AND m.received_at >= v_from AND m.received_at < v_to;

  SELECT jsonb_build_object(
           'revenue', COALESCE(SUM(total_amount), 0),
           'cash',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'cash'), 0),
           'bank',    COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'bank'), 0),
           'other',   COALESCE(SUM(total_amount) FILTER (WHERE bucket = 'other'), 0),
           'bills_count', COUNT(DISTINCT bill_key))
  INTO v_totals
  FROM _dr_money;

  -- Bàn đang có khách lúc gọi (không phụ thuộc ngày) + tạm tính các đơn chưa thu của phiên đang mở.
  SELECT jsonb_build_object(
           'tables_count', (
             SELECT COUNT(*) FROM public.session_tables st
             JOIN public.table_sessions s ON s.id = st.session_id
             WHERE s.store_id = p_store_id AND s.status = 'open' AND st.is_open),
           'provisional_total', (
             SELECT COALESCE(SUM(o.total_amount), 0) FROM public.orders o
             JOIN public.table_sessions s ON s.id = o.session_id
             WHERE s.store_id = p_store_id AND s.status = 'open'
               AND o.status <> 'cancelled' AND o.rejected_at IS NULL
               AND o.payment_received_at IS NULL))
  INTO v_open;

  SELECT COALESCE(jsonb_agg(b ORDER BY b->>'paid_at' DESC), '[]'::jsonb)
  INTO v_bills
  FROM (
    SELECT jsonb_build_object(
      'key', g.bill_key,
      'paid_at', g.paid_at,
      'session_ids', to_jsonb(g.session_ids),
      'order_ids', to_jsonb(g.order_ids),
      'merged', COALESCE(array_length(g.session_ids, 1), 0) > 1,
      'total', g.total,
      'instrument', g.instrument,
      'items_count', (
        SELECT COALESCE(SUM(oi.quantity), 0) FROM public.order_items oi
        WHERE oi.order_id = ANY(g.order_ids) AND oi.void_type IS DISTINCT FROM 'cancelled'),
      'table_label', COALESCE(
        (SELECT string_agg(DISTINCT t.table_number, ', ')
           FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
          WHERE st.session_id = ANY(g.session_ids)),
        (SELECT string_agg(DISTINCT t.table_number, ', ')
           FROM public.orders o JOIN public.tables t ON t.id = o.table_id
          WHERE o.id = ANY(g.order_ids)),
        CASE g.order_type WHEN 'pickup' THEN 'Mang về' WHEN 'delivery' THEN 'Ship' ELSE '—' END),
      'received_by_name', (
        SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
        FROM auth.users u WHERE u.id = g.received_by)
    ) AS b
    FROM (
      SELECT bill_key,
             MAX(received_at) AS paid_at,
             SUM(total_amount)::bigint AS total,
             CASE WHEN COUNT(DISTINCT bucket) = 1 THEN MIN(bucket) ELSE 'mixed' END AS instrument,
             COALESCE(array_agg(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL), '{}') AS session_ids,
             array_agg(id) AS order_ids,
             (array_agg(received_by) FILTER (WHERE received_by IS NOT NULL))[1] AS received_by,
             MIN(order_type) AS order_type
      FROM _dr_money
      GROUP BY bill_key
    ) g
  ) x;

  SELECT COALESCE(jsonb_agg(a ORDER BY a->>'at' DESC), '[]'::jsonb)
  INTO v_adjust
  FROM (
    SELECT jsonb_build_object(
      'at', oi.voided_at,
      'item_name', oi.item_name,
      'quantity', oi.quantity,
      'amount', (oi.item_price + COALESCE(tp.price, 0)) * oi.quantity,
      'type', oi.void_type,
      'reason', oi.void_reason,
      'table_label', COALESCE(
        (SELECT string_agg(DISTINCT t.table_number, ', ')
           FROM public.session_tables st JOIN public.tables t ON t.id = st.table_id
          WHERE st.session_id = o.session_id),
        (SELECT t.table_number FROM public.tables t WHERE t.id = o.table_id),
        '—'),
      'by_name', (
        SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email)
        FROM auth.users u WHERE u.id = oi.voided_by)
    ) AS a
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN LATERAL (
      SELECT SUM(COALESCE((tp->>'price')::integer, 0)) AS price
      FROM jsonb_array_elements(COALESCE(oi.selected_toppings, '[]'::jsonb)) tp
    ) tp ON true
    WHERE o.store_id = p_store_id
      AND oi.void_type IS NOT NULL
      AND oi.voided_at >= v_from AND oi.voided_at < v_to
  ) y;

  RETURN jsonb_build_object(
    'date', p_date,
    'totals', v_totals,
    'open', v_open,
    'bills', v_bills,
    'adjustments', v_adjust
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_daily_report(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_report(uuid, date) TO authenticated;
```

Lưu ý khi chạy: hàm `STABLE` không được tạo bảng tạm. Nếu Postgres báo lỗi `CREATE TABLE is not allowed in a non-volatile function`, đổi `STABLE` thành `VOLATILE` (hàm vẫn chỉ đọc dữ liệu thật; bảng tạm `ON COMMIT DROP`). Ghi lý do vào comment đầu hàm.

- [ ] **Step 2: Áp prod**

MCP `apply_migration` name `daily_report`, query = nội dung file.

- [ ] **Step 3: Kiểm quyền**

`execute_sql` (chạy như service role → `auth.uid()` NULL → phải bị chặn):

```sql
select public.get_daily_report((select id from stores where slug like '%bao-luong%' limit 1), current_date);
```

Expected: lỗi `Không có quyền xem báo cáo quán này`.

- [ ] **Step 4: Kiểm số liệu bằng giả lập đăng nhập chủ quán**

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from mevo_operators where role='store_owner'
     and store_id=(select id from stores where slug like '%bao-luong%' limit 1) limit 1),
  'role','authenticated')::text, true);
set local role authenticated;
-- chọn một ngày gần nhất có bill trả sau đã thu
select d::date as ngay,
       r->'totals' as totals,
       jsonb_array_length(r->'bills') as so_bill,
       (select count(*) from jsonb_array_elements(r->'bills') b where (b->>'merged')::boolean) as bill_gop
from (select (max(payment_received_at) at time zone 'Asia/Ho_Chi_Minh')::date d
        from orders where store_id=(select id from stores where slug like '%bao-luong%' limit 1)) x,
     lateral (select public.get_daily_report((select id from stores where slug like '%bao-luong%' limit 1), x.d) r) y;
rollback;
```

Đối chiếu tay bằng service role:

```sql
select sum(total_amount) filter (where payment_instrument='cash') cash,
       sum(total_amount) filter (where payment_instrument='bank') bank,
       count(distinct coalesce(s.closed_by::text||'@'||s.closed_at::text, o.id::text)) bills
from orders o left join table_sessions s on s.id=o.session_id
where o.store_id=(select id from stores where slug like '%bao-luong%' limit 1)
  and o.status<>'cancelled' and o.payment_received_at is not null
  and (o.payment_received_at at time zone 'Asia/Ho_Chi_Minh')::date = <ngày ở trên>;
```

Expected: `totals.cash`/`totals.bank`/`bills_count` khớp. Làm tương tự 1 ngày có đơn Pubu (`wallet`) để thấy `other > 0` và `revenue = cash + bank + other` (Review Focus #2). Nếu prod chưa từng có lần "Gộp bill" thì ghi vào checklist PA-1 để anh Tú gộp thử 2 mâm rồi xem báo cáo (Review Focus #1).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/092_daily_report.sql
git commit -m "feat: RPC get_daily_report bao cao ngay theo bill (PA-1, mig 092)"
```

---

### Task 5: Kiểu dữ liệu + hàm thuần báo cáo

**Files:**
- Create: `admin-web/lib/daily-report.ts`
- Test: `admin-web/lib/daily-report.test.ts`
- Create: `admin-web/lib/actions/daily-report.ts`

**Interfaces:**
- Produces (lib/daily-report.ts):
  - `type ReportInstrument = 'cash' | 'bank' | 'other' | 'mixed'`
  - `type DailyReportBill = { key: string; paidAt: string; sessionIds: string[]; orderIds: string[]; merged: boolean; total: number; instrument: ReportInstrument; itemsCount: number; tableLabel: string; receivedByName: string | null }`
  - `type DailyReportAdjustment = { at: string; itemName: string; quantity: number; amount: number; type: 'cancelled' | 'gift'; reason: string | null; tableLabel: string; byName: string | null }`
  - `type DailyReport = { date: string; totals: { revenue: number; cash: number; bank: number; other: number; billsCount: number }; open: { tablesCount: number; provisionalTotal: number }; bills: DailyReportBill[]; adjustments: DailyReportAdjustment[] }`
  - `parseDailyReport(raw: unknown): DailyReport`
  - `vnToday(now: Date): string` (YYYY-MM-DD giờ VN)
  - `clampReportDate(input: string | undefined, now: Date): string` (rỗng / sai / tương lai → hôm nay)
  - `isViewingToday(date: string, now: Date): boolean`
  - `instrumentLabel(i: ReportInstrument): string`
- Produces (lib/actions/daily-report.ts): `loadDailyReport(date: string): Promise<{ ok: true; report: DailyReport } | { ok: false; error: string }>`

- [ ] **Step 1: Viết test**

`admin-web/lib/daily-report.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clampReportDate, instrumentLabel, isViewingToday, parseDailyReport, vnToday } from './daily-report'

// 2026-10-07 23:30 giờ VN = 16:30 UTC
const lateNight = new Date('2026-10-07T16:30:00Z')
// 2026-10-08 00:30 giờ VN = 2026-10-07 17:30 UTC
const afterMidnight = new Date('2026-10-07T17:30:00Z')

describe('ngày báo cáo theo giờ Việt Nam', () => {
  it('hôm nay tính theo VN, không theo UTC', () => {
    expect(vnToday(lateNight)).toBe('2026-10-07')
    expect(vnToday(afterMidnight)).toBe('2026-10-08')
  })
  it('rỗng / sai định dạng / ngày tương lai → hôm nay', () => {
    expect(clampReportDate(undefined, lateNight)).toBe('2026-10-07')
    expect(clampReportDate('abc', lateNight)).toBe('2026-10-07')
    expect(clampReportDate('2026-13-40', lateNight)).toBe('2026-10-07')
    expect(clampReportDate('2026-10-09', lateNight)).toBe('2026-10-07')
  })
  it('ngày cũ hợp lệ giữ nguyên', () => {
    expect(clampReportDate('2026-09-30', lateNight)).toBe('2026-09-30')
  })
  it('thẻ "Đang mở" chỉ khi xem hôm nay', () => {
    expect(isViewingToday('2026-10-07', lateNight)).toBe(true)
    expect(isViewingToday('2026-10-06', lateNight)).toBe(false)
  })
})

describe('nhãn phương thức', () => {
  it('đủ 4 loại', () => {
    expect(instrumentLabel('cash')).toBe('Tiền mặt')
    expect(instrumentLabel('bank')).toBe('Chuyển khoản')
    expect(instrumentLabel('other')).toBe('Ví / khác')
    expect(instrumentLabel('mixed')).toBe('Nhiều phương thức')
  })
})

describe('đọc JSON từ RPC', () => {
  it('đổi snake_case → camelCase, số chuỗi → number', () => {
    const r = parseDailyReport({
      date: '2026-10-07',
      totals: { revenue: '700000', cash: 500000, bank: 200000, other: 0, bills_count: 2 },
      open: { tables_count: 3, provisional_total: 420000 },
      bills: [{ key: 'C:x@y', paid_at: '2026-10-07T12:00:00Z', session_ids: ['s1', 's2'], order_ids: ['o1'], merged: true,
        total: 500000, instrument: 'cash', items_count: 7, table_label: 'Bàn 3, Bàn 4', received_by_name: null }],
      adjustments: [{ at: '2026-10-07T11:00:00Z', item_name: 'Bia', quantity: 2, amount: 40000, type: 'gift',
        reason: 'Khách quen', table_label: 'Bàn 2', by_name: 'Chị Lan' }],
    })
    expect(r.totals).toEqual({ revenue: 700000, cash: 500000, bank: 200000, other: 0, billsCount: 2 })
    expect(r.open).toEqual({ tablesCount: 3, provisionalTotal: 420000 })
    expect(r.bills[0]).toMatchObject({ merged: true, itemsCount: 7, tableLabel: 'Bàn 3, Bàn 4', sessionIds: ['s1', 's2'] })
    expect(r.adjustments[0]).toMatchObject({ type: 'gift', byName: 'Chị Lan', amount: 40000 })
  })
  it('thiếu mảng / null → mảng rỗng, số 0; instrument lạ → other', () => {
    const r = parseDailyReport({ date: '2026-10-07', totals: null, open: null, bills: [{ instrument: 'zzz' }], adjustments: null })
    expect(r.totals.revenue).toBe(0)
    expect(r.open.tablesCount).toBe(0)
    expect(r.adjustments).toEqual([])
    expect(r.bills[0].instrument).toBe('other')
  })
})
```

- [ ] **Step 2: Chạy, phải FAIL**

Run: `npx vitest run lib/daily-report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Viết `lib/daily-report.ts`**

```ts
// Báo cáo ngày (PA-1): kiểu dữ liệu + đọc JSON của RPC get_daily_report + hàm ngày giờ VN.
// Tiền đã tính ở server — ở đây chỉ đổi tên trường / ép kiểu, KHÔNG cộng trừ gì.

export type ReportInstrument = 'cash' | 'bank' | 'other' | 'mixed'

export type DailyReportBill = {
  key: string; paidAt: string; sessionIds: string[]; orderIds: string[]; merged: boolean
  total: number; instrument: ReportInstrument; itemsCount: number; tableLabel: string; receivedByName: string | null
}

export type DailyReportAdjustment = {
  at: string; itemName: string; quantity: number; amount: number
  type: 'cancelled' | 'gift'; reason: string | null; tableLabel: string; byName: string | null
}

export type DailyReport = {
  date: string
  totals: { revenue: number; cash: number; bank: number; other: number; billsCount: number }
  open: { tablesCount: number; provisionalTotal: number }
  bills: DailyReportBill[]
  adjustments: DailyReportAdjustment[]
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string')

function instrument(v: unknown): ReportInstrument {
  return v === 'cash' || v === 'bank' || v === 'mixed' ? v : 'other'
}

export function parseDailyReport(raw: unknown): DailyReport {
  const r = obj(raw)
  const t = obj(r.totals)
  const o = obj(r.open)
  return {
    date: str(r.date),
    totals: { revenue: num(t.revenue), cash: num(t.cash), bank: num(t.bank), other: num(t.other), billsCount: num(t.bills_count) },
    open: { tablesCount: num(o.tables_count), provisionalTotal: num(o.provisional_total) },
    bills: arr(r.bills).map((b0) => {
      const b = obj(b0)
      return {
        key: str(b.key), paidAt: str(b.paid_at), sessionIds: strArr(b.session_ids), orderIds: strArr(b.order_ids),
        merged: b.merged === true, total: num(b.total), instrument: instrument(b.instrument),
        itemsCount: num(b.items_count), tableLabel: str(b.table_label) || '—', receivedByName: strOrNull(b.received_by_name),
      }
    }),
    adjustments: arr(r.adjustments).map((a0) => {
      const a = obj(a0)
      return {
        at: str(a.at), itemName: str(a.item_name), quantity: num(a.quantity), amount: num(a.amount),
        type: a.type === 'gift' ? 'gift' : 'cancelled', reason: strOrNull(a.reason),
        tableLabel: str(a.table_label) || '—', byName: strOrNull(a.by_name),
      }
    }),
  }
}

export function vnToday(now: Date): string {
  // en-CA cho ra đúng YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function clampReportDate(input: string | undefined, now: Date): string {
  const today = vnToday(now)
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return today
  const d = new Date(`${input}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) return today
  return input > today ? today : input
}

export function isViewingToday(date: string, now: Date): boolean {
  return date === vnToday(now)
}

export function instrumentLabel(i: ReportInstrument): string {
  return { cash: 'Tiền mặt', bank: 'Chuyển khoản', other: 'Ví / khác', mixed: 'Nhiều phương thức' }[i]
}
```

- [ ] **Step 4: Chạy, phải PASS**

Run: `npx vitest run lib/daily-report.test.ts`
Expected: PASS.

- [ ] **Step 5: Loader server**

`admin-web/lib/actions/daily-report.ts`:

```ts
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { parseDailyReport, type DailyReport } from '@/lib/daily-report'

// Gọi bằng phiên đăng nhập (không dùng service key): RPC tự kiểm quyền theo auth.uid().
// PA-2 đổi guard ở đây sang "chủ quán hoặc thu ngân".
export async function loadDailyReport(date: string): Promise<{ ok: true; report: DailyReport } | { ok: false; error: string }> {
  const storeId = await requireStoreOwnerStoreId()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_daily_report', { p_store_id: storeId, p_date: date })
  if (error) return { ok: false, error: error.message }
  return { ok: true, report: parseDailyReport(data) }
}
```

Nếu `server-only` chưa có trong `package.json` (kiểm `grep server-only admin-web/package.json`), bỏ dòng import đó.

- [ ] **Step 6: Kiểm + commit**

Run: `npx tsc --noEmit && npx eslint lib/daily-report.ts lib/actions/daily-report.ts`

```bash
git add admin-web/lib/daily-report.ts admin-web/lib/daily-report.test.ts admin-web/lib/actions/daily-report.ts
git commit -m "feat: doc du lieu bao cao ngay + ham ngay gio VN (PA-1)"
```

---

### Task 6: Trang Báo cáo ngày

**Files:**
- Modify (thay toàn bộ): `admin-web/app/admin/dashboard/page.tsx`
- Create: `admin-web/app/admin/dashboard/report-date-picker.tsx`
- Modify: `admin-web/app/admin/@modal/(config)/(.)dashboard/page.tsx`

**Interfaces:**
- Consumes: `loadDailyReport`, `clampReportDate`, `isViewingToday`, `instrumentLabel`, `DailyReport*` (Task 5); `formatVND`; `Badge`, `Card`, `PageHeader`, `EmptyState`, `ErrorState`, `getButtonClasses`.

- [ ] **Step 1: Bộ chọn ngày**

`admin-web/app/admin/dashboard/report-date-picker.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Chọn ngày xem báo cáo — không cho chọn ngày tương lai (max = hôm nay giờ VN, tính ở server).
export default function ReportDatePicker({ value, max, showRefresh }: { value: string; max: string; showRefresh: boolean }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2">
      <input
        type="date" value={value} max={max} aria-label="Ngày báo cáo"
        onChange={(e) => { if (e.target.value) router.replace(`?date=${e.target.value}`) }}
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
      />
      {showRefresh && <Button type="button" icon={<RotateCw />} onClick={() => router.refresh()}>Làm mới</Button>}
    </div>
  )
}
```

(`router.replace` để không chất lịch sử — hộp thoại đóng vẫn về đúng POS.)

- [ ] **Step 2: Trang**

Thay toàn bộ `admin-web/app/admin/dashboard/page.tsx`:

```tsx
import { Banknote, Gift, Landmark, Printer, Receipt, Undo2, Users, Wallet } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { loadDailyReport } from '@/lib/actions/daily-report'
import { clampReportDate, instrumentLabel, isViewingToday, vnToday, type DailyReportBill } from '@/lib/daily-report'
import { formatVND, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { getButtonClasses } from '@/components/ui/button-classes'
import ReportDatePicker from './report-date-picker'

// Báo cáo NGÀY theo bill (PA-1, 2026-10-07) — thay dashboard cũ. Chưa có khái niệm "ca".
// Mọi con số lấy nguyên từ RPC get_daily_report; trang này chỉ hiển thị.
export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const now = new Date()
  const { date: rawDate } = await searchParams
  const date = clampReportDate(rawDate, now)
  const today = isViewingToday(date, now)
  const res = await loadDailyReport(date)

  const title = new Date(`${date}T00:00:00+07:00`).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <PageHeader
          title="Báo cáo ngày"
          description={today ? `Hôm nay · ${title}` : title}
          action={<ReportDatePicker value={date} max={vnToday(now)} showRefresh={today} />}
        />

        {!res.ok ? (
          <ErrorState title="Không tải được báo cáo">{res.error}</ErrorState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={<Wallet />} label="Tổng thực thu" value={formatVND(res.report.totals.revenue)}
                note={`${res.report.totals.billsCount} bill${res.report.totals.other > 0 ? ` · trong đó ${formatVND(res.report.totals.other)} ví / khác` : ''}`} />
              <Stat icon={<Banknote />} label="Tiền mặt" value={formatVND(res.report.totals.cash)} note="Đối chiếu với két" />
              <Stat icon={<Landmark />} label="Chuyển khoản" value={formatVND(res.report.totals.bank)} note="Đối chiếu app ngân hàng" />
              {today ? (
                <Stat icon={<Users />} label="Đang mở · chưa thu" value={`${res.report.open.tablesCount} bàn`}
                  note={`Tạm tính ${formatVND(res.report.open.provisionalTotal)}`} attention={res.report.open.tablesCount > 0} />
              ) : (
                <Stat icon={<Receipt />} label="Số bill" value={String(res.report.totals.billsCount)} note="Đã thu trong ngày" />
              )}
            </div>

            <Card title={`Bill đã thu (${res.report.bills.length})`} flush>
              {res.report.bills.length === 0 ? (
                <EmptyState>Chưa có bill nào được thu trong ngày này.</EmptyState>
              ) : (
                <ul className="divide-y divide-border">{res.report.bills.map((b) => <BillRow key={b.key} bill={b} />)}</ul>
              )}
            </Card>

            <Card title={`Điều chỉnh bill (${res.report.adjustments.length})`} flush>
              {res.report.adjustments.length === 0 ? (
                <EmptyState>Không có điều chỉnh nào.</EmptyState>
              ) : (
                <ul className="divide-y divide-border">
                  {res.report.adjustments.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {a.type === 'gift' ? <Gift className="mr-1 inline size-4 text-violet-600" aria-hidden /> : <Undo2 className="mr-1 inline size-4 text-red-600" aria-hidden />}
                          {a.quantity} × {a.itemName} <span className="text-muted">· {a.tableLabel}</span>
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {time(a.at)} · {a.byName ?? 'Không rõ người làm'}{a.reason ? ` · Lý do: ${a.reason}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={a.type === 'gift' ? 'info' : 'critical'}>{a.type === 'gift' ? 'Tặng' : 'Khách bỏ'}</Badge>
                        <span className="text-sm font-medium tabular">{formatVND(a.amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
}

function BillRow({ bill }: { bill: DailyReportBill }) {
  // In lại hoá đơn chỉ có với bill trả sau (theo phiên); đơn trả trước không có mẫu hoá đơn 80mm.
  const printHref = bill.sessionIds.length > 0 ? `/staff/tables/print?ids=${bill.sessionIds.join(',')}` : null
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {bill.tableLabel}
          {bill.merged && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">Gộp {bill.sessionIds.length} mâm</span>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted tabular">
          {time(bill.paidAt)} · {bill.itemsCount} món{bill.receivedByName ? ` · ${bill.receivedByName}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={bill.instrument === 'cash' ? 'success' : bill.instrument === 'bank' ? 'info' : 'neutral'}>{instrumentLabel(bill.instrument)}</Badge>
        <span className="w-28 text-right text-sm font-semibold text-foreground tabular">{formatVND(bill.total)}</span>
        {printHref ? (
          <a href={printHref} target="_blank" rel="noopener" className={getButtonClasses('outline')}>
            <Printer className="size-4" aria-hidden />
            Xem / In lại
          </a>
        ) : <span className="w-[118px]" aria-hidden />}
      </div>
    </li>
  )
}

function Stat({ icon, label, value, note, attention = false }: { icon: React.ReactNode; label: string; value: string; note?: string; attention?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4', attention ? 'border-warning-border' : 'border-border')}>
      <span className={cn('grid size-9 place-items-center rounded-lg [&>svg]:size-[18px]', attention ? 'bg-warning-bg text-warning' : 'bg-secondary text-muted')} aria-hidden>{icon}</span>
      <p className="mt-3 text-2xl font-semibold text-foreground tabular">{value}</p>
      <p className="mt-0.5 text-[13px] text-muted">{label}</p>
      {note ? <p className="mt-1 text-[12px] text-muted">{note}</p> : null}
    </div>
  )
}
```

Trước khi chạy: kiểm chữ ký thật của `PageHeader` (có prop `action` không?), `ErrorState` (prop `title`?), `Badge` tone, `Card` (`title`, `flush`) trong `components/ui/*.tsx` và sửa cho khớp — KHÔNG đổi component dùng chung; nếu `PageHeader` không có `action` thì đặt `ReportDatePicker` ở một `div` flex cạnh `PageHeader`.

- [ ] **Step 3: Hộp thoại chuyển tiếp searchParams**

`app/admin/@modal/(config)/(.)dashboard/page.tsx`:

```tsx
import Page from '../../../dashboard/page'

// Bấm link trong ứng dụng → Báo cáo ngày hiện trong hộp thoại cấu hình (vỏ ở ../layout.tsx).
export default function Intercepted({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <Page searchParams={searchParams} />
}
```

- [ ] **Step 4: Kiểm**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app/admin/dashboard "app/admin/@modal/(config)/(.)dashboard/page.tsx" && npm run build`
Expected: test PASS, không lỗi type/lint, build thành công.

- [ ] **Step 5: Chạy thử thật**

`npm run dev`, tự đăng nhập chủ quán Bảo Lương (mint phiên bằng service key theo memory `feedback_tu_dang_nhap_admin_khi_test`), mở `/admin/pos` → bấm **Báo cáo** trên rail: hộp thoại hiện Báo cáo ngày; đổi ngày sang ngày có bill → số liệu khớp truy vấn Task 4 Step 4; bấm "Xem / In lại" mở tab hoá đơn 80mm. Bấm ⚙ → tab Cấu hình quán có khối "Âm thanh thông báo"; Nghe thử phát tiếng.

- [ ] **Step 6: Commit**

```bash
git add admin-web/app/admin/dashboard "admin-web/app/admin/@modal/(config)/(.)dashboard/page.tsx"
git commit -m "feat: tab Bao cao thanh Bao cao ngay theo bill (PA-1)"
```

---

### Task 7: Checklist test tay PA-1

**Files:**
- Create: `docs/testing/pos-admin-complete/PA-1.md`

- [ ] **Step 1: Viết checklist**

```markdown
# PA-1 — Nút Cài đặt, chuông, Báo cáo ngày

Spec `docs/superpowers/specs/2026-10-07-pos-admin-complete-design.md` · Plan `docs/superpowers/plans/2026-10-07-pa1-settings-bell-daily-report.md`
Migration đã áp prod: 091 (`stores.bell_style`), 092 (`get_daily_report`). Test trên **Bảo Lương**, đăng nhập chủ quán.

## Nút ⚙ Cài đặt
1. Rail trái: có nút **⚙ Cài đặt** nằm ngay TRÊN ô "Thêm". Bấm → hộp thoại mở ở tab **Cấu hình quán**, nút ⚙ sáng cam.
2. Mở ô **Thêm** → KHÔNG còn mục "Cài đặt quán"; các mục khác (Đặt bàn, Bàn & QR, Nhân viên, Ưu đãi, Vòng quay, Tài khoản) vẫn đủ.
3. Điện thoại (≤ 400px): menu ☰ → nhóm Thiết lập có **Cài đặt** đứng đầu.

## Chuông
4. Tab Cấu hình quán có khối **Âm thanh thông báo**: 3 kiểu chuông; bấm chọn từng kiểu → nghe thử ngay tiếng của kiểu đó.
5. Chọn **Gõ nhẹ** → **Lưu kiểu chuông** → dùng Mini App gọi món một bàn → POS kêu một tiếng nhỏ.
6. Kéo thanh **Âm lượng trên máy này** về 0 → gọi món → POS im. Kéo lên 100 → Nghe thử to hơn. F5 → âm lượng giữ nguyên.
7. Mở POS trên máy/trình duyệt KHÁC → âm lượng là 80% (máy riêng), kiểu chuông vẫn là Gõ nhẹ (theo quán).
8. Trên POS bấm nút **loa** cạnh "Đặt bàn mới" → ô chỉnh âm lượng + Nghe thử hiện ra, chỉnh được.
9. Chọn **Báo liên tục** → Lưu → gọi món → POS kêu lặp ~3 giây/lần. Chạm bất kỳ đâu trên POS → im ngay.
10. Vẫn kiểu Báo liên tục: gọi món, KHÔNG chạm màn, duyệt lượt đó từ máy khác (hoặc từ chối) → hàng việc rỗng → im.
11. Màn **nhân viên** `/staff/tables`: khách bấm Gọi nhân viên → kêu đúng kiểu đã chọn.
12. Đổi lại **Ding-dong kép** sau khi test xong.

## Báo cáo ngày
13. Bấm **Báo cáo** trên rail → hộp thoại "Báo cáo ngày", hôm nay. 4 thẻ: Tổng thực thu · Tiền mặt · Chuyển khoản · Đang mở / chưa thu.
14. Thu tiền 1 bàn bằng **Tiền mặt**, 1 bàn bằng **Chuyển khoản** trên POS → mở lại Báo cáo (bấm Làm mới) → 2 bill mới, thẻ Tiền mặt / Chuyển khoản tăng đúng số.
15. **Gộp bill** 2 mâm rồi thu → báo cáo hiện **MỘT dòng** "Gộp 2 mâm" với tổng chung (không phải 2 dòng).
16. Thẻ "Đang mở" khớp số bàn đang có khách trên POS; tạm tính khớp tổng các bill đang mở.
17. Bỏ 1 món + tặng 1 món trên một bill (có lý do) → khối **Điều chỉnh bill** hiện 2 dòng, đủ giờ, người làm, lý do.
18. Bấm **Xem / In lại** ở một bill → mở tab hoá đơn 80mm đúng món, đúng tổng.
19. Đổi ngày sang hôm qua → số liệu đổi; thẻ thứ 4 thành "Số bill"; không chọn được ngày mai.
20. Đóng hộp thoại sau khi đổi ngày 2–3 lần → về thẳng POS.

**→ Báo:** `PA-1 PASS` hoặc số bài FAIL kèm ảnh.
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/pos-admin-complete/PA-1.md
git commit -m "docs: checklist test PA-1"
```

- [ ] **Step 3: DỪNG** — báo anh Tú: "Xong PA-1 rồi anh, test theo `docs/testing/pos-admin-complete/PA-1.md` nhé". Không làm PA-2 trước khi có PASS.
