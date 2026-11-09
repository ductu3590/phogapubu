// Tab của trang /admin/reports. 4 tab bán hàng (chủ quán, quản lý, thu ngân) + 4 tab tài chính (`finance: true`, chỉ
// back office). Hàm thuần nhận `canSeeFinance` từ nơi gọi (isBackOfficeRole), KHÔNG tự đọc vai trò —
// luật vai trò nằm ở lib/auth/roles.ts.

export type SalesTab = 'item' | 'category' | 'hour' | 'voids'
export type FinanceTab = 'revenue' | 'cashflow' | 'pnl' | 'debts'
export type ReportTab = SalesTab | FinanceTab

export const REPORT_TABS: { value: ReportTab; label: string; finance: boolean }[] = [
  { value: 'item', label: 'Theo món', finance: false },
  { value: 'category', label: 'Theo danh mục', finance: false },
  { value: 'hour', label: 'Theo giờ', finance: false },
  { value: 'voids', label: 'Món huỷ', finance: false },
  { value: 'revenue', label: 'Doanh thu', finance: true },
  { value: 'cashflow', label: 'Thu chi', finance: true },
  { value: 'pnl', label: 'Lãi lỗ', finance: true },
  { value: 'debts', label: 'Công nợ', finance: true },
]

export function isFinanceTab(tab: ReportTab): tab is FinanceTab {
  return REPORT_TABS.some((t) => t.value === tab && t.finance)
}

/** Chuỗi `?tab=` thô có phải tên một tab tài chính không — kiểm TRƯỚC khi parseReportTab kẹp về 'item'. */
export const isFinanceTabName = (raw: string | null | undefined): boolean =>
  REPORT_TABS.some((t) => t.finance && t.value === raw)

export function reportTabsFor(canSeeFinance: boolean): typeof REPORT_TABS {
  return canSeeFinance ? REPORT_TABS : REPORT_TABS.filter((t) => !t.finance)
}

/** `?tab=` gõ tay: lạ hoặc vai này không được xem thì về 'item'. */
export function parseReportTab(raw: string | undefined, canSeeFinance: boolean): ReportTab {
  return reportTabsFor(canSeeFinance).find((t) => t.value === raw)?.value ?? 'item'
}
