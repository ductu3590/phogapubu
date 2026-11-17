# POS kiểu Sơ đồ bàn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "Sơ đồ bàn" của POS đổi tên "Sơ đồ" và thành lưới ô bàn dày kiểu KiotViet (lọc khu/trạng thái/tìm, ô đủ thông tin, bảng bàn trống); mỗi máy ghim được màn mặc định (Timeline / Sơ đồ) ngay trên POS.

**Architecture:** Logic thuần (xếp/lọc/đếm bàn, nội dung ô, hành động khi bấm ô, đọc/ghi tab đã chọn) nằm ở `admin-web/lib/` để vitest được. Component mới `floor-grid.tsx` vẽ lưới; `floor-map.tsx` giữ nguyên cho Sắp xếp bàn. `pos-client.tsx` chỉ nối dây: nhớ tab, Map bàn-đang-giữ, ưu tiên cột phải, bảng 1 bàn trống trong `bill-panel.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, lucide-react, vitest (component test bằng `renderToStaticMarkup`, KHÔNG có testing-library/jsdom — mọi hành vi bấm phải tách thành hàm thuần).

**Spec:** [docs/superpowers/specs/2026-11-17-pos-so-do-ban-design.md](../specs/2026-11-17-pos-so-do-ban-design.md) — đọc kèm. Mockup: `../specs/2026-11-17-pos-so-do-ban-mockup.html`.

## Global Constraints

- Không đổi DB / RPC / migration / server action. Chỉ sửa trong `admin-web/`.
- Mọi chữ người dùng thấy bằng tiếng Việt; comment logic khó bằng tiếng Việt.
- Màu + nhãn trạng thái chỉ lấy từ `tableVisualState` (`lib/table-status.ts`) + `TABLE_STATE` / `STATUS_TONE_CLASSES` (`components/ui/status.ts`).
- Nhãn tab: `Timeline` · `Sơ đồ` · `Danh sách`. Trang cấu hình "Sơ đồ bàn & QR" giữ tên.
- Màn mặc định: `localStorage` khoá `mevo:pos-view`, chỉ ghi khi bấm "Đặt làm mặc định máy này", giá trị `'timeline' | 'floor'`; mọi đọc/ghi bọc try/catch; giá trị lạ (kể cả `'list'`) → `'timeline'`. Bấm tab chỉ đổi tạm, không ghi. Không đụng DB / Cài đặt chung.
- Ô bàn ~104×84px: `grid-template-columns: repeat(auto-fill, minmax(104px, 1fr))`, khe 8px, chữ ≥12px.
- Bàn đang giữ cho khách đặt = đặt bàn `status === 'confirmed'`, `sessionId === null`, `arrivalAt − 60' ≤ now < arrivalAt + planningHoldMinutes`; nhiều đặt bàn → `arrivalAt` sớm nhất.
- Lệnh chạy trong `admin-web/` (KHÔNG `cd` bằng đường dẫn tuyệt đối chứa `.claude` — hook chặn; shell đã đứng ở thư mục worktree, dùng đường dẫn tương đối `admin-web`).
- Next 16: đọc `admin-web/AGENTS.md` trước khi viết.

## Review Focus

1. Quán có bàn **chưa phân khu** (cả khi quán không có khu nào) → nhóm "Chưa phân khu" đứng cuối, nút lọc chỉ hiện khi có cả khu lẫn bàn chưa phân khu (giống `areaItems` hiện tại). Test ở Task 1.
2. Tìm bàn có dấu / hoa thường: "ban a2", "BÀN A2" đều khớp "Bàn A2" (so `includes` sau chuẩn hoá; "bàn 1" khớp cả "Bàn 10" là chấp nhận được). Test ở Task 1.
3. Bàn thuộc **mâm nhiều bàn** (một phiên, nhiều `tables`) → mọi ô của mâm đều hiện tiền + giờ của phiên, bấm ô nào cũng mở cùng bill. Test ở Task 2.
4. `localStorage` ném lỗi (chế độ riêng tư) hoặc chứa giá trị cũ → POS vẫn mở Timeline, không vỡ trang. Test ở Task 3.
5. Phiên vừa mở (`opened_at` > now do lệch đồng hồ máy) → thời gian ngồi hiện `0'`, không ra số âm. Test ở Task 1.

---

### Task 1: Logic thuần lưới bàn

**Files:**
- Create: `admin-web/lib/pos-floor-grid.ts`
- Test: `admin-web/lib/pos-floor-grid.test.ts`

