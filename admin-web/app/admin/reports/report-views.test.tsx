import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SalesHourRow, SalesItemRow, SalesSummary, VoidRow } from '@/lib/reports/sales'
import { REPORT_TABS } from '@/lib/reports/tabs'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

const { default: SalesItemView, categoryOptions, filterItemRows } = await import('./sales-item-view')
const { default: SalesCategoryView } = await import('./sales-category-view')
const { default: SalesHourView, HourBars } = await import('./sales-hour-view')
const { default: VoidsView } = await import('./voids-view')
const { default: ReportToolbar, reportQuery, toolbarKey } = await import('./report-toolbar')
const { default: SalesSummaryBlock } = await import('./report-summary')
const { reportScopeNote } = await import('./report-format')

describe('dòng phạm vi dưới tiêu đề', () => {
  it('3 tab bán hàng: chỉ tính bill đã thu; Món huỷ: theo giờ thao tác, không nói "đã thu"', () => {
    for (const tab of ['item', 'category', 'hour'] as const) expect(reportScopeNote(tab)).toContain('chỉ tính bill đã thu tiền')
    expect(reportScopeNote('voids')).not.toContain('đã thu')
    expect(reportScopeNote('voids')).toContain('giờ thao tác')
    const screen = readFileSync(join(__dirname, 'reports-screen.tsx'), 'utf8')
    expect(screen).not.toContain('chỉ tính bill đã thu tiền')
    expect(screen).toContain('reportScopeNote(tab)')
  })

  it('màn hình chỉ mở tab tài chính cho vai hậu cần (isBackOfficeRole), thu ngân về Theo món', () => {
    const screen = readFileSync(join(__dirname, 'reports-screen.tsx'), 'utf8')
    expect(screen).toContain('const canSeeFinance = isBackOfficeRole(operator.role)')
    expect(screen).toContain('reportTabsFor(canSeeFinance)')
    expect(screen).toContain('parseReportTab(sp.tab, canSeeFinance)')
    expect(screen).not.toMatch(/parseReportTab\([^)]*, false\)/)
    // Chế độ tháng: nhãn kỳ đầu trang theo 12 tháng thật của báo cáo; tab tài chính có nút Excel (kèm grain).
    expect(screen).toContain('periodLabel(shownPeriod(res.ok ? res.report : { tab }, range))')
    expect(screen).not.toContain('isFinanceTab(tab) ? null')
    // Doanh thu cũng chỉ tính bill đã thu (cùng câu với tab bán hàng); ba tab còn lại có câu riêng.
    expect(reportScopeNote('revenue')).toBe(reportScopeNote('item'))
    for (const tab of ['cashflow', 'pnl', 'debts'] as const) expect(reportScopeNote(tab)).not.toBe(reportScopeNote('item'))
  })
})

// Dữ liệu "ngày D" của test SQL mig 117 (quán 05:00, bill A/B).
const item = (itemName: string, categoryId: string | null, categoryName: string, qtySold: number, qtyGift: number, amount: number): SalesItemRow =>
  ({ itemName, categoryId, categoryName, qtySold, qtyGift, amount })
const ITEMS: SalesItemRow[] = [
  item('Bia Hà Nội lon', 'c-do', 'Đồ uống', 15, 0, 300000),
  item('Lẩu thái', 'c-lau', 'Lẩu', 1, 0, 300000),
  item('Ba chỉ nướng', 'c-nuong', 'Nướng', 2, 1, 240000),
  item('Bia hơi (Tháp)', 'c-do', 'Đồ uống', 1, 0, 150000),
  item('Món cũ', null, 'Khác', 1, 0, 60000),
]
const SUMMARY: SalesSummary = { itemsAmount: 1050000, discountTotal: 40000, revenue: 1010000, qtySold: 20, qtyGift: 1, openTablesCount: 0 }
const HOURS: SalesHourRow[] = [
  { hour: 18, ordersCount: 2, itemsQty: 19, amount: 840000 },
  { hour: 4, ordersCount: 1, itemsQty: 2, amount: 210000 },
]
const VOIDS: VoidRow[] = [
  { at: '2026-11-20T11:55:00Z', type: 'cancelled', tableLabel: 'A1', itemName: 'Lẩu riêu', quantity: 1, amount: 250000, reason: 'Bếp hết', byName: 'Thu ngân' },
  { at: '2026-11-20T11:40:00Z', type: 'quantity', tableLabel: 'A1', itemName: 'Bia Hà Nội lon', quantity: 2, amount: 40000, reason: 'Khách trả lại', byName: 'Thu ngân' },
  { at: '2026-11-20T11:30:00Z', type: 'gift', tableLabel: 'A1', itemName: 'Ba chỉ nướng', quantity: 1, amount: 120000, reason: null, byName: 'Chủ quán' },
]
const VOID_TOTALS = { cancelledAmount: 250000, giftAmount: 120000, reducedAmount: 40000, count: 3 }

