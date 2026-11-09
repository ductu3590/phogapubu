import { describe, expect, it } from 'vitest'
import { REPORT_TABS, isFinanceTab, parseReportTab, reportTabsFor } from './tabs'

describe('report tabs', () => {
  it('4 tab bán hàng rồi 4 tab tài chính, đúng nhãn', () => {
    expect(REPORT_TABS.map((t) => [t.value, t.label, t.finance])).toEqual([
      ['item', 'Theo món', false],
      ['category', 'Theo danh mục', false],
      ['hour', 'Theo giờ', false],
      ['voids', 'Món huỷ', false],
      ['revenue', 'Doanh thu', true],
      ['cashflow', 'Thu chi', true],
      ['pnl', 'Lãi lỗ', true],
      ['debts', 'Công nợ', true],
    ])
  })

  it('reportTabsFor(true) có 8 tab; parseReportTab("pnl", false) về item', () => {
    expect(reportTabsFor(true)).toHaveLength(8)
    expect(reportTabsFor(false).map((t) => t.value)).toEqual(['item', 'category', 'hour', 'voids'])
    for (const t of ['revenue', 'cashflow', 'pnl', 'debts'] as const) {
      expect(parseReportTab(t, false)).toBe('item')
      expect(parseReportTab(t, true)).toBe(t)
      expect(isFinanceTab(t)).toBe(true)
    }
    expect(isFinanceTab('item')).toBe(false)
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
    // Tab tài chính (finance: true) bị lọc khi canSeeFinance=false.
    expect(parseReportTab('pnl', false)).toBe('item')
    expect(parseReportTab('__proto__', true)).toBe('item')
  })
})