**Interfaces:**
- Consumes: `AreaPlacedTable`, `TableArea` (`lib/area-layout.ts`); `OpenTableSession` (`lib/actions/table-session`); `ReservationRow` (`lib/actions/reservations`); `pendingCount` (`lib/table-status.ts`).
- Produces:
  - `export type GridStatus = 'all' | 'busy' | 'free' | 'pending' | 'booked'`
  - `export const GRID_STATUS_LABEL: Record<GridStatus, string>` = `{ all: 'Tất cả', busy: 'Có khách', free: 'Trống', pending: 'Chờ duyệt', booked: 'Sắp có khách đặt' }`
  - `export const NO_AREA_ID = '__none__'`, `export const ALL_AREAS = '__all__'` (cùng giá trị `NO_AREA` / `ALL` trong `pos-client.tsx` — Task 5 import từ đây thay vì khai lại)
  - `export function heldReservationByTable(reservations: ReservationRow[], now: number): Map<string, ReservationRow>`
  - `export type GridContext = { sessionByTable: Map<string, OpenTableSession>; heldByTable: Map<string, ReservationRow> }`
  - `export function matchesGridStatus(tableId: string, status: GridStatus, ctx: GridContext): boolean`
  - `export function normalizeTableSearch(text: string): string` (bỏ dấu, `đ→d`, thường hoá, gộp khoảng trắng, trim)
  - `export type GridGroup = { areaId: string | null; name: string; color: string | null; tables: AreaPlacedTable[] }`
  - `export function buildGridGroups(input: { tables: AreaPlacedTable[]; areas: TableArea[]; areaFilter: string; status: GridStatus; query: string; ctx: GridContext }): GridGroup[]`
  - `export function gridAreaCounts(tables: AreaPlacedTable[], areas: TableArea[]): { value: string; label: string; color: string | null; count: number }[]`
  - `export function gridStatusCounts(tables: AreaPlacedTable[], areaFilter: string, ctx: GridContext): Record<GridStatus, number>`
  - `export function seatedLabel(openedAt: string, now: number): string`
  - `export function clockHHmm(iso: string): string` (giờ Asia/Ho_Chi_Minh, `19:30`) — nếu `lib/pos-timeline.ts` đã có `clock()` cùng nghĩa thì re-export nó, không viết lại.

- [ ] **Step 1: Viết test hỏng** `lib/pos-floor-grid.test.ts`, dựng dữ liệu nhỏ: khu A (`a1`), B (`b1`); bàn `A1(x0,y1)`, `A2(x1,y0)`, `B1`, `X1` (area_id null); phiên mở trên `A2` có 1 đơn chờ duyệt; đặt bàn confirmed giữ `B1`.

```ts
it('heldReservationByTable: chỉ confirmed, chưa có phiên, trong khung −60\'..+hold; nhiều đặt bàn lấy đến sớm nhất', ...)
  // arrival 19:30, hold 120 → now 18:29 không giữ, 18:30 giữ, 21:29 giữ, 21:30 không; status 'pending' không giữ; sessionId có giá trị không giữ
  // hai đặt bàn cùng bàn 19:30 và 19:00 → Map trả đặt bàn 19:00
it('buildGridGroups: Tất cả khu chia nhóm theo thứ tự areas, Chưa phân khu cuối, trong khu xếp y rồi x', ...)
  // → [{name:'A', tables:[A2, A1]}, {name:'B', tables:[B1]}, {areaId:null, name:'Chưa phân khu', tables:[X1]}]
it('buildGridGroups: lọc khu + trạng thái + tìm kiếm cùng lúc; nhóm rỗng bị bỏ', ...)
  // areaFilter=A, status='pending' → một nhóm chỉ có A2
  // bàn tên 'Bàn A2', query 'ban a2' → khớp; query 'BÀN A2' → khớp; query 'b9' → [] (Review Focus 2)
it('matchesGridStatus: busy gồm pending; free gồm bàn đang giữ; booked chỉ bàn trống đang giữ', ...)
it('gridStatusCounts đếm trong khu đang lọc, không theo ô tìm', ...)
  // areaFilter=ALL → { all:4, busy:1, free:3, pending:1, booked:1 }
it('gridAreaCounts: Tất cả + Chưa phân khu (chỉ khi có cả khu lẫn bàn chưa phân khu) + từng khu', ...)
  // → [{value:'__all__',label:'Tất cả khu',count:4}, {value:'__none__',label:'Chưa phân khu',count:1}, {value:'A',...count:2}, {value:'B',...count:1}]
  // quán không có khu nào → chỉ [{ value:'__all__', ... }]
it('normalizeTableSearch bỏ dấu + đ', () => expect(normalizeTableSearch('  Bàn  Đá 1 ')).toBe('ban da 1'))
it('seatedLabel', ...)
  // 0 phút → "0'", 45 → "45'", 72 → "1g12", 125 → "2g05", opened_at sau now → "0'"
```