const count = (html: string, needle: string) => html.split(needle).length - 1
/** Nội dung trong khối đầu tiên có thuộc tính `attr` (đủ cho test markup tĩnh). */
const slice = (html: string, attr: string) => {
  const start = html.indexOf(attr)
  expect(start, attr).toBeGreaterThan(-1)
  return html.slice(start)
}

describe('Theo món', () => {
  it('Theo món: có cả bảng md và thẻ mobile, đủ 5 món, % đúng một chữ số', () => {
    const html = renderToStaticMarkup(<SalesItemView rows={ITEMS} itemsAmount={SUMMARY.itemsAmount} />)
    expect(html).toContain('hidden md:table')
    expect(html).toContain('md:hidden')
    for (const r of ITEMS) expect(count(html, `>${r.itemName}<`), r.itemName).toBe(2) // một ở bảng, một ở thẻ
    expect(html).toContain('28,6%')
    expect(html).toContain('5,7%')
    expect(html).toContain('300.000đ')
    for (const head of ['Món', 'SL bán', 'SL tặng', 'Tiền', '%']) expect(html).toContain(`>${head}</th>`)
  })

  it('Theo món lọc danh mục Khác chỉ còn "Món cũ"', () => {
    expect(filterItemRows(ITEMS, 'other').map((r) => r.itemName)).toEqual(['Món cũ'])
    expect(filterItemRows(ITEMS, 'c-do').map((r) => r.itemName)).toEqual(['Bia Hà Nội lon', 'Bia hơi (Tháp)'])
    expect(filterItemRows(ITEMS, 'all')).toEqual(ITEMS)
    expect(categoryOptions(ITEMS)).toEqual([
      { value: 'all', label: 'Tất cả' },
      { value: 'c-do', label: 'Đồ uống' },
      { value: 'c-lau', label: 'Lẩu' },
      { value: 'c-nuong', label: 'Nướng' },
      { value: 'other', label: 'Khác' },
    ])
    expect(categoryOptions(ITEMS.slice(0, 2)).map((o) => o.value)).toEqual(['all', 'c-do', 'c-lau'])
  })
})

describe('Theo danh mục', () => {
  it('mỗi danh mục một <details>, tối đa 10 món khi mở', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ itemName: `Món ${i + 1}`, qtySold: 1, qtyGift: 0, amount: 1000 }))
    const html = renderToStaticMarkup(<SalesCategoryView itemsAmount={462000} rows={[
      { categoryId: 'c-do', categoryName: 'Đồ uống', qtySold: 16, qtyGift: 0, amount: 450000,
        items: [{ itemName: 'Bia Hà Nội lon', qtySold: 15, qtyGift: 0, amount: 300000 }, { itemName: 'Bia hơi (Tháp)', qtySold: 1, qtyGift: 0, amount: 150000 }] },
      { categoryId: null, categoryName: 'Khác', qtySold: 12, qtyGift: 0, amount: 12000, items: many },
    ]} />)
    expect(count(html, '<details')).toBe(2)
    expect(html).toContain('Đồ uống')
    expect(html).toContain('97,4%')
    expect(html).toContain('>Món 10<')
    expect(html).not.toContain('>Món 11<')
    expect(html).toContain('Còn 2 món khác')
  })
})

