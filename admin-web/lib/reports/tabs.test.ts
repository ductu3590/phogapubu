import { describe, expect, it } from 'vitest'
import { REPORT_TABS, parseReportTab, reportTabsFor } from './tabs'

describe('report tabs', () => {
  it('Part 1: 4 tab bán hàng đúng nhãn, không tab nào là tài chính', () => {
    expect(REPORT_TABS.map((t) => [t.value, t.label, t.finance])).toEqual([
      ['item', 'Theo món', false],
      ['category', 'Theo danh mục', false],
      ['hour', 'Theo giờ', false],
      ['voids', 'Món huỷ', false],
    ])
  })

  it('không được xem tài chính thì không có tab tài chính, ?tab lạ về item', () => {
    expect(reportTabsFor(false).every((t) => !t.finance)).toBe(true)
    expect(reportTabsFor(true)).toEqual(REPORT_TABS)
    expect(parseReportTab('zzz', true)).toBe('item')
    expect(parseReportTab(undefined, false)).toBe('item')
    expect(parseReportTab('', false)).toBe('item')
  })

  it('tab hợp lệ giữ nguyên', () => {
    for (const t of ['item', 'category', 'hour', 'voids'] as const) {
      expect(parseReportTab(t, false)).toBe(t)
      expect(parseReportTab(t, true)).toBe(t)
    }
  })

  it('tab tài chính (Part 2) ở vai không được xem về item', () => {
    // Part 1 chưa có tab tài chính nên 'pnl' là tab lạ; Part 2 thêm tab finance:true thì vẫn bị lọc khi canSeeFinance=false.
    expect(parseReportTab('pnl', false)).toBe('item')
    expect(parseReportTab('__proto__', true)).toBe('item')
  })
})