- [ ] **Step 2: Chạy** `npm --prefix admin-web test -- pos-floor-grid` → FAIL (module chưa có).
- [ ] **Step 3: Viết `lib/pos-floor-grid.ts`** theo Interfaces. `heldReservationByTable` dùng đúng điều kiện đang có ở `prearrivalReservedTableIds` (`pos-client.tsx` ~dòng 427). Bàn trong nhóm sắp `y` rồi `x`. Tên nhóm bàn chưa phân khu: `'Chưa phân khu'`.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** `feat: logic thuần lưới bàn POS (xếp, lọc, đếm, giờ ngồi)`

---

### Task 2: Ô bàn + hành động khi bấm ô

**Files:**
- Create: `admin-web/lib/pos-grid-tile.ts`
- Test: `admin-web/lib/pos-grid-tile.test.ts`

**Interfaces:**
- Consumes: Task 1 (`GridContext`, `seatedLabel`, `clockHHmm`); `tableVisualState`, `pendingCount` (`lib/table-status.ts`); `TrayAssignment` (`lib/tray-colors`).
- Produces:
  - `export type GridTileView = { visual: TableVisualState; money: number | null; seated: string | null; trayIndex: number | null; pending: number; heldAt: string | null; calling: boolean }`
  - `export function gridTileView(tableId: string, ctx: GridContext & { trays: Map<string, TrayAssignment>; callingSessionIds: Set<string>; now: number }): GridTileView`
  - `export type GridTileAction = { kind: 'session'; sessionId: string; additive: boolean } | { kind: 'pick-free'; tableId: string } | { kind: 'reservation'; reservationId: string } | { kind: 'reservation-pick'; tableId: string } | { kind: 'none' }`
  - `export function gridTileAction(tableId: string, input: { ctx: GridContext; mode: 'normal' | 'reservation'; mergeMode: boolean; modifier: boolean; reservationBlocked: boolean }): GridTileAction`

- [ ] **Step 1: Test hỏng**

```ts
it('bàn trống: visual free, không tiền, không giờ', ...)
it('bàn đang giữ: visual booked, heldAt "19:30"', ...)
it('bàn có phiên: money = session.total, seated từ opened_at, trayIndex = tray.index, calling khi session_id ∈ callingSessionIds', ...)
it('mâm hai bàn: cả hai ô cùng money/seated/trayIndex', ...)        // Review Focus 3
it('chờ duyệt: pending = pendingCount(session), visual pending', ...)
it('gridTileAction normal: có phiên → session (additive = modifier || mergeMode)', ...)
it('gridTileAction normal: bàn đang giữ → reservation với id đặt bàn sớm nhất', ...)
it('gridTileAction normal: bàn trống → pick-free; mergeMode + bàn trống → none', ...)
it('gridTileAction reservation mode: có phiên hoặc reservationBlocked → none; còn lại → reservation-pick', ...)
```

- [ ] **Step 2: Chạy** `npm --prefix admin-web test -- pos-grid-tile` → FAIL.
- [ ] **Step 3: Viết `lib/pos-grid-tile.ts`.** `visual` = `tableVisualState(session, { prearrivalReserved: heldByTable.has(id) })`.
  Lưu ý gộp bill hiện tại: bấm bàn trống lúc `mergeMode` không làm gì (mâm chỉ gộp phiên đang mở).
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** `feat: nội dung ô bàn + hành động bấm ô cho lưới POS`

---

### Task 3: Màn mặc định theo máy + nút ghim

**Files:**
- Create: `admin-web/lib/pos-view-pref.ts`, `admin-web/app/admin/pos/use-pos-view.ts`, `admin-web/app/admin/pos/default-view-pin.tsx`
- Test: `admin-web/lib/pos-view-pref.test.ts`, `admin-web/app/admin/pos/default-view-pin.test.tsx`