describe('Theo giờ', () => {
  it('Theo giờ: thanh dài nhất là 18:00, 04:00 đứng sau', () => {
    const html = renderToStaticMarkup(<HourBars rows={HOURS} />)
    expect(html.indexOf('18:00')).toBeGreaterThan(-1)
    expect(html.indexOf('18:00')).toBeLessThan(html.indexOf('04:00'))
    const widths = [...html.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]))
    expect(widths).toEqual([100, 25])
  })

  it('bảng Giờ, Lượt gọi, SL món, Tiền và thẻ mobile', () => {
    const html = renderToStaticMarkup(<SalesHourView rows={HOURS} />)
    for (const head of ['Giờ', 'Lượt gọi', 'SL món', 'Tiền']) expect(html).toContain(`>${head}</th>`)
    expect(html).toContain('hidden md:table')
    expect(html).toContain('md:hidden')
    expect(html).toContain('840.000đ')
  })

  it('tất cả 0đ: không chia cho 0', () => {
    const html = renderToStaticMarkup(<HourBars rows={[{ hour: 9, ordersCount: 1, itemsQty: 1, amount: 0 }]} />)
    expect(html).toContain('width:0%')
  })
})

describe('Món huỷ', () => {
  it('Món huỷ: nhãn Bỏ / Tặng / Giảm SL và ba ô tổng', () => {
    const html = renderToStaticMarkup(<VoidsView totals={VOID_TOTALS} rows={VOIDS} />)
    for (const label of ['Tiền bỏ', 'Tiền tặng', 'Giảm SL']) expect(html).toContain(label)
    expect(html).toContain('250.000đ')
    expect(html).toContain('120.000đ')
    expect(html).toContain('40.000đ')
    for (const t of ['>Bỏ<', '>Tặng<', '>Giảm SL<']) expect(count(html, t), t).toBeGreaterThanOrEqual(2)
    for (const head of ['Giờ', 'Bàn', 'Món', 'SL', 'Tiền', 'Loại', 'Lý do', 'Người làm']) expect(html).toContain(`>${head}</th>`)
    expect(html).toContain('Bếp hết')
    expect(html).toContain('hidden md:table')
    expect(html).toContain('18:55')
  })
})

describe('rỗng', () => {
  it('rỗng: Chưa có dữ liệu trong kỳ này', () => {
    const htmls = [
      renderToStaticMarkup(<SalesItemView rows={[]} itemsAmount={0} />),
      renderToStaticMarkup(<SalesCategoryView rows={[]} itemsAmount={0} />),
      renderToStaticMarkup(<SalesHourView rows={[]} />),
      renderToStaticMarkup(<VoidsView totals={{ cancelledAmount: 0, giftAmount: 0, reducedAmount: 0, count: 0 }} rows={[]} />),
    ]
    for (const html of htmls) {
      expect(html).toContain('Chưa có dữ liệu trong kỳ này')
      expect(html).not.toContain('<table')
    }
  })
})

describe('tóm tắt', () => {
  it('4 ô Tiền món, Giảm giá, Doanh thu, SL bán; không chênh thì không cảnh báo', () => {
    const html = renderToStaticMarkup(<SalesSummaryBlock summary={SUMMARY} />)
    for (const label of ['Tiền món', 'Giảm giá', 'Doanh thu', 'SL bán']) expect(html).toContain(label)
    expect(html).toContain('1.010.000đ')
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('md:grid-cols-4')
    expect(html).not.toContain('Chênh lệch')
    expect(html).not.toContain('bàn đang mở')
  })

  it('có bàn mở và chênh lệch: dòng nhỏ + banner cảnh báo', () => {
    const html = renderToStaticMarkup(<SalesSummaryBlock summary={{ ...SUMMARY, revenue: 1000000, openTablesCount: 3 }} />)
    expect(html).toContain('Chưa gồm 3 bàn đang mở')
    expect(html).toContain('Chênh lệch 10.000đ do dữ liệu cũ, đối chiếu với Hoá đơn')
  })
})

