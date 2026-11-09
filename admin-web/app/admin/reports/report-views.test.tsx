import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SalesHourRow, SalesItemRow, SalesSummary, VoidRow } from '@/lib/reports/sales'
import { REPORT_TABS } from '@/lib/reports/tabs'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

const { default: SalesItemView, categoryOptions, filterItemRows } = await import('./sales-item-view')
const { default: SalesCategoryView } = await import('./sales-category-view')
const { default: SalesHourView, HourBars } = await import('./sales-hour-view')
const { default: VoidsView } = await import('./voids-view')
const { default: ReportToolbar, reportQuery } = await import('./report-toolbar')
const { default: SalesSummaryBlock } = await import('./report-summary')

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

  it('reportQuery giữ khoá còn lại; preset nhanh không mang from/to', () => {
    const cur = { tab: 'hour' as const, preset: 'custom' as const, from: '2026-11-01', to: '2026-11-20' }
    expect(reportQuery(cur, { tab: 'voids' })).toBe('tab=voids&period=custom&from=2026-11-01&to=2026-11-20')
    expect(reportQuery(cur, { preset: '7d' })).toBe('tab=hour&period=7d')
    expect(reportQuery({ ...cur, preset: 'yesterday' }, { tab: 'item' })).toBe('tab=item&period=yesterday')
    expect(reportQuery({ ...cur, preset: 'today' }, { preset: 'custom', from: '2026-11-03', to: '2026-11-04' }))
      .toBe('tab=hour&period=custom&from=2026-11-03&to=2026-11-04')
  })
})