**Interfaces:**
- Produces:
  - `export type PosView = 'timeline' | 'floor' | 'list'`
  - `export type PinnableView = 'timeline' | 'floor'`
  - `export const POS_VIEW_KEY = 'mevo:pos-view'`
  - `export const POS_VIEW_LABEL: Record<PosView, string>` = `{ timeline: 'Timeline', floor: 'Sơ đồ', list: 'Danh sách' }` (hàng tab dùng chung)
  - `export function readDefaultView(storage: Pick<Storage, 'getItem'> | undefined): PinnableView` (lỗi / thiếu / lạ / `'list'` → `'timeline'`)
  - `export function writeDefaultView(storage: Pick<Storage, 'setItem'> | undefined, view: PinnableView): boolean` (true = ghi được; nuốt lỗi → false)
  - `use-pos-view.ts`: `export function usePosView(): { view: PosView | null; defaultView: PinnableView | null; choose: (v: PosView) => void; pin: (v: PinnableView) => boolean; force: (v: PosView) => void; restore: () => void }`
    - `view`/`defaultView` = `null` khi render ở server / trước hydrate (`useSyncExternalStore`, server snapshot `null`); lần đầu ở trình duyệt `view = readDefaultView(localStorage)`.
    - `choose` = bấm tab: chỉ đổi `view` trong trang, KHÔNG ghi storage.
    - `pin` = bấm "Đặt làm mặc định máy này": `writeDefaultView` + cập nhật `defaultView`.
    - `force` = hệ thống ép (chọn bàn cho đặt bàn): nhớ view hiện tại vào ref `before` (chỉ khi chưa ép), đặt view.
    - `restore` = quay về `before` (nếu có) rồi xoá `before`.
  - `default-view-pin.tsx`: `export default function DefaultViewPin(props: { view: PosView; defaultView: PinnableView; onPin: (v: PinnableView) => void })`

- [ ] **Step 1: Test hỏng**

```ts
// lib/pos-view-pref.test.ts
it('chưa ghim → timeline', () => expect(readDefaultView({ getItem: () => null })).toBe('timeline'))
it('đọc floor', () => expect(readDefaultView({ getItem: () => 'floor' })).toBe('floor'))
it('list hoặc giá trị lạ → timeline', ...)                       // 'list', 'grid'
it('getItem ném lỗi / storage undefined → timeline', ...)        // Review Focus 4
it('writeDefaultView ghi ("mevo:pos-view","floor") và trả true; setItem ném → false', ...)
it('POS_VIEW_LABEL.floor === "Sơ đồ"', ...)

// default-view-pin.test.tsx (renderToStaticMarkup)
it('đang xem floor, mặc định timeline → nút "Đặt làm mặc định máy này"', ...)
it('đang xem floor, mặc định floor → "Mặc định máy này", không phải <button>', ...)
it('đang xem list → rỗng', ...)
```

- [ ] **Step 2: Chạy** `npm --prefix admin-web test -- pos-view-pref default-view-pin` → FAIL.
- [ ] **Step 3: Viết ba file.** Nút: icon `Star` (lucide) rỗng / tô đặc; chữ ẩn ở màn hẹp (`hidden lg:inline`), luôn có `aria-label` + `title` đủ chữ. Hook không có test riêng (không có DOM test); giữ nó mỏng.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** `feat: ghim màn POS mặc định theo máy (Timeline / Sơ đồ)`

---

### Task 4: Component lưới dày + hàng lọc

**Files:**
- Create: `admin-web/app/admin/pos/floor-grid.tsx`
- Test: `admin-web/app/admin/pos/floor-grid.test.tsx`

**Interfaces:**
- Consumes: Task 1, Task 2; `areaColorClasses` (`lib/area-colors`); `TABLE_STATE`, `STATUS_TONE_CLASSES`.
- Produces (default export + 1 named):
  - `export function FloorGridFilters(props: { areaItems: ReturnType<typeof gridAreaCounts>; areaFilter: string; onArea: (v: string) => void; counts: Record<GridStatus, number>; status: GridStatus; onStatus: (s: GridStatus) => void; query: string; onQuery: (q: string) => void; trailing?: ReactNode })` — `trailing` = nút Sắp xếp bàn.
  - `export default function FloorGrid(props: { groups: GridGroup[]; tile: (tableId: string) => GridTileView; selectedSessionId: string | null; pickedSessionIds: Set<string>; pickedTableIds: Set<string>; sessionIdOf: (tableId: string) => string | null; reservationMode: boolean; reservationTableIds: Set<string>; disabledReason: (tableId: string) => string | null; onTile: (tableId: string, modifier: boolean) => void; showGroupHeaders: boolean })`