describe('toolbar', () => {
  const base = { tab: 'item' as const, preset: 'today' as const, from: '2026-11-20', to: '2026-11-20', today: '2026-11-20', tabs: REPORT_TABS, inModal: false }

  it('toolbar: 6 nút kỳ, nút Xuất Excel trỏ /admin/reports/export?tab=item&from=…&to=…', () => {
    const exportHref = '/admin/reports/export?tab=item&from=2026-11-20&to=2026-11-20'
    const html = renderToStaticMarkup(<ReportToolbar {...base} exportHref={exportHref} />)
    const periods = slice(html, 'aria-label="Kỳ báo cáo"')
    const periodList = periods.slice(0, periods.indexOf('</div>'))
    expect(count(periodList, '<button')).toBe(6)
    expect(count(periodList, 'aria-pressed="true"')).toBe(1)
    expect(periodList).toMatch(/aria-pressed="true"[^>]*>Hôm nay</)
    for (const l of ['Hôm nay', 'Hôm qua', '7 ngày', 'Tháng này', 'Tháng trước', 'Tuỳ chọn']) expect(periodList).toContain(l)
    const tabs = slice(html, 'aria-label="Loại báo cáo"')
    for (const l of ['Theo món', 'Theo danh mục', 'Theo giờ', 'Món huỷ']) expect(count(tabs, `>${l}<`), l).toBe(2) // md + điện thoại
    expect(html).toContain('aria-label="Loại báo cáo (điện thoại)" class="grid grid-cols-2')
    expect(html).toContain(`href="${exportHref.replace(/&/g, '&amp;')}"`)
    expect(html).toContain('Xuất Excel')
    expect(html).not.toContain('type="date"')
  })

  it('kỳ Tuỳ chọn: hai ô ngày max = hôm nay + nút Xem', () => {
    const html = renderToStaticMarkup(<ReportToolbar {...base} preset="custom" from="2026-11-01" exportHref="/x" />)
    expect(count(html, 'type="date"')).toBe(2)
    expect(count(html, 'max="2026-11-20"')).toBe(2)
    expect(html).toContain('value="2026-11-01"')
    expect(html).toContain('>Xem<')
  })

  it('toolbar gắn key theo kỳ: router.replace trong hộp thoại dựng lại ô ngày, không giữ ngày cũ', () => {
    const k = (preset: 'custom' | 'today', from: string, to: string) => toolbarKey({ preset, from, to })
    expect(k('custom', '2026-11-01', '2026-11-20')).not.toBe(k('custom', '2026-11-02', '2026-11-20'))
    expect(k('custom', '2026-11-01', '2026-11-20')).not.toBe(k('custom', '2026-11-01', '2026-11-19'))
    expect(k('custom', '2026-11-20', '2026-11-20')).not.toBe(k('today', '2026-11-20', '2026-11-20'))
    // Màn hình phải thật sự truyền key này (đổi kỳ trong hộp thoại không gỡ component nên state nháp sẽ cũ).
    const screen = readFileSync(join(__dirname, 'reports-screen.tsx'), 'utf8')
    expect(screen).toMatch(/<ReportToolbar\s+key=\{toolbarKey\(range\)\}/)
  })

  it('reportQuery giữ khoá còn lại; preset nhanh không mang from/to', () => {
    const cur = { tab: 'hour' as const, preset: 'custom' as const, from: '2026-11-01', to: '2026-11-20' }
    expect(reportQuery(cur, { tab: 'voids' })).toBe('tab=voids&period=custom&from=2026-11-01&to=2026-11-20')
    expect(reportQuery(cur, { preset: '7d' })).toBe('tab=hour&period=7d')
    expect(reportQuery({ ...cur, preset: 'yesterday' }, { tab: 'item' })).toBe('tab=item&period=yesterday')
    expect(reportQuery({ ...cur, preset: 'today' }, { preset: 'custom', from: '2026-11-03', to: '2026-11-04' }))
      .toBe('tab=hour&period=custom&from=2026-11-03&to=2026-11-04')
  })

  it('tab Doanh thu: nút Ngày | Tháng; grain chỉ đi theo tab Doanh thu', () => {
    const cur = { tab: 'revenue' as const, preset: '7d' as const, from: '2026-11-14', to: '2026-11-20', grain: 'day' as const }
    expect(reportQuery(cur, { grain: 'month' })).toBe('tab=revenue&period=7d&grain=month')
    expect(reportQuery({ ...cur, grain: 'month' }, { tab: 'pnl' })).toBe('tab=pnl&period=7d')
    expect(reportQuery(cur, {})).toBe('tab=revenue&period=7d')
    const html = renderToStaticMarkup(<ReportToolbar tab="revenue" grain="month" preset="7d" from="2026-11-14" to="2026-11-20"
      today="2026-11-20" tabs={REPORT_TABS} inModal={false} exportHref={null} />)
    const g = slice(html, 'aria-label="Chế độ xem"')
    const group = g.slice(0, g.indexOf('</div>'))
    expect(group).toMatch(/aria-pressed="true"[^>]*>Tháng</)
    expect(group).toContain('>Ngày<')
    // Chưa có Excel cho tab tài chính (Task 11): không hiện nút.
    expect(html).not.toContain('Xuất Excel')
    const item = renderToStaticMarkup(<ReportToolbar tab="item" preset="7d" from="2026-11-14" to="2026-11-20"
      today="2026-11-20" tabs={REPORT_TABS} inModal={false} exportHref="/x" />)
    expect(item).not.toContain('aria-label="Chế độ xem"')
  })
})

