// Tab của trang /admin/reports. Part 1: 4 tab bán hàng (chủ quán, quản lý, thu ngân). Part 2 thêm tab tài chính
// (`finance: true`) chỉ cho back office. Hàm thuần nhận `canSeeFinance` từ nơi gọi, KHÔNG tự đọc vai trò —
// luật vai trò nằm ở lib/auth/roles.ts.

export type ReportTab = 'item' | 'category' | 'hour' | 'voids'

export const REPORT_TABS: { value: ReportTab; label: string; finance: boolean }[] = [
  { value: 'item', label: 'Theo món', finance: false },
  { value: 'category', label: 'Theo danh mục', finance: false },
  { value: 'hour', label: 'Theo giờ', finance: false },
  { value: 'voids', label: 'Món huỷ', finance: false },
]

export function reportTabsFor(canSeeFinance: boolean): typeof REPORT_TABS {
  return canSeeFinance ? REPORT_TABS : REPORT_TABS.filter((t) => !t.finance)
}

/** `?tab=` gõ tay: lạ hoặc vai này không được xem thì về 'item'. */
export function parseReportTab(raw: string | undefined, canSeeFinance: boolean): ReportTab {
  return reportTabsFor(canSeeFinance).find((t) => t.value === raw)?.value ?? 'item'
}