Ô bàn theo bảng ở spec §5.3 (vạch màu mâm trái, nhãn "Gọi NV" có chuông `BellRing`, chấm nháy góc khi chờ duyệt có `motion-reduce:animate-none`, viền ưu tiên đặt-bàn-chọn > chờ duyệt > bill đang mở > đang tick, `truncate` + `title` tên bàn, `aria-label` như `floor-map.tsx` Tile). Trống: chữ "Trống"; đang giữ: "Đặt HH:mm". Không khớp lọc: "Không có bàn nào khớp bộ lọc."

- [ ] **Step 1: Test hỏng** (`renderToStaticMarkup`):

```ts
it('FloorGrid vẽ tiêu đề nhóm "A · 2 bàn" khi showGroupHeaders', ...)
it('ô có phiên hiện tiền "485.000đ" và "1g12"; ô mâm có "Mâm 2"', ...)
it('ô đang giữ hiện "Đặt 19:30"; ô trống hiện "Trống"', ...)
it('ô chờ duyệt có nhãn "Chờ duyệt · 2"; ô gọi NV có "Gọi NV"', ...)
it('groups rỗng → "Không có bàn nào khớp bộ lọc."', ...)
it('FloorGridFilters hiện "Sắp có khách đặt" kèm số đếm và nút khu có số', ...)
it('grid dùng repeat(auto-fill, minmax(104px, 1fr))', ...)
```

- [ ] **Step 2: Chạy** `npm --prefix admin-web test -- floor-grid` → FAIL.
- [ ] **Step 3: Viết `floor-grid.tsx`.** Chạm được bằng ngón tay: ô là `<button>`; nút lọc cao ≥36px; hàng lọc xuống dòng khi hẹp, ô tìm co lại.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** `feat: lưới ô bàn dày + hàng lọc khu/trạng thái/tìm cho POS`

---

### Task 5: Bảng 1 bàn trống + nối dây vào POS

**Files:**
- Modify: `admin-web/app/admin/pos/bill-panel.tsx` (nhánh mới cạnh `pickedFreeTables >= 2`, ~dòng 135)
- Modify: `admin-web/app/admin/pos/pos-client.tsx` (state tab ~214, `prearrivalReservedTableIds` ~427, `beginReservationConfirm` ~741, `panel` ~996, hàng tab ~1185, vùng `view === 'floor'` ~1286)
- Test: `admin-web/app/admin/pos/free-table-panel.test.tsx`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: `PosBillPanel` thêm props `freeTable: { id: string; table_number: string; areaName: string | null; laterReservationAt: string | null } | null`, `reservationsEnabled: boolean`, `onWalkInTable: (tableId: string) => void`, `onBookTable: (tableId: string) => void`.

- [ ] **Step 1: Test hỏng** `free-table-panel.test.tsx` (`renderToStaticMarkup(<PosBillPanel ... selected={null} picked={[]} pickedFreeTables={1} freeTable={{...}} />)`):

```ts
it('1 bàn trống: tiêu đề "Bàn 3", nhãn "Trống", nút "Gọi món & mở bàn", gợi ý ghép mâm', ...)
it('reservationsEnabled=false thì không có nút "Đặt bàn cho bàn này"', ...)
it('có laterReservationAt → dòng "Có khách đặt 21:00"', ...)
```

- [ ] **Step 2: Chạy** → FAIL. **Step 3:** viết nhánh `freeTable && list.length === 0 && pickedFreeTables === 1` trong `PosBillPanel`, dùng `Khung` (icon `Armchair` hoặc `LayoutGrid`, `onDismiss={props.onClearPick}`). **Step 4:** chạy → PASS.

