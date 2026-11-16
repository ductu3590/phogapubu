# Trang Báo cáo chuyên nghiệp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm đẹp 8 tab của `/admin/reports` theo mockup (thẻ số có "% so với kỳ trước", biểu đồ vùng / tròn / thác nước, khối xếp hạng & nhận xét) mà không đổi DB, con số, Excel.

**Architecture:** Hàm thuần mới ở `admin-web/lib/reports/` (`compare.ts` kỳ trước + %, `insights.ts` xếp hạng / gom nhóm, `chart-geometry.ts` toạ độ SVG), component vẽ ở `admin-web/app/admin/reports/charts/` + `kpi-card.tsx`. `reports-screen.tsx` tải kỳ này và kỳ trước song song, truyền `compare` xuống từng view; mỗi view `*-view.tsx` được dựng lại theo mockup.

**Tech Stack:** Next 16 (App Router, server component), React 19, Tailwind 4, lucide-react, vitest (`renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-11-16-bao-cao-chuyen-nghiep-design.md` (đọc trước). Mockup chuẩn bố cục:
`C:\Users\ductu\AppData\Local\Temp\claude\367cbb6e3687544b\0c642e0e-845e-477b-8f9b-904ba2c73a65\scratchpad\bao-cao-mockup.html` —
Task 8 chép nó vào `docs/superpowers/specs/2026-11-16-bao-cao-mockup.html`.

## Global Constraints

- Không sửa `supabase/`, RPC, migration; không đổi `lib/reports/sales.ts` / `finance.ts` parser, `reports-xlsx`, `app/print/`, `app/admin/reports/export/`.
- Không thêm gói npm (không thư viện biểu đồ). SVG tự vẽ.
- Không biểu đồ mini (sparkline) trong thẻ số. Không "Khách mới", "Trạng thái đơn", không tab Tổng quan.
- Không viền nét đứt / nhãn "MỚI" (chỉ là dấu trong mockup).
- Chữ UI tiếng Việt, comment tiếng Việt cho logic khó. Tiền hiển thị bằng `formatVND`; số lượng `formatQty`; % `formatPercent` (`report-format.ts`).
- Mọi số mới chỉ xếp hạng / gom / max-min / % trên dữ liệu RPC đã trả — không tự nghĩ công thức tiền.
- Phân quyền giữ nguyên: `reportTabsFor`, `parseReportTab`, `loadReport` chặn tab tài chính cho thu ngân.
- Kỳ trước tải lỗi → chỉ ẩn delta, trang vẫn hiện.
- Màu: token `--primary #c2410c`; thêm `--chart-1 #ea580c`, `--chart-2 #f59e0b`, `--chart-3 #10b981`, `--chart-4 #0ea5e9`, `--chart-5 #8b5cf6`, `--chart-6 #94a3b8`. Tiền mặt = chart-3, Chuyển khoản = chart-4, Ghi nợ = chart-2, Ví/khác = chart-5.
- 375px: không cuộn ngang trang; bảng → thẻ dưới `md` như hiện nay.
- Lệnh chạy từ `admin-web/` bằng đường dẫn TƯƠNG ĐỐI (hook harness chặn lệnh shell có đường dẫn tuyệt đối chứa `.claude`).
- Commit trên nhánh hiện tại `claude/mevo-report-professional-17b25f`, format `feat: …` / `test: …` / `docs: …`. Không push, không merge main.

## Review Focus

1. **Kỳ trước = 0 hoặc âm** (quán mới, Lãi ròng kỳ trước lỗ, quỹ chênh lệch âm) → không hiện chip, không "Infinity%" / "NaN%". Test ở Task 1 + Task 2 (KpiCard).
2. **Lãi gộp / lãi ròng âm** → thác nước vẽ cột xuống dưới trục 0, không tràn khung, dòng Lãi ròng nền đỏ nhạt. Test ở Task 2 (Waterfall) + Task 7.
3. **Kỳ rỗng** (0 dòng, hoặc mọi số 0) → KPI hiện 0đ, khối biểu đồ/xếp hạng thay bằng "Chưa có dữ liệu trong kỳ này", không chia cho 0. Test ở Task 5–7.
4. **Nhiều danh mục / hạng mục chi (> 5)** và **món không còn danh mục** (`categoryId = null`, nhãn "Khác") → donut 5 lát + "Khác" gộp, không hai lát cùng tên "Khác". Test ở Task 3.
5. **Thu ngân** → thanh tab chỉ nhóm Bán hàng, không có nhãn "TÀI CHÍNH"; kỳ trước gọi bằng đúng tab đang xem (không gọi RPC tài chính). Test ở Task 4.

---

### Task 1: So với kỳ trước (`compare.ts`)

**Files:**
- Create: `admin-web/lib/reports/compare.ts`
- Test: `admin-web/lib/reports/compare.test.ts`

**Interfaces:**
- Consumes: `ReportPreset` (`lib/reports/period.ts`), `ReportData` (type từ `lib/actions/reports.ts`).
- Produces:
  - `previousRange(preset: ReportPreset, from: string, to: string): { from: string; to: string }`
  - `deltaPercent(cur: number, prev: number | null | undefined): number | null`
  - `compareLabel(preset: ReportPreset): string`
  - `type Compare = { prev: ReportData | null; label: string }`
  - `prevOf<T extends ReportData['tab']>(c: Compare | undefined, tab: T): Extract<ReportData, { tab: T }> | null`

- [ ] **Step 1: Viết test hỏng** — `compare.test.ts`:

```ts
describe('previousRange', () => {
  it('Hôm nay / Hôm qua / 7 ngày / Tuỳ chọn: cùng độ dài liền trước', () => {
    expect(previousRange('today', '2026-11-16', '2026-11-16')).toEqual({ from: '2026-11-15', to: '2026-11-15' })
    expect(previousRange('yesterday', '2026-11-15', '2026-11-15')).toEqual({ from: '2026-11-14', to: '2026-11-14' })
    expect(previousRange('7d', '2026-11-10', '2026-11-16')).toEqual({ from: '2026-11-03', to: '2026-11-09' })
    expect(previousRange('custom', '2026-11-05', '2026-11-09')).toEqual({ from: '2026-10-31', to: '2026-11-04' })
    expect(previousRange('today', '2026-03-01', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' })
  })
  it('Tháng này: n ngày đầu tháng trước, cắt ở cuối tháng', () => {
    expect(previousRange('this_month', '2026-11-01', '2026-11-16')).toEqual({ from: '2026-10-01', to: '2026-10-16' })
    expect(previousRange('this_month', '2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousRange('this_month', '2026-01-01', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-10' })
  })
  it('Tháng trước: trọn tháng liền trước nữa', () => {
    expect(previousRange('last_month', '2026-10-01', '2026-10-31')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(previousRange('last_month', '2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})
describe('deltaPercent', () => {
  it('làm tròn 1 chữ số, kỳ trước ≤ 0 hoặc thiếu thì null', () => {
    expect(deltaPercent(17_800_000, 16_450_000)).toBe(8.2)
    expect(deltaPercent(0, 100)).toBe(-100)
    expect(deltaPercent(100, 100)).toBe(0)
    expect(deltaPercent(100, 0)).toBeNull()
    expect(deltaPercent(100, -5)).toBeNull()
    expect(deltaPercent(100, null)).toBeNull()
    expect(deltaPercent(-50, 100)).toBe(-150)
  })
})
it('compareLabel gọi đúng tên kỳ trước', () => {
  expect(compareLabel('today')).toBe('so với hôm qua')
  expect(compareLabel('yesterday')).toBe('so với hôm kia')
  expect(compareLabel('7d')).toBe('so với 7 ngày trước')
  expect(compareLabel('this_month')).toBe('so với tháng trước')
  expect(compareLabel('last_month')).toBe('so với tháng trước')
  expect(compareLabel('custom')).toBe('so với kỳ trước')
})
it('prevOf trả báo cáo đúng tab, sai tab hoặc thiếu thì null', () => { /* Compare với prev.tab 'item' → prevOf(c,'item') là nó; prevOf(c,'voids') null; prevOf(undefined,'item') null */ })
```

- [ ] **Step 2:** `npx vitest run lib/reports/compare.test.ts` → FAIL (module chưa có).
- [ ] **Step 3: Viết `compare.ts`.** Ngày là chuỗi `YYYY-MM-DD` tính bằng UTC như `period.ts` (dùng lại cách `addDays`/`daysBetween` của file đó — export chúng từ `period.ts` thay vì chép). Tháng này: `from` = ngày 1 tháng trước, `to` = min(ngày 1 tháng trước + (n−1), ngày cuối tháng trước).
- [ ] **Step 4:** chạy lại → PASS.
- [ ] **Step 5:** commit `feat: tính kỳ trước và % so sánh cho báo cáo`.

---

### Task 2: Nền vẽ — token màu, hình học, biểu đồ, thẻ số

**Files:**
- Modify: `admin-web/app/globals.css` (thêm `--chart-1..6` cạnh nhóm token màu, kèm `@theme` nếu file đang map token sang class Tailwind)
- Create: `admin-web/lib/reports/chart-geometry.ts`, `admin-web/lib/reports/chart-geometry.test.ts`
- Create: `admin-web/app/admin/reports/charts/palette.ts`, `donut.tsx`, `area-chart.tsx`, `waterfall.tsx`, `share-bar.tsx`, `chart-legend.tsx`
- Create: `admin-web/app/admin/reports/kpi-card.tsx`, `admin-web/app/admin/reports/section-card.tsx`
- Test: `admin-web/app/admin/reports/charts/charts.test.tsx`

**Interfaces:**
- Produces:
  - `smoothPath(points: [number, number][]): string` — Catmull-Rom → cubic Bézier (thuật toán như hàm `smooth` trong mockup); 1 điểm → `"M x,y"`; 0 điểm → `""`.
  - `niceMax(value: number): number` — `step = 10^floor(log10 v)`; `ceil(v/step/2)*step*2`; `v ≤ 0` → 1.
  - `donutArcs(values: number[], circumference: number, gap?: number): { length: number; offset: number }[]` — tổng 0 → mảng rỗng.
  - `CHART_COLORS: string[]` (`var(--chart-1)`…`var(--chart-6)`), `PAYMENT_COLORS: Record<'cash'|'bank'|'debt'|'other', string>`.
  - `<Donut slices={{ label: string; value: number; color: string }[]} center: string caption: string size?: number />`
  - `<AreaChart labels={string[]} series={{ name: string; values: number[]; color: string; axis?: 'left' | 'right' }[]} formatLeft={(n: number) => string} formatRight?={(n: number) => string} width?: number height?: number />` — lưới 5 vạch, nhãn trục, gradient dưới đường, đánh dấu đỉnh của series đầu (vạch đứng + nhãn trên điểm cao nhất của mọi series tại cột đó; series 2 nhãn bên phải điểm).
  - `<Waterfall steps={WaterfallStep[]} formatValue={(n: number) => string} />` (`WaterfallStep` định nghĩa ở Task 3 — Task 2 khai báo type `{ label: string; value: number; kind: 'total' | 'delta' }` trong `chart-geometry.ts`, Task 3 import lại).
  - `<ShareBar ratio: number color?: string className?: string />` (ratio 0..1, kẹp).
  - `<ChartLegend items={{ label: string; sub?: string; percent?: number; color: string }[]} />`
  - `<KpiCard icon={LucideIcon} tone={'orange'|'amber'|'green'|'sky'|'red'|'violet'|'slate'} label: string value: string unit?: string delta?: number | null inverse?: boolean compareLabel?: string note?: ReactNode valueClassName?: string />`
  - `<SectionCard title: string hint?: string action?: ReactNode className?: string>{children}</SectionCard>`
  - `shortMoney(n: number): string` trong `report-format.ts`: `17_800_000 → '17,8tr'`, `56_000 → '56k'`, `0 → '0'`, âm giữ dấu `'-1,5tr'`.

- [ ] **Step 1: Test hỏng** — `chart-geometry.test.ts`: `niceMax(4_260_000) === 6_000_000`, `niceMax(18) === 20`, `niceMax(0) === 1`; `smoothPath([[0,0]]) === 'M0,0'`, `smoothPath([[0,10],[10,0],[20,10]])` bắt đầu `'M0,10 C'` và chứa đúng 2 đoạn `' C'`; `donutArcs([1,1], 100, 0)` → `[{length:50,offset:0},{length:50,offset:-50}]`; `donutArcs([0,0],100)` → `[]`. Thêm test `shortMoney` vào file test sẵn có cạnh `report-format` (hoặc `chart-geometry.test.ts`).
- [ ] **Step 2: Test hỏng** — `charts.test.tsx` (`renderToStaticMarkup`):
  - `Donut` 3 lát → 3 `<circle` có `stroke-dasharray`, có chữ tâm và caption.
  - `AreaChart` 2 series 7 nhãn → 2 `<path` có `stroke=`, nhãn đỉnh = `formatLeft(max)`, đủ 7 nhãn trục x khi ≤ 12 cột; 24 cột → tối đa 13 nhãn.
  - `AreaChart` series toàn 0 → không `NaN` trong markup.
  - `Waterfall` với lãi ròng âm (`[{Doanh thu,100,total},{Giá vốn,-130,delta},{Lãi gộp,-30,total},{Chi phí,-20,delta},{Huỷ + khác,0,delta},{Lãi ròng,-50,total}]`) → không `NaN`, mọi `y`/`height` ≥ 0, cột Lãi ròng có `y` ≥ y của trục 0.
  - `KpiCard` delta `8.2` → `↑ 8,2%` + class tốt; `inverse` + delta `8.2` → class xấu; delta `null` → không có chip và không có `compareLabel`; delta `0` → `— 0%`.
- [ ] **Step 3:** chạy 2 file test → FAIL.
- [ ] **Step 4: Viết** `chart-geometry.ts`, `shortMoney`, palette, các component (server component thuần, không `'use client'`, dùng được trong view client). Thẻ & khối theo mockup: `rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgb(15_23_42/0.04)]`; KPI số `text-[21px] md:text-[28px] font-bold tabular`, đơn vị nhỏ màu muted; chip tốt `bg-success-bg text-success`, xấu `bg-critical-bg text-critical`, bằng `bg-secondary text-muted`. SVG dùng `viewBox` cố định, `width="100%"`, không `preserveAspectRatio="none"` (chữ không méo).
- [ ] **Step 5:** test PASS; `npx tsc --noEmit` sạch với file mới.
- [ ] **Step 6:** commit `feat: bộ biểu đồ SVG và thẻ số cho báo cáo`.

---

### Task 3: Rút thông tin từ dữ liệu (`insights.ts`)

**Files:**
- Create: `admin-web/lib/reports/insights.ts`, `admin-web/lib/reports/insights.test.ts`

**Interfaces:**
- Consumes: kiểu từ `sales.ts`, `finance.ts`; `sortItemRows`, `percentOf` (`sales.ts`); `WaterfallStep` (`chart-geometry.ts`).
- Produces:
  - `type Share = { key: string; label: string; value: number; qty?: number }`
  - `topWithRest(items: Share[], max: number, restLabel = 'Khác'): Share[]` — sắp giảm dần theo value; > max thì max lát đầu + 1 lát `key '__rest'` gộp phần còn lại (gộp cả `qty`); lát có key `'other'` (món mất danh mục) **luôn bị gộp vào `__rest`** khi có `__rest`, để không có 2 lát "Khác".
  - `itemCategoryShares(rows: SalesItemRow[]): Share[]` — gom theo `categoryId ?? 'other'`, value = tiền, qty = SL bán; rồi `topWithRest(…, 5)`.
  - `categoryShares(rows: SalesCategoryRow[]): Share[]` — như trên cho tab danh mục.
  - `topItems(rows: SalesItemRow[], by: 'amount' | 'qty', n = 5): SalesItemRow[]`
  - `hourSummary(rows: SalesHourRow[]): { peakHour: number; peakAmount: number; busiestHour: number; busiestOrders: number; totalOrders: number; avgPerOrder: number } | null` — hoà thì lấy giờ đứng trước theo thứ tự server; rỗng hoặc mọi tiền 0 và mọi lượt 0 → null; `avgPerOrder = round(tổng tiền / tổng lượt)`, 0 lượt → 0.
  - `voidTopItems(rows: VoidRow[], n = 4): { itemName: string; quantity: number }[]` — cộng `quantity` mọi loại.
  - `voidReasons(rows: VoidRow[], n = 5): { reason: string; count: number }[]` — `null` → `'Không ghi lý do'`; hoà thì theo tên `localeCompare('vi')`.
  - `revenueExtremes(rows: RevenueRow[]): { best: RevenueRow; worst: RevenueRow; avg: number } | null` — best = revenue lớn nhất; worst = revenue nhỏ nhất trong các dòng `billsCount > 0`; `avg = round(Σrevenue / rows.length)`; không dòng nào có bill → null.
  - `paymentMix(t: RevenueTotals): Share[]` — keys `cash` 'Tiền mặt', `bank` 'Chuyển khoản', `debt` 'Ghi nợ', `other` 'Ví / khác'; bỏ lát ≤ 0.
  - `outflowBars(lines: CashFlowOutLine[]): { key: string; label: string; cash: number; bank: number; total: number }[]` — bỏ `reportGroup === 'cash_transfer'`; phần âm kẹp 0; bỏ total = 0; sắp giảm dần.
  - `waterfallSteps(p: ProfitLossReport): WaterfallStep[]` — đúng 6 bước: `Doanh thu` (total, revenue), `Giá vốn` (delta, −cogsTotal), `Lãi gộp` (total, grossProfit), `Chi phí` (delta, −operatingExpenses.total), `Huỷ + khác` (delta, −writeoffCost + otherIncome.total), `Lãi ròng` (total, netProfit).
  - `marginPercent(part: number, revenue: number): number | null` — revenue ≤ 0 → null; 1 chữ số.
  - `opexShares(p: ProfitLossReport): Share[]` — từ `operatingExpenses.rows`, `topWithRest(…, 4)`.
  - `topDebtors(rows: ReceivableRow[], n = 4): ReceivableRow[]` — closing > 0, giảm dần.
  - `collectedRate(t: ReceivableAmounts): number | null` — `collected / (opening + incurred) * 100`, mẫu ≤ 0 → null.
  - `debtAgeDays(oldestOpenDate: string | null, periodTo: string): number | null`.

- [ ] **Step 1: Test hỏng** `insights.test.ts`, dùng dữ liệu `ITEMS`/`HOURS`/`VOIDS` như `report-views.test.tsx` và fixture `lib/reports/__fixtures__/rpc-125.json` cho tài chính:
  - `itemCategoryShares(ITEMS)` → keys theo thứ tự `['c-do','c-lau','c-nuong','other']`, `c-do` value 450000 qty 16.
  - `topWithRest` 7 lát gồm một lát `'other'` → 6 lát, lát cuối `__rest` 'Khác' có value = tổng phần gộp, không lát nào key `'other'`.
  - `hourSummary(HOURS)` → `{ peakHour: 18, peakAmount: 840000, busiestHour: 18, busiestOrders: 2, totalOrders: 3, avgPerOrder: 350000 }`; `hourSummary([])` null.
  - `voidReasons(VOIDS)` chứa `{ reason: 'Không ghi lý do', count: 1 }`; `voidTopItems(VOIDS)[0]` là `'Bia Hà Nội lon'` quantity 2.
  - `revenueExtremes` trên `report_revenue_series_day` của fixture: best/worst/avg khớp tay; mọi dòng `billsCount 0` → null.
  - `paymentMix({ …, other: 0 })` không có key `other`.
  - `outflowBars` với một dòng `reportGroup 'cash_transfer'` và một dòng `cash: -500000, bank: 200000` → dòng chuyển quỹ biến mất, dòng kia `cash 0, total 200000`.
  - `waterfallSteps(fixture pnl)`: 6 nhãn đúng thứ tự; **`Lãi gộp + Chi phí + Huỷ+khác === Lãi ròng`** và **`Doanh thu + Giá vốn === Lãi gộp`** trên fixture (nếu fixture không thoả, đọc `supabase/migrations/125_financial_reports.sql` `report_profit_loss` và sửa bước cho khớp SQL, không sửa SQL).
  - `marginPercent(70_700_000, 111_900_000) === 63.2`; `marginPercent(1, 0) === null`.
  - `collectedRate({ opening: 6_200_000, incurred: 8_950_000, collected: 5_400_000, … }) === 35.6`.
  - `debtAgeDays('2026-10-09', '2026-11-16') === 38`; `debtAgeDays(null, …) === null`.
- [ ] **Step 2:** FAIL. **Step 3:** viết `insights.ts`. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat: rút xếp hạng và nhận xét từ dữ liệu báo cáo`.

---

### Task 4: Khung trang — tải kỳ trước, thanh kỳ, thanh tab, ô ngày

**Files:**
- Modify: `admin-web/app/admin/reports/reports-screen.tsx`, `admin-web/app/admin/reports/report-toolbar.tsx`
- Test: `admin-web/app/admin/reports/report-views.test.tsx` (khối `describe('toolbar')` và `describe('dòng phạm vi dưới tiêu đề')`)

**Interfaces:**
- Consumes: `previousRange`, `compareLabel`, `Compare` (Task 1); `periodLabel`, `shownPeriod`.
- Produces: `ReportBody` truyền `compare: Compare` cho mọi view (prop `compare?: Compare` — view tự gọi `prevOf`). `ReportToolbar` thêm prop `periodText: string`.

- [ ] **Step 1: Sửa test toolbar trước (hỏng):**
  - Một nhóm `aria-label="Loại báo cáo"` duy nhất (bỏ bản điện thoại `grid grid-cols-2`): mỗi nhãn tab xuất hiện **1** lần; có `>Bán hàng<` và (khi đủ 8 tab) `>Tài chính<`; với `tabs` chỉ 4 tab bán hàng → không có `>Tài chính<`.
  - Tab đang chọn có `aria-pressed="true"` (hoặc `aria-current`) và class nền primary.
  - Có nút ô ngày chứa `periodText` (`'16/11/2026'`); render với preset khác `custom` thì chưa có `type="date"`.
  - Nút Xuất Excel dùng `getButtonClasses('primary')`.
  - Test nguồn `reports-screen.tsx`: chứa `Promise.all(` và `previousRange(range.preset, range.from, range.to)`; vẫn giữ các chuỗi kiểm quyền hiện có.
- [ ] **Step 2:** `npx vitest run app/admin/reports/report-views.test.tsx` → FAIL đúng các test vừa sửa.
- [ ] **Step 3: `reports-screen.tsx`:** sau khi có `range`, `tab`, `grain`: nếu `tab === 'revenue' && grain === 'month'` thì không tải kỳ trước; ngược lại `const prev = previousRange(range.preset, range.from, range.to)`; `const [res, prevRes] = await Promise.all([loadReport(tab, range.from, range.to, grain), loadReport(tab, prev.from, prev.to, grain)])`. `compare = { prev: prevRes.ok ? prevRes.report : null, label: compareLabel(range.preset) }`. Tab `debts` không cần tải kỳ trước (delta so với đầu kỳ) — bỏ qua lượt gọi. Truyền `periodText = periodLabel(shownPeriod(…))` xuống toolbar. Khung ngoài: `max-w-7xl`, nền `bg-background`, tiêu đề `text-2xl font-bold`.
- [ ] **Step 4: `report-toolbar.tsx`:** hàng đầu = tiêu đề do screen render; toolbar render: (a) hàng phải: ô ngày (`button`, icon `Calendar`, bấm → `setShowCustom(true)`) + Xuất Excel (primary, icon `Download`); (b) thanh kỳ segmented nền trắng viền, nút chọn `bg-primary-light text-primary ring-1 ring-accent-border`; (c) thanh tab: khung trắng bo 14px `flex flex-wrap`, nhãn nhóm `BÁN HÀNG`/`TÀI CHÍNH` (`hidden md:inline`, chữ 11px in hoa muted), vạch ngăn `hidden md:block`, nút tab có icon lucide (`Utensils`, `Layers`, `Clock`, `Undo2`, `TrendingUp`, `Wallet`, `Scale`, `Users` — map theo `ReportTab`), chọn = `bg-primary text-primary-foreground`. Giữ `reportQuery`, `go()` (tải cứng ngoài modal), form Tuỳ chọn, nhóm Ngày|Tháng.
- [ ] **Step 5:** PASS; mở `/admin/reports` trên dev, thu ngân và chủ quán (xem `memory/feedback_tu_dang_nhap_admin_khi_test` — mint phiên bằng service key), kiểm 375px không cuộn ngang.
- [ ] **Step 6:** commit `feat: khung trang báo cáo mới, so với kỳ trước`.

---

### Task 5: Ba tab bán hàng — Theo món, Theo danh mục, Theo giờ

**Files:**
- Modify: `report-summary.tsx` (thành 4 `KpiCard`), `sales-item-view.tsx`, `sales-category-view.tsx`, `sales-hour-view.tsx`, `reports-screen.tsx` (truyền `compare`)
- Test: `report-views.test.tsx` (khối Theo món / danh mục / giờ / tóm tắt / rỗng)

**Interfaces:**
- Consumes: Task 1–3 (`KpiCard`, `SectionCard`, `Donut`, `AreaChart`, `ShareBar`, `ChartLegend`, `itemCategoryShares`, `categoryShares`, `topItems`, `hourSummary`, `deltaPercent`, `prevOf`).
- Produces: `SalesSummaryBlock({ summary, prev?: SalesSummary | null, compareLabel?: string })`.

Theo spec §5.3 và mockup:
- **Tóm tắt (cả 3 tab):** Doanh thu (`Receipt`, orange), Tiền món (`Utensils`, amber), Giảm giá (`Tag`, violet, inverse, note "x% tiền món"), SL bán (`Package`, green, note "Tặng n"). Giữ dòng "Chưa gồm n bàn đang mở" và banner chênh lệch.
- **Theo món:** lưới `lg:grid-cols-[1.65fr_1fr]`: *Món bán chạy* (top 5, segmented Theo tiền | Theo SL — client state riêng, không đụng sắp xếp bảng; huy hiệu hạng màu `CHART_COLORS[0..4]`; ô chữ cái đầu tô màu nhạt theo màu lát danh mục) + *Tỉ trọng theo danh mục* (donut, tâm = `formatQty(qtySold)`, caption `MÓN BÁN RA`; legend "n món · tiền"; ô nhận xét cam: "**{lát đầu}** mang lại nhiều tiền nhất kỳ này — x% tiền món"). Bảng: giữ cột; cột `%` thêm `ShareBar` (so với dòng lớn nhất đang hiện) — trên `md`.
- **Theo danh mục:** lưới như trên: danh sách `<details>` cũ thêm chấm màu + `ShareBar`; bên phải donut (tâm = `shortMoney(itemsAmount)`, caption `TIỀN MÓN`) + legend.
- **Theo giờ:** `AreaChart` (Tiền món cam trục trái `shortMoney`; Lượt gọi xanh lá trục phải số nguyên; nhãn `"18h"`); dải 4 ô từ `hourSummary`: Giờ cao điểm, Lượt gọi đông nhất, Tổng lượt gọi, TB / lượt gọi. Bảng thêm nhãn "Cao điểm" ở dòng `peakHour` và cột thanh. `HourBars` có thể xoá (cập nhật test cũ của nó sang `AreaChart`).

- [ ] **Step 1: Sửa / thêm test (hỏng):** tóm tắt có `↑ 8,2%` + `so với hôm qua` khi `prev.revenue` cho ra 8,2%, và không có chip khi `prev` null; Theo món có `Món bán chạy`, đúng 5 dòng hạng khi > 5 món, có `mang lại nhiều tiền nhất kỳ này`; Theo danh mục vẫn đủ `<details>` cũ + có donut; Theo giờ có `Giờ cao điểm` + `18:00`, bảng có `Cao điểm` đúng 1 lần; rỗng: 3 view vẫn ra `Chưa có dữ liệu trong kỳ này`, không `<table`, không `NaN`. Giữ các assert cũ còn đúng (tiêu đề cột, `hidden md:table`, `md:hidden`, `28,6%`, lọc danh mục).
- [ ] **Step 2:** FAIL. **Step 3:** dựng 3 view + summary. **Step 4:** PASS.
- [ ] **Step 5:** xem `/admin/reports?tab=item|category|hour` desktop + 375px, so mockup.
- [ ] **Step 6:** commit `feat: báo cáo bán hàng theo món, danh mục, giờ kiểu mới`.

---

### Task 6: Món huỷ + Doanh thu

**Files:**
- Modify: `voids-view.tsx`, `revenue-view.tsx`, `reports-screen.tsx`
- Test: `report-views.test.tsx` (Món huỷ, Doanh thu)

**Interfaces:** Consumes Task 1–3 (`voidTopItems`, `voidReasons`, `revenueExtremes`, `paymentMix`, `PAYMENT_COLORS`, `AreaChart`, `Donut`).

- **Món huỷ:** 3 `KpiCard` (Tiền bỏ `Undo2` red, Tiền tặng `Gift` violet, Giảm SL `ListOrdered` amber — cả 3 inverse, note "n lần …" như cũ), so với `prevOf(compare,'voids').totals`; lưới 2 cột *Món bị huỷ nhiều nhất* (gợi ý "Gộp bỏ + tặng + giảm SL") + *Lý do hay gặp* (thanh đỏ). Bảng như cũ.
- **Doanh thu:** 4 KPI (Doanh thu, Số bill, TB/bill, Giảm giá inverse + note "x% doanh thu"); grain `month` → không delta. Lưới: *Doanh thu & số bill theo ngày|tháng* = `AreaChart` 2 series (thay `RevenueLine` — xoá nó) + dải 3 ô từ `revenueExtremes` ("Ngày/Tháng cao nhất", "TB / ngày|tháng", "Ngày/Tháng thấp nhất"); *Cơ cấu thanh toán* donut `paymentMix` (tâm `shortMoney(revenue)`, caption `DOANH THU`). Bảng như cũ + nhãn "Cao nhất". Bỏ câu chú thích "thu qua ví" cũ nếu donut đã có lát "Ví / khác"; nếu vẫn giữ thì giữ nguyên chữ.

- [ ] **Step 1: Test hỏng:** thay test `RevenueLine` bằng: biểu đồ có 2 đường, đủ nhãn `01/12`…`03/12` từ fixture; `Cơ cấu thanh toán` có `Tiền mặt`/`Chuyển khoản`; chế độ tháng không có `so với`; giữ assert bảng (`3.170.000đ`, `528.333đ`, `>Tổng<`, `3.470.000đ`, `>12/2026<`). Món huỷ: có `Lý do hay gặp`, `Không ghi lý do`, `Món bị huỷ nhiều nhất`; giữ assert cũ.
- [ ] **Step 2:** FAIL. **Step 3:** dựng. **Step 4:** PASS.
- [ ] **Step 5:** xem 2 tab trên dev (chủ quán), desktop + 375px.
- [ ] **Step 6:** commit `feat: báo cáo món huỷ và doanh thu kiểu mới`.

---

### Task 7: Thu chi + Lãi lỗ + Công nợ

**Files:**
- Modify: `cash-flow-view.tsx`, `profit-loss-view.tsx`, `receivables-view.tsx`, `reports-screen.tsx`
- Test: `report-views.test.tsx` (khối tài chính)

**Interfaces:** Consumes Task 1–3 (`outflowBars`, `waterfallSteps`, `marginPercent`, `opexShares`, `topDebtors`, `collectedRate`, `debtAgeDays`, `Waterfall`, `Donut`, `ShareBar`).

- **Thu chi:** 2 thẻ quỹ (Tiền mặt `Coins` green; Ngân hàng / Ngân hàng / ví `Landmark` sky + ghi chú ví như cũ): "Chênh lệch trong kỳ" số to xanh/đỏ (âm vẫn `text-critical` để test cũ đứng), chip delta so với `net` kỳ trước, thanh tỉ lệ vào/ra, dòng Vào/Ra. Khối *Tiền ra đi đâu* (`outflowBars`, thanh xếp chồng TM chart-3 + CK chart-4, ghi chú "Không gồm chuyển quỹ"; rỗng → ẩn khối). Hai bảng Tiền vào / Tiền ra như cũ trong `SectionCard` có chip tổng. Chú thích cuối giữ nguyên.
- **Lãi lỗ:** banner cảnh báo giữ ở đầu. 4 KPI (Doanh thu thuần; Lãi gộp + note "Biên x%"; Chi phí hoạt động inverse; Lãi ròng + "Biên x%", số đỏ khi âm). Lưới: `Waterfall` (*Từ doanh thu đến lãi ròng*) + bảng lãi lỗ dọc cũ (dòng Lãi ròng `bg-success-bg text-success` khi ≥ 0, `bg-critical-bg text-critical` khi âm). Hàng dưới: donut *Chi phí hoạt động* (`opexShares`; không có hạng mục → ẩn donut, giữ khối) + khối xám *Không tính vào lãi lỗ* như cũ.
- **Công nợ:** 4 KPI: Nợ cuối kỳ (inverse, `deltaPercent(closing, opening)`, nhãn "so với đầu kỳ", note "n khách đang nợ" = số dòng closing > 0), Nợ đầu kỳ, Phát sinh, Đã thu (note "Thu được x%"). Lưới: *Tuổi nợ* (thanh ngang 3 màu chart-3/chart-2/đỏ + 3 ô; giữ 3 nhãn `0–7 ngày`, `8–30 ngày`, `Trên 30 ngày`) + *Nợ nhiều nhất* (`topDebtors`, tên là link `/admin/debts?customer=…`). Bảng cũ + nhãn đỏ "n ngày" khi `debtAgeDays(oldestOpenDate, report.head.to || range.to) > 30`.

- [ ] **Step 1: Test hỏng:** Thu chi có `Tiền ra đi đâu` và không có nhãn dòng chuyển quỹ trong khối đó (thêm dòng `reportGroup:'cash_transfer'` vào bản sao fixture); Lãi lỗ có `Từ doanh thu đến lãi ròng`, `Biên`, và với `netProfit:-150000` dòng Lãi ròng mang `bg-critical-bg`; Công nợ có `Nợ nhiều nhất`, `so với đầu kỳ`, `Thu được`. Giữ mọi assert cũ của khối tài chính (đổi assert nào là chuyện cố ý thì ghi lý do trong commit).
- [ ] **Step 2:** FAIL. **Step 3:** dựng. **Step 4:** PASS.
- [ ] **Step 5:** xem 3 tab trên dev (chủ quán), desktop + 375px; thử kỳ lỗ nếu có dữ liệu.
- [ ] **Step 6:** commit `feat: báo cáo thu chi, lãi lỗ, công nợ kiểu mới`.

---

### Task 8: Kiểm toàn bộ + tài liệu

**Files:**
- Create: `docs/superpowers/specs/2026-11-16-bao-cao-mockup.html` (chép mockup)
- Create: `docs/testing/bao-cao-chuyen-nghiep/BAO-CAO-UI.md`
- Modify: `TESTING.md` (một dòng link + trạng thái), `docs/decisions.md` (một dòng cuối bảng chính: "Báo cáo: % so với kỳ trước so kỳ chưa hết với trọn kỳ trước (anh Tú chốt); không sparkline; biểu đồ SVG tự vẽ")

- [ ] **Step 1:** trong `admin-web/`: `npx vitest run` → toàn bộ PASS; `npx tsc --noEmit` sạch; `npm run lint` không thêm lỗi.
- [ ] **Step 2:** từ gốc repo: `python scripts/verify.py` → xanh (nợ cũ không tăng).
- [ ] **Step 3:** chụp 8 tab desktop + 4 tab bán hàng ở 375px (thu ngân) bằng `python scripts/ui_shot.py` hoặc trình duyệt dev; so với mockup; không có `NaN`, không cuộn ngang.
- [ ] **Step 4:** viết checklist `BAO-CAO-UI.md`: nhóm Test 1 khung trang (kỳ, tab, ô ngày, Excel, thu ngân), Test 2 % so với kỳ trước (Hôm nay vs hôm qua, Tháng này, kỳ trước 0đ), Test 3 bán hàng 3 tab, Test 4 Món huỷ + Doanh thu (Ngày/Tháng), Test 5 Thu chi + Lãi lỗ + Công nợ, Test 6 điện thoại 375px, Test 7 số liệu khớp trước-sau (so số tổng với trang Hoá đơn / file Excel cùng kỳ).
- [ ] **Step 5:** commit `docs: checklist test giao diện báo cáo mới`. Dừng, báo anh Tú file + nhóm test (luật CLAUDE.md).