// ================================================================================================================
// 4 tab tài chính — dữ liệu là JSON thật của RPC mig 125 (lib/reports/__fixtures__/rpc-125.json).
// ================================================================================================================
describe('tab tài chính', async () => {
  const rpc125 = (await import('@/lib/reports/__fixtures__/rpc-125.json')).default
  const { parseFinanceReport } = await import('@/lib/reports/finance')
  const { default: RevenueView, RevenueLine } = await import('./revenue-view')
  const { default: CashFlowView } = await import('./cash-flow-view')
  const { default: ProfitLossView } = await import('./profit-loss-view')
  const { default: ReceivablesView } = await import('./receivables-view')
  const as = <T extends string>(tab: T, raw: unknown) => {
    const r = parseFinanceReport(tab as never, raw)
    if (r.tab !== tab) throw new Error('sai tab')
    return r as Extract<typeof r, { tab: T }>
  }

  it('Doanh thu: SVG có một polyline, số điểm bằng số dòng; 375px bảng thành thẻ', () => {
    const r = as('revenue', rpc125.report_revenue_series_day)
    const chart = renderToStaticMarkup(<RevenueLine rows={r.rows} grain="day" />)
    expect(count(chart, '<polyline')).toBe(1)
    const points = /points="([^"]*)"/.exec(chart)![1].trim().split(/\s+/)
    expect(points).toHaveLength(3)
    expect(count(chart, '<circle')).toBe(3)
    expect(chart).toContain('viewBox="0 0 600 160"')
    expect(chart).toContain('preserveAspectRatio="none"')
    expect(chart).toContain('width="100%"')
    expect(chart).toContain('>01/12<')
    expect(chart).toContain('>03/12<')
    const html = renderToStaticMarkup(<RevenueView report={r} />)
    expect(html).toContain('hidden md:table')
    expect(html).toContain('md:hidden')
    for (const head of ['Ngày', 'Doanh thu', 'Giảm giá', 'Tiền mặt', 'Chuyển khoản', 'Ghi nợ', 'Số bill', 'TB/bill']) {
      expect(html).toContain(`>${head}</th>`)
    }
    expect(html).toContain('3.170.000đ')
    expect(html).toContain('528.333đ') // 3.170.000 / 6 bill
    expect(html).toContain('>Tổng<')
    expect(html).toContain('3.470.000đ')
    const month = renderToStaticMarkup(<RevenueView report={as('revenue', rpc125.report_revenue_series_month)} />)
    expect(month).toContain('>Tháng</th>')
    expect(month).toContain('>12/2026<')
    // Kỳ không có dòng nào: không chia cho 0, không vẽ đường.
    expect(renderToStaticMarkup(<RevenueLine rows={[]} grain="day" />)).not.toContain('<polyline')
  })

  it('Thu chi: hai quỹ, âm tô đỏ, quỹ ngân hàng ghi "Ngân hàng / ví" khi có ví, chú thích', () => {
    const r = as('cashflow', rpc125.report_cash_flow)
    const html = renderToStaticMarkup(<CashFlowView report={r} />)
    expect(html).toContain('Tiền mặt')
    expect(html).toContain('Ngân hàng / ví')
    expect(html).toContain('Tiền ví về tài khoản ngân hàng khi đối soát')
    expect(html).toMatch(/text-critical[^>]*>-500\.000đ</)
    expect(html).toContain('1.320.000đ')
    for (const l of ['Thu bill', 'Thu qua ví', 'Thu nợ', 'Nộp thêm vào két', 'Thu khác', 'Nhập hàng', 'Đi chợ', 'Lương - thưởng', 'Chủ quán rút']) {
      expect(count(html, `>${l}<`), l).toBeGreaterThanOrEqual(2) // bảng md + thẻ mobile
    }
    expect(html).toContain('Ghi nợ không tính là tiền vào. Không có số dư đầu kỳ.')
    expect(html).toContain('Phiếu huỷ sau này không còn tính vào kỳ đã qua.')
    // Không có dòng ví: thẻ quỹ ghi "Ngân hàng" thường, không có chú thích ví.
    const noWallet = { ...r, inflows: r.inflows.filter((x) => x.key !== 'wallet') }
    const plain = renderToStaticMarkup(<CashFlowView report={noWallet} />)
    expect(plain).not.toContain('Ngân hàng / ví')
    expect(plain).not.toContain('khi đối soát')
  })

  it('Lãi lỗ: có cảnh báo vàng khi chưa kiểm kho, có khối Không tính vào lãi lỗ', () => {
    const r = as('pnl', rpc125.report_profit_loss)
    const html = renderToStaticMarkup(<ProfitLossView report={r} />)
    expect(html).toContain('Giá vốn nguyên liệu chưa tính — cần kiểm kho')
    expect(html).toContain('Thiếu giá nhập: Đá viên')
    const order = ['Doanh thu thuần', 'Giá vốn hàng bán', 'Lãi gộp', 'Chi phí hoạt động', 'Hàng huỷ', 'Thu nhập khác', 'Lãi ròng']
    const pos = order.map((l) => html.indexOf(l))
    expect(pos.every((x) => x >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
    expect(html).toContain('2.950.000đ')
    expect(html).toContain('2.140.000đ')
    expect(html).toContain('Lương - thưởng')
    const ex = slice(html, 'Không tính vào lãi lỗ')
    expect(ex).toContain('Nhập hàng')
    expect(ex).toContain('600.000đ')
    expect(ex).toContain('Chủ quán rút')
    expect(ex).toContain('2.000.000đ')
    expect(ex).toContain('Chuyển quỹ (tổng phiếu, không tính)')
    expect(html).toContain('Phiếu huỷ sau này không còn tính vào kỳ đã qua.')
    // Đã kiểm kho đủ, không thiếu giá: không có cảnh báo.
    const ok = renderToStaticMarkup(<ProfitLossView report={{ ...r, warnings: { ingredientUncounted: false, missingCostItems: [] } }} />)
    expect(ok).not.toContain('cần kiểm kho')
    expect(ok).not.toContain('Thiếu giá nhập')
    // Lãi ròng âm tô đỏ.
    const loss = renderToStaticMarkup(<ProfitLossView report={{ ...r, netProfit: -150000 }} />)
    expect(loss).toMatch(/text-critical[^>]*>-150\.000đ</)
  })

  it('Công nợ: link /admin/debts?customer=<id>, ba ô tuổi nợ', () => {
    const r = as('debts', rpc125.report_receivables)
    const html = renderToStaticMarkup(<ReceivablesView report={r} />)
    for (const l of ['0–7 ngày', '8–30 ngày', 'Trên 30 ngày']) expect(html).toContain(l)
    for (const x of r.rows) expect(html).toContain(`href="/admin/debts?customer=${x.customerId}"`)
    for (const head of ['Tên', 'Nợ đầu kỳ', 'Phát sinh', 'Đã thu', 'Nợ cuối kỳ', 'Bill nợ cũ nhất']) expect(html).toContain(`>${head}</th>`)
    expect(html).toContain('hidden md:table')
    expect(html).toContain('md:hidden')
    expect(html).toContain('>01/12/2026<')
    expect(html).toContain('>Tổng<')
    expect(html).toContain('650.000đ')
    expect(renderToStaticMarkup(<ReceivablesView report={{ ...r, rows: [] }} />)).toContain('Chưa có dữ liệu trong kỳ này')
  })
})