- [ ] **Step 5: Nối dây `pos-client.tsx`** (không có test DOM; kiểm bằng typecheck + test tay Task 6):
  - `const { view, defaultView, choose, pin, force, restore } = usePosView()`; bỏ `useState<View>`. Hàng tab lấy nhãn từ `POS_VIEW_LABEL` (tab giữa thành "Sơ đồ"). Bấm tab → `choose(value)` (giữ các chặn `arrange` / `reservationPick` hiện có). `view === null` → hàng tab + vùng giữa hiện `SkeletonList`.
  - `<DefaultViewPin>` đặt ngay sau tablist; `onPin` → `pin(v)` rồi toast `Máy này sẽ mở POS bằng ${POS_VIEW_LABEL[v]}` (ghi lỗi → toast cảnh báo "Không lưu được trên máy này").
  - Sửa các chữ "Sơ đồ bàn" trong `pos-client.tsx` / `timeline-view.tsx` chỉ tab POS (vd. comment, `Chọn bàn cho đặt bàn chỉ làm được trên Sơ đồ bàn`) thành "Sơ đồ" nếu là chữ người dùng thấy; giữ nguyên "Sơ đồ bàn & QR".
  - `beginReservationConfirm`: `force('floor')` thay `setView('floor')`. Ở `confirmReservationFromPos` thành công và `cancelReservationPick` → `restore()`.
  - Đổi sang tab khác `floor` → `setPickedTableIds(new Set())`.
  - `heldByTable = useMemo(() => heldReservationByTable(reservations, now), …)`; `prearrivalReservedTableIds = new Set(heldByTable.keys())` (giữ tên cũ cho chỗ đang dùng).
  - `sessionByTable` = Map từ `stateByTable`; `callingSessionIds` từ `serviceRequests.requests` qua `serviceRequestSession`.
  - State mới: `gridArea` (mặc định `ALL_AREAS`), `gridStatus` (`'all'`), `gridQuery` (`''`). Import `ALL_AREAS`/`NO_AREA_ID` thay hằng `ALL`/`NO_AREA` cục bộ.
  - Vùng `view === 'floor'`: `arrange` → giữ nguyên `AreaControls` + `FloorMap`; không `arrange` → `FloorGridFilters` (trailing = nút Sắp xếp bàn đang có, chuyển từ hàng tab xuống) + `FloorGrid`. Chọn bàn cho đặt bàn dùng `FloorGrid` (`reservationMode`, `disabledReason` như logic hiện có trong `floor-map.tsx`).
  - Bấm Sắp xếp bàn khi `gridArea` là một khu thật → `floor.setAreaId(gridArea)` trước `floor.begin()`.
  - `onTile` → `gridTileAction(...)`: `session` → `selectSession(id, additive)`; `reservation` → `selectReservation(id)`; `reservation-pick` → `toggleReservationPickTable`; `pick-free` → bỏ `selectedSessionId` / `selectedReservationId` / `pickedSessionIds` rồi `togglePickTable`.
  - `panel`: thêm `'free'` khi `view === 'floor' && pickedTableIds.size === 1 && !hasBill` (thứ tự: pick > reservation > bill > free > work). `'free'` render `PosBillPanel` với `freeTable` (tên khu từ `floor.draft.areas`, `laterReservationAt` từ `moveTargets`), `onWalkInTable` → `setWalkIn({ step: 'menu', tableId, tableNumber })`, `onBookTable` → `setNewBooking({ table, arrivalAt })` làm tròn như nút Đặt bàn mới (tách hàm `roundedArrival()` dùng chung). Gửi món xong `onWalkIn` đã mở bill; thêm `setPickedTableIds(new Set())` ở đó.
- [ ] **Step 6: Kiểm** `npm --prefix admin-web test` → toàn bộ PASS; `npx --prefix admin-web tsc --noEmit -p admin-web` → 0 lỗi mới; `npm --prefix admin-web run lint` → 0 lỗi mới.
- [ ] **Step 7: Commit** `feat: POS tab Sơ đồ dạng lưới dày, bảng bàn trống, ghim màn mặc định`

---

### Task 6: Lớp review Playwright (e2e trên POS thật của Bảo Lương)

Anh Tú chốt 2026-11-17: thêm một lớp review tự động bằng Playwright; anh chỉ test tay phần lớp này không làm
được. Được phép thêm dữ liệu thử vào Bảo Lương / Yên Garden (chưa onboard, dữ liệu prod đều là dữ liệu test).

**Files:**
- Modify: `admin-web/package.json` (devDependency `@playwright/test`, script `"e2e": "playwright test"`), `.gitignore` (`admin-web/e2e/.auth/`, `admin-web/test-results/`, `admin-web/playwright-report/`)
- Create: `admin-web/playwright.config.ts`, `admin-web/e2e/global-setup.ts`, `admin-web/e2e/global-teardown.ts`, `admin-web/e2e/seed.ts`, `admin-web/e2e/pos-so-do.spec.ts`
- vitest không được nhặt `e2e/**` (thêm `exclude` trong cấu hình vitest nếu cần).

