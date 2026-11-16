import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SalesHourRow, SalesItemRow, SalesSummary, VoidRow } from '@/lib/reports/sales'
import { REPORT_TABS, reportTabsFor } from '@/lib/reports/tabs'
import { getButtonClasses } from '@/components/ui/button-classes'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

const { default: SalesItemView, categoryOptions, filterItemRows } = await import('./sales-item-view')
const { default: SalesCategoryView } = await import('./sales-category-view')
const { default: SalesHourView } = await import('./sales-hour-view')
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
    // Kỳ trước tải song song với kỳ hiện tại.
    expect(screen).toContain('Promise.all(')
    expect(screen).toContain('previousRange(range.preset, range.from, range.to)')
  })

  it('ReportBody truyền kỳ trước đúng tab và nhãn so sánh cho 3 tab bán hàng', () => {
    const screen = readFileSync(join(__dirname, 'reports-screen.tsx'), 'utf8')
    for (const tab of ['item', 'category', 'hour']) expect(screen).toContain(`prevOf(compare, '${tab}')`)
    expect(count(screen, 'prev={prev?.summary}')).toBe(3)
    expect(count(screen, 'compareLabel={compare.label}')).toBe(7) // 3 tab bán hàng + Món huỷ + Doanh thu + Thu chi + Lãi lỗ (Công nợ so với đầu kỳ, không cần)
    expect(screen).toContain("prevOf(compare, 'cashflow')?.funds")
    expect(screen).toContain("prevOf(compare, 'pnl')")
    expect(screen).toContain("prevOf(compare, 'voids')")
    expect(screen).toContain("report.grain === 'month' ? null : prevOf(compare, 'revenue')")
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
    for (const r of ITEMS) expect(count(html, `>${r.itemName}<`), r.itemName).toBe(3) // bảng, thẻ mobile và danh sách Món bán chạy (top 5 = cả 5 món)
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

describe('Theo món (kiểu mới)', () => {
  const MANY: SalesItemRow[] = Array.from({ length: 7 }, (_, i) => item(`Món số ${i + 1}`, i < 4 ? 'c-a' : 'c-b', i < 4 ? 'Nhóm A' : 'Nhóm B', 3, 0, (7 - i) * 10000))

  it('có Món bán chạy, đúng 5 dòng hạng khi > 5 món, ô nhận xét và donut', () => {
    const html = renderToStaticMarkup(<SalesItemView rows={MANY} itemsAmount={280000} />)
    expect(html).toContain('Món bán chạy')
    expect(count(html, 'data-rank=')).toBe(5)
    expect(html).toContain('mang lại nhiều tiền nhất kỳ này')
    expect(html).toContain('MÓN BÁN RA')
    expect(html).toContain('lg:grid-cols-[1.65fr_1fr]')
    expect(html).toContain('Theo tiền')
    expect(html).toContain('Theo SL')
  })

  it('bảng có ShareBar trong cột %', () => {
    const html = renderToStaticMarkup(<SalesItemView rows={ITEMS} itemsAmount={SUMMARY.itemsAmount} />)
    expect(html).toContain('rounded-full bg-secondary')
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
    expect(html).toContain('TIỀN MÓN') // donut bên phải
    expect(html).toContain('lg:grid-cols-[1.65fr_1fr]')
  })
})

describe('Theo giờ', () => {
  it('biểu đồ vùng có hai bản (desktop và gọn cho mobile), dải 4 ô, 18:00 đứng trước 04:00', () => {
    const html = renderToStaticMarkup(<SalesHourView rows={HOURS} />)
    expect(count(html, 'aria-label="Tiền món và lượt gọi theo giờ"')).toBe(2)
    expect(html).toContain('hidden md:block')
    expect(html).toContain('md:hidden')
    for (const l of ['Giờ cao điểm', 'Lượt gọi đông nhất', 'Tổng lượt gọi', 'TB / lượt gọi']) expect(html).toContain(l)
    expect(html).toContain('18:00')
    expect(html.indexOf('18:00')).toBeLessThan(html.indexOf('04:00'))
    expect(count(html, 'Cao điểm')).toBe(1) // chỉ ở bảng, đúng một dòng
  })

  it('bảng Giờ, Lượt gọi, SL món, Tiền và thẻ mobile', () => {
    const html = renderToStaticMarkup(<SalesHourView rows={HOURS} />)
    for (const head of ['Giờ', 'Lượt gọi', 'SL món', 'Tiền']) expect(html).toContain(`>${head}</th>`)
    expect(html).toContain('hidden md:table')
    expect(html).toContain('840.000đ')
  })

  it('0 lượt gọi: ẩn ô Lượt gọi đông nhất và TB / lượt gọi; không NaN', () => {
    const html = renderToStaticMarkup(<SalesHourView rows={[{ hour: 9, ordersCount: 0, itemsQty: 0, amount: 50000 }]} />)
    expect(html).not.toContain('Lượt gọi đông nhất')
    expect(html).not.toContain('TB / lượt gọi')
    expect(html).toContain('Giờ cao điểm')
    expect(html).not.toContain('NaN')
  })

  it('mọi số 0: báo rỗng, không chia cho 0', () => {
    const html = renderToStaticMarkup(<SalesHourView rows={[{ hour: 9, ordersCount: 0, itemsQty: 0, amount: 0 }]} />)
    expect(html).toContain('Chưa có dữ liệu trong kỳ này')
    expect(html).not.toContain('NaN')
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

  it('Món huỷ (kiểu mới): top món, lý do hay gặp, chip so kỳ trước, lý do trống gộp "Không ghi lý do"', () => {
    const prev = { cancelledAmount: 500000, giftAmount: 120000, reducedAmount: 20000, count: 5 }
    const html = renderToStaticMarkup(<VoidsView totals={VOID_TOTALS} rows={VOIDS} prev={prev} compareLabel="so với hôm qua" />)
    for (const l of ['Món bị huỷ nhiều nhất', 'Gộp bỏ + tặng + giảm SL', 'Lý do hay gặp', 'Không ghi lý do', 'Lẩu riêu']) expect(html).toContain(l)
    expect(html).toContain('so với hôm qua')
    // Tiền bỏ giảm 50% là tốt (inverse) → chip xanh
    expect(html).toMatch(/bg-success-bg text-success[^>]*>↓ 50,0%/)
    // Lý do chỉ có khoảng trắng cũng là "Không ghi lý do"
    const blank = VOIDS.map((r) => (r.reason === null ? { ...r, reason: '   ' } : r))
    expect(count(renderToStaticMarkup(<VoidsView totals={VOID_TOTALS} rows={blank} />), 'Không ghi lý do')).toBeGreaterThanOrEqual(2)
    // Không có kỳ trước: không chip
    expect(renderToStaticMarkup(<VoidsView totals={VOID_TOTALS} rows={VOIDS} />)).not.toContain('so với')
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
      expect(html).not.toContain('NaN')
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

  it('delta so với kỳ trước: ↑ 8,2% kèm nhãn; không có kỳ trước thì không chip', () => {
    const prev = { ...SUMMARY, revenue: Math.round(SUMMARY.revenue / 1.082) }
    const html = renderToStaticMarkup(<SalesSummaryBlock summary={SUMMARY} prev={prev} compareLabel="so với hôm qua" />)
    expect(html).toContain('↑ 8,2%')
    expect(html).toContain('so với hôm qua')
    const none = renderToStaticMarkup(<SalesSummaryBlock summary={SUMMARY} prev={null} compareLabel="so với hôm qua" />)
    expect(none).not.toContain('↑')
    expect(none).not.toContain('so với hôm qua')
  })

  it('có bàn mở và chênh lệch: dòng nhỏ + banner cảnh báo', () => {
    const html = renderToStaticMarkup(<SalesSummaryBlock summary={{ ...SUMMARY, revenue: 1000000, openTablesCount: 3 }} />)
    expect(html).toContain('Chưa gồm 3 bàn đang mở')
    expect(html).toContain('Chênh lệch 10.000đ do dữ liệu cũ, đối chiếu với Hoá đơn')
  })
})

describe('toolbar', () => {
  const base = { periodText: '16/11/2026', tab: 'item' as const, preset: 'today' as const, from: '2026-11-20', to: '2026-11-20', today: '2026-11-20', tabs: REPORT_TABS, inModal: false }

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
    for (const l of ['Theo món', 'Theo danh mục', 'Theo giờ', 'Món huỷ']) expect(count(tabs, `>${l}<`), l).toBe(1) // một thanh duy nhất
    expect(html).not.toContain('Loại báo cáo (điện thoại)')
    expect(html).toContain('>Bán hàng<')
    expect(html).toContain('>Tài chính<') // đủ 8 tab
    const cashier = renderToStaticMarkup(<ReportToolbar {...base} tabs={reportTabsFor(false)} exportHref="/x" />)
    expect(cashier).toContain('>Bán hàng<')
    expect(cashier).not.toContain('>Tài chính<') // thu ngân chỉ thấy 4 tab bán hàng
    expect(tabs).toMatch(/aria-pressed="true"[^>]*class="[^"]*bg-primary[^"]*"[^>]*>(<svg.*?<\/svg>)?Theo món</)
    expect(html).toContain('>16/11/2026<')
    expect(html).toContain(getButtonClasses('primary'))
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
    const html = renderToStaticMarkup(<ReportToolbar periodText="x" tab="revenue" grain="month" preset="7d" from="2026-11-14" to="2026-11-20"
      today="2026-11-20" tabs={REPORT_TABS} inModal={false} exportHref={null} />)
    const g = slice(html, 'aria-label="Chế độ xem"')
    const group = g.slice(0, g.indexOf('</div>'))
    expect(group).toMatch(/aria-pressed="true"[^>]*>Tháng</)
    expect(group).toContain('>Ngày<')
    // Chưa có Excel cho tab tài chính (Task 11): không hiện nút.
    expect(html).not.toContain('Xuất Excel')
    const item = renderToStaticMarkup(<ReportToolbar periodText="x" tab="item" preset="7d" from="2026-11-14" to="2026-11-20"
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
  const { default: RevenueView } = await import('./revenue-view')
  const { default: CashFlowView } = await import('./cash-flow-view')
  const { default: ProfitLossView } = await import('./profit-loss-view')
  const { default: ReceivablesView } = await import('./receivables-view')
  const as = <T extends string>(tab: T, raw: unknown) => {
    const r = parseFinanceReport(tab as never, raw)
    if (r.tab !== tab) throw new Error('sai tab')
    return r as Extract<typeof r, { tab: T }>
  }

  it('Doanh thu: biểu đồ vùng 2 đường, dải 3 ô, cơ cấu thanh toán; 375px bảng thành thẻ', () => {
    const r = as('revenue', rpc125.report_revenue_series_day)
    const html = renderToStaticMarkup(<RevenueView report={r} />)
    // Hai bản biểu đồ (desktop + gọn mobile), mỗi bản 2 đường (doanh thu, số bill)
    expect(count(html, 'aria-label="Doanh thu và số bill theo thời gian"')).toBe(2)
    expect(count(html, 'fill="none" stroke="var(--chart-1)" stroke-width="2.5"')).toBe(2)
    expect(count(html, 'fill="none" stroke="var(--chart-3)" stroke-width="2.5"')).toBe(2)
    expect(html).not.toContain('<polyline')
    expect(html).toContain('>01/12<')
    expect(html).toContain('>03/12<')
    for (const l of ['Doanh thu &amp; số bill theo ngày', 'Ngày cao nhất', 'TB / ngày', 'Ngày thấp nhất', 'Cơ cấu thanh toán', 'Tiền mặt', 'Chuyển khoản', 'DOANH THU', 'Cao nhất']) expect(html).toContain(l)
    expect(html).toContain('hidden md:table')
    expect(html).toContain('md:hidden')
    for (const head of ['Ngày', 'Doanh thu', 'Giảm giá', 'Tiền mặt', 'Chuyển khoản', 'Ghi nợ', 'Số bill', 'TB/bill']) {
      expect(html).toContain(`>${head}</th>`)
    }
    expect(html).toContain('3.170.000đ')
    expect(html).toContain('528.333đ') // 3.170.000 / 6 bill
    expect(html).toContain('>Tổng<')
    expect(html).toContain('3.470.000đ')
    expect(html).not.toContain('so với') // không có kỳ trước
    // Có kỳ trước: chip; Giảm giá có ghi chú % doanh thu
    const withPrev = renderToStaticMarkup(<RevenueView report={r} prev={{ ...r.totals, revenue: r.totals.revenue * 2 }} compareLabel="so với hôm qua" />)
    expect(withPrev).toContain('so với hôm qua')
    expect(withPrev).toContain('doanh thu')
    // Chế độ tháng: dù lỡ truyền kỳ trước cũng không hiện "so với"
    const month = renderToStaticMarkup(<RevenueView report={as('revenue', rpc125.report_revenue_series_month)} prev={r.totals} compareLabel="so với hôm qua" />)
    expect(month).toContain('>Tháng</th>')
    expect(month).toContain('>12/2026<')
    expect(month).toContain('Doanh thu &amp; số bill theo tháng')
    expect(month).not.toContain('so với')
    // Kỳ không có dòng nào: báo rỗng, không vẽ biểu đồ, không NaN
    const empty = renderToStaticMarkup(<RevenueView report={{ ...r, rows: [] }} />)
    expect(empty).toContain('Chưa có dữ liệu trong kỳ này')
    expect(empty).not.toContain('role="img"')
    expect(empty).not.toContain('NaN')
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
    // Thứ tự dòng chỉ kiểm trong bảng lãi lỗ dọc (thẻ KPI phía trên cũng có tên "Lãi gộp", "Lãi ròng"…).
    const table = html.slice(html.indexOf('<section class="min-w-0 divide-y'))
    const pos = order.map((l) => table.indexOf(l))
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

  it('Thu chi kiểu mới: Chênh lệch trong kỳ + chip, Tiền ra đi đâu không có chuyển quỹ', () => {
    const r = as('cashflow', rpc125.report_cash_flow)
    const withTransfer = { ...r, outflows: [...r.outflows, { key: 'cat:x', label: 'Chuyển quỹ két sang bank', cash: 700000, bank: 0, reportGroup: 'cash_transfer' }] }
    const prev = { ...r.funds, cash: { ...r.funds.cash, net: 500000 }, bank: { ...r.funds.bank, net: 660000 } }
    const html = renderToStaticMarkup(<CashFlowView report={withTransfer} prev={prev} compareLabel="so với kỳ trước" />)
    expect(html).toContain('Chênh lệch trong kỳ')
    expect(html).toContain('Tiền ra đi đâu')
    expect(html).toContain('Không gồm chuyển quỹ')
    expect(html).toContain('so với kỳ trước')
    const block = slice(html, 'Tiền ra đi đâu')
    const blockOnly = block.slice(0, block.indexOf('Tiền vào'))
    expect(blockOnly).toContain('Lương - thưởng')
    expect(blockOnly).not.toContain('Chuyển quỹ két sang bank')
    // Không có chi thật nào → ẩn khối
    const none = renderToStaticMarkup(<CashFlowView report={{ ...r, outflows: [] }} />)
    expect(none).not.toContain('Tiền ra đi đâu')
    expect(none).not.toContain('NaN')
  })

  it('Lãi lỗ kiểu mới: thác nước, Biên, dòng Lãi ròng đỏ khi âm', () => {
    const r = as('pnl', rpc125.report_profit_loss)
    const html = renderToStaticMarkup(<ProfitLossView report={r} />)
    expect(html).toContain('Từ doanh thu đến lãi ròng')
    expect(html).toContain('Biên')
    expect(count(html, 'role="img"')).toBeGreaterThanOrEqual(1)
    // Dòng Lãi ròng của bảng dọc (cắt khỏi KPI/chip có thể trùng tên lớp).
    const netRow = (h: string) => {
      const table = h.slice(h.indexOf('<section class="min-w-0 divide-y'))
      const at = table.lastIndexOf('Lãi ròng')
      return table.slice(table.lastIndexOf('<div class="px-4 py-3', at))
    }
    const profitRow = netRow(html)
    expect(profitRow).toContain('bg-success-bg text-success')
    expect(profitRow).not.toContain('bg-critical-bg')
    const loss = renderToStaticMarkup(<ProfitLossView report={{ ...r, netProfit: -150000 }} />)
    const lossRow = netRow(loss)
    expect(lossRow).toContain('bg-critical-bg text-critical')
    expect(lossRow).not.toContain('bg-success-bg')
    // Không hạng mục chi phí: ẩn donut nhưng vẫn còn khối
    const noOpex = renderToStaticMarkup(<ProfitLossView report={{ ...r, operatingExpenses: { total: 0, rows: [] } }} />)
    expect(noOpex).toContain('Chi phí hoạt động')
    expect(noOpex).not.toContain('NaN')
    expect(noOpex).not.toContain('Infinity')
  })

  it('Công nợ kiểu mới: Nợ nhiều nhất, so với đầu kỳ, Thu được; nhãn đỏ chỉ khi quá 30 ngày', () => {
    const r = as('debts', rpc125.report_receivables)
    const html = renderToStaticMarkup(<ReceivablesView report={r} />)
    expect(html).toContain('Nợ nhiều nhất')
    expect(html).toContain('so với đầu kỳ')
    expect(html).toContain('Thu được')
    expect(html).toContain('khách đang nợ')
    expect(html).toMatch(/\d+ ngày<\/span>/)
    const empty = renderToStaticMarkup(<ReceivablesView report={{ ...r, rows: [], totals: { ...r.totals, opening: 0, incurred: 0, collected: 0, closing: 0 } }} />)
    expect(empty).not.toContain('NaN')
    expect(empty).not.toContain('Infinity')
  })

  it('Lãi lỗ: lãi gộp và lãi ròng đều âm → thác nước không NaN, cột Lãi ròng nằm dưới trục 0', () => {
    const r = as('pnl', rpc125.report_profit_loss)
    const neg = {
      ...r, revenue: 1000000, cogsGoods: 1500000, cogsIngredient: 0, cogsTotal: 1500000, grossProfit: -500000,
      operatingExpenses: { total: 100000, rows: [{ categoryId: 'x', name: 'Điện nước', amount: 100000 }] },
      writeoffCost: 0, otherIncome: { total: 0, rows: [] }, netProfit: -600000,
    }
    const html = renderToStaticMarkup(<ProfitLossView report={neg} />)
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
    const zero = Number(/data-zero-y="([\d.]+)"/.exec(html)?.[1])
    expect(Number.isFinite(zero)).toBe(true)
    const barY = (step: string) => Number(new RegExp(`<rect data-step="${step}"[^>]*? y="([0-9.]+)"`).exec(html)?.[1])
    expect(barY('Lãi ròng')).toBeGreaterThanOrEqual(zero)
    expect(barY('Lãi gộp')).toBeGreaterThanOrEqual(zero)
    expect(barY('Doanh thu')).toBeLessThan(zero)
    expect(html).toContain('bg-critical-bg text-critical')
  })

  it('Công nợ: nợ đúng 30 ngày không có nhãn đỏ, 31 ngày có "31 ngày"', () => {
    const r = as('debts', rpc125.report_receivables)
    const row = r.rows[0]
    const at = (oldest: string) => renderToStaticMarkup(<ReceivablesView report={{ ...r, head: { ...r.head, to: '2026-12-31' }, rows: [{ ...row, oldestOpenDate: oldest }] }} />)
    const d30 = at('2026-12-01') // 30 ngày trước 31/12
    expect(d30).not.toMatch(/\d+ ngày<\/span>/)
    const d31 = at('2026-11-30')
    expect(d31).toContain('31 ngày</span>')
  })
})

// ================================================================================================================
// Rà soát cuối nhánh báo cáo.
// ================================================================================================================
describe('rà soát cuối', async () => {
  const rpc125 = (await import('@/lib/reports/__fixtures__/rpc-125.json')).default
  const { parseFinanceReport } = await import('@/lib/reports/finance')
  const { default: RevenueView } = await import('./revenue-view')
  const { default: ProfitLossView } = await import('./profit-loss-view')
  const { SectionCard } = await import('./section-card')
  const as = <T extends string>(tab: T, raw: unknown) => {
    const r = parseFinanceReport(tab as never, raw)
    if (r.tab !== tab) throw new Error('sai tab')
    return r as Extract<typeof r, { tab: T }>
  }

  it('Theo giờ: biểu đồ lấp giờ trống bằng 0, bảng giữ nguyên dòng server', () => {
    const rows = [
      { hour: 11, ordersCount: 2, itemsQty: 3, amount: 100000 },
      { hour: 18, ordersCount: 4, itemsQty: 5, amount: 400000 },
    ]
    const html = renderToStaticMarkup(<SalesHourView rows={rows} />)
    for (const h of [12, 13, 14, 15, 16, 17]) expect(html).toContain(`>${h}h<`) // giờ trống được lấp trong biểu đồ
    expect(count(html, '<tr>')).toBe(1 + 2) // thead + 2 dòng gốc
  })

  it('Lãi lỗ: kỳ toàn 0 → báo rỗng thay vì vẽ thác nước', () => {
    const r = as('pnl', rpc125.report_profit_loss)
    const zero = {
      ...r, revenue: 0, cogsGoods: 0, cogsIngredient: 0, cogsTotal: 0, grossProfit: 0, writeoffCost: 0, netProfit: 0,
      operatingExpenses: { total: 0, rows: [] }, otherIncome: { total: 0, rows: [] },
    }
    const html = renderToStaticMarkup(<ProfitLossView report={zero} />)
    expect(html).toContain('Chưa có dữ liệu trong kỳ này')
    expect(html).not.toContain('aria-label="Từ doanh thu đến lãi ròng"')
    expect(renderToStaticMarkup(<ProfitLossView report={r} />)).toContain('aria-label="Từ doanh thu đến lãi ròng"')
  })

  it('Lãi lỗ: tâm donut chi phí = tổng chi phí của KPI, kể cả khi có hạng mục hoàn chi âm', () => {
    const r = as('pnl', rpc125.report_profit_loss)
    const p = {
      ...r,
      operatingExpenses: { total: 1500000, rows: [
        { categoryId: 'a', name: 'Điện nước', amount: 1000000 }, { categoryId: 'b', name: 'Lương', amount: 700000 },
        { categoryId: 'c', name: 'Hoàn chi', amount: -200000 },
      ] },
    }
    const html = renderToStaticMarkup(<ProfitLossView report={p} />)
    expect(html).toContain('aria-label="1,5tr CHI PHÍ"') // tổng KPI, không phải 1,7tr (tổng các hạng mục dương)
    expect(html).not.toContain('aria-label="1,7tr CHI PHÍ"')
  })

  it('Doanh thu: Cơ cấu thanh toán ghi "Theo cách khách trả" (có cả Ghi nợ)', () => {
    const html = renderToStaticMarkup(<RevenueView report={as('revenue', rpc125.report_revenue_series_day)} />)
    expect(html).toContain('Theo cách khách trả')
    expect(html).not.toContain('Theo tiền thật đã nhận')
  })

  it('Doanh thu: chỉ 1 điểm → ẩn biểu đồ vùng và dải cao/thấp nhất, vẫn còn KPI, donut, bảng', () => {
    const r = as('revenue', rpc125.report_revenue_series_day)
    const html = renderToStaticMarkup(<RevenueView report={{ ...r, rows: r.rows.slice(0, 1) }} />)
    expect(html).not.toContain('aria-label="Doanh thu và số bill theo thời gian"')
    expect(html).not.toContain('Ngày cao nhất')
    expect(html).not.toContain('Ngày thấp nhất')
    expect(html).toContain('Cơ cấu thanh toán')
    expect(html).toContain('>Tổng<')
    expect(html).toContain('>Doanh thu<')
  })

  it('SectionCard: tiêu đề + nút xếp hạng wrap được, action không bị co (375px)', () => {
    const html = renderToStaticMarkup(<SectionCard title="T" action={<button>A</button>}><p>x</p></SectionCard>)
    expect(html).toContain('flex-wrap')
    expect(html).toContain('shrink-0')
  })

  it('Doanh thu: không còn use client (không có state/handler); reports-screen chặn lỗi kỳ trước', () => {
    expect(readFileSync(join(__dirname, 'revenue-view.tsx'), 'utf8')).not.toContain("'use client'")
    expect(readFileSync(join(__dirname, 'reports-screen.tsx'), 'utf8')).toContain('.catch(() => null)')
  })
})