**Ràng buộc:**
- Chạy trên dev server của worktree (`E2E_BASE_URL`, mặc định `http://localhost:3000`), Chromium, `workers: 1` (cùng một quán, cùng dữ liệu).
- Ba cỡ màn (project): `desktop-1366` (1366×768), `desktop-1920` (1920×1080), `phone` (375×812). Kịch bản thao tác chạy ở 1366; 1920 + phone chỉ chạy kịch bản bố cục.
- Đăng nhập: `global-setup.ts` mint phiên chủ quán `baoluong@mevo.vn` bằng service key đọc từ `admin-web/.env.local` (generate_link magiclink → verify → cookie `sb-<ref>-auth-token` = `"base64-" + base64url(session)`, chia khúc `.0/.1` nếu > 3180 ký tự) rồi ghi `storageState` vào `e2e/.auth/owner.json`. Không in token ra log.
- Dữ liệu: `seed.ts` dùng service-role client, CHỈ đụng quán Bảo Lương (tra `store_id` theo slug, dừng nếu không thấy). Setup thêm khu `Khu E2E` + 18 bàn `E2E-01..18` (để quán có 43 bàn — đủ kiểm "40+ bàn không cuộn"); teardown xoá khu + bàn đó (chúng không có phiên nào). Phiên / đặt bàn kịch bản tự tạo qua giao diện thì teardown đóng/huỷ hết (`close_table_session` staff_reset, huỷ đặt bàn) — kể cả khi test fail giữa chừng.
- Tạo "chờ duyệt" và "gọi nhân viên" bằng đúng đường khách dùng nếu gọi được bằng service role (RPC tạo đơn của Mini App / insert `service_requests`); không được thì bỏ hai ô đó khỏi e2e và đưa sang checklist tay (Task 7) — ghi rõ lý do trong báo cáo.
- Mỗi kịch bản ghi lỗi console (`page.on('console')` mức error) và fail nếu có.

**Kịch bản (`pos-so-do.spec.ts`)** — mỗi dòng là một `test(...)`:

```ts
// A. Màn mặc định
'tab giữa tên "Sơ đồ"; máy chưa ghim mở Timeline'
'bấm Sơ đồ rồi reload → về Timeline (đổi tab chỉ tạm)'
'ghim Sơ đồ → toast "Máy này sẽ mở POS bằng Sơ đồ", nút thành "Mặc định máy này", reload và context mới cùng storage → vào Sơ đồ'
'tab Danh sách không có nút ghim'
// B. Lưới + lọc (chạy cả 1366 / 1920 / phone)
'1366×768 và 1920×1080: thấy đủ 43 ô bàn, ô cuối nằm trọn trong vùng lưới không cần cuộn'   // 1366: nếu vùng lưới thấp hơn 4 hàng thì assert số hàng phải cuộn ≤ 1 — ghi số đo thật vào báo cáo
'phone 375: lưới 3 cột, trang không cuộn ngang'
'Tất cả khu: nhóm theo khu, tiêu đề "Khu E2E · 18 bàn"'
'lọc khu Khu E2E → chỉ 18 ô; nút khu hiện đúng số'
'lọc trạng thái: số trên nút khớp số ô hiện ra (Tất cả / Có khách / Trống / Chờ duyệt / Sắp có khách đặt)'
'tìm "e2e 0" không dấu / "E2E-01" → đúng ô; chuỗi không có → "Không có bàn nào khớp bộ lọc."'
// C + D. Ô bàn + bấm ô
'bấm bàn trống → bảng "Bàn …" nhãn Trống + "Gọi món & mở bàn" + "Đặt bàn cho bàn này"'
'Gọi món & mở bàn → hộp chọn món → chọn 1 món → gửi → bill bàn đó mở ở cột phải; ô hiện tiền + "0\'"'
'bấm 2 bàn trống → "Đã chọn 2 bàn trống" + "Ghép thành một mâm"'
'bấm bàn trống khi đang mở bill → cột phải chuyển sang bảng bàn trống'
'Đặt bàn cho bàn này → form đặt bàn có sẵn bàn; tạo đặt bàn giờ = now+30\' (nếu quán bật đặt bàn, duyệt luôn) → ô hiện "Đặt HH:mm" → bấm ô mở chi tiết đặt bàn có "Nhận khách"'
'Ctrl+bấm hai ô có khách → bill gộp 2 mâm'
'(nếu seed được) ô chờ duyệt có "Chờ duyệt · N" + viền vàng; ô gọi NV có "Gọi NV"'
// E. Đặt bàn + Sắp xếp
'đang ở Timeline, duyệt đặt bàn cần xếp bàn → tự sang Sơ đồ → chọn bàn → xác nhận → quay về Timeline'
'lọc Khu E2E rồi bấm Sắp xếp bàn → màn sắp xếp mở đúng khu đó; Huỷ → về lưới, bộ lọc giữ nguyên'
// F. Không thụt lùi
'Timeline và Danh sách vẫn vẽ (có hàng bàn / có dòng), không lỗi console'
'cỡ 1024 (dưới xl): bấm bàn → bill hiện dạng sheet có nút đóng'
```

- [ ] **Step 1:** Cài `@playwright/test` (cùng bản với `playwright` mà `scripts/ui_shot.py` đang dùng nếu có, không thì bản ổn định mới nhất ≥ 2 tuần tuổi) + `npx playwright install chromium`; viết config + setup/teardown + seed. Chạy `npm --prefix admin-web run e2e -- --list` → liệt kê đủ test.
- [ ] **Step 2:** Viết `pos-so-do.spec.ts`. Chạy dev server worktree (preview_start `admin-web`), rồi `npm --prefix admin-web run e2e` → toàn bộ PASS. Test nào fail vì lỗi code thì sửa code (quay lại task sở hữu code đó), không nới test.
- [ ] **Step 3:** Chạy lại lần 2 liên tiếp → vẫn PASS (dữ liệu dọn sạch giữa các lần). Kiểm DB: không còn khu `Khu E2E`, không còn phiên mở / đặt bàn do e2e tạo.
- [ ] **Step 4: Commit** `test: e2e Playwright cho POS tab Sơ đồ (Bảo Lương)`

---

### Task 7: Checklist test tay — chỉ phần Playwright không làm được

**Files:**
- Create: `docs/testing/pos-so-do-ban/POS-SO-DO-BAN.md`
- Modify: `TESTING.md` (1 dòng link + "Chờ test"), `docs/decisions.md` (1 dòng cuối bảng chính: "2026-11-17 POS tab Sơ đồ: lưới dày auto-fill, thứ tự theo toạ độ Sắp xếp bàn; tab đổi tên "Sơ đồ"; màn mặc định ghim theo máy trên POS (localStorage `mevo:pos-view`, không DB); bàn giữ cho khách đặt bấm mở chi tiết đặt bàn; e2e Playwright `admin-web/e2e/`")

- [ ] **Step 1:** Đầu file: bảng "Đã tự động (Playwright)" liệt kê tên kịch bản Task 6 + lệnh chạy lại `npm --prefix admin-web run e2e` + kết quả lần chạy cuối (số test PASS, ngày).
- [ ] **Step 2:** Phần anh Tú test tay — CHỈ những thứ máy không kiểm được, mỗi mục có bước + kết quả mong đợi:
  - **T1. Nhìn & đọc** — ở khoảng cách đứng quầy, ô bàn đọc được tên / tiền / giờ; màu trạng thái phân biệt được; không chỗ nào chữ bị cắt.
  - **T2. Máy tính bảng / màn cảm ứng thật** — chạm ô, chạm nút lọc, kéo cuộn lưới mượt, bill dạng sheet dùng được bằng tay.
  - **T3. Hai máy** — ghim Sơ đồ ở máy A, máy B vẫn mở Timeline.
  - **T4. Khách thật** — quét QR bàn bằng Zalo gọi món → ô bàn nháy "Chờ duyệt" + chuông kêu; bấm gọi nhân viên → "Gọi NV" (bỏ mục nào Playwright đã làm được ở Task 6).
  - **T5. In** — từ bảng bàn trống gọi món & mở bàn → phiếu in ra đúng như luồng Khách lẻ cũ.
  - **T6. Cảm nhận** — so với Timeline, quán đông bàn có nhanh hơn không; điều gì muốn chỉnh.
- [ ] **Step 3: Commit** `docs: checklist test POS tab Sơ đồ`
- [ ] **Step 4:** DỪNG. Để sẵn dev server worktree + link. Báo anh Tú: "Xong rồi anh, Playwright PASS N/N; anh test tay theo `docs/testing/pos-so-do-ban/POS-SO-DO-BAN.md` — mục T1→T6 nhé". Chờ PASS.
