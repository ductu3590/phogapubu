import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { loadReport, resolveReportRange } from '@/lib/actions/reports'
import { periodLabel } from '@/lib/reports/period'
import { parseReportTab, reportTabsFor } from '@/lib/reports/tabs'
import type { SalesReport } from '@/lib/reports/sales'
import { ErrorState } from '@/components/ui/feedback'
import ReportToolbar, { toolbarKey } from './report-toolbar'
import { reportScopeNote } from './report-format'
import SalesSummaryBlock from './report-summary'
import SalesItemView from './sales-item-view'
import SalesCategoryView from './sales-category-view'
import SalesHourView from './sales-hour-view'
import VoidsView from './voids-view'

// Trang "Báo cáo" (Part 1: bán hàng theo món / danh mục / giờ / món huỷ). Mọi con số do RPC mig 117 tính theo kỳ
// NGÀY KINH DOANH; trang chỉ hiển thị. Dùng chung cho trang đầy đủ (page.tsx) và bản hộp thoại đè lên POS
// (@modal/(.)reports) — `inModal` quyết định cách đổi kỳ/tab (xem ReportToolbar).
// Part 1 không có tab tài chính: canSeeFinance luôn false (Part 2 truyền isBackOfficeRole(operator.role)).
export default async function ReportsScreen({ searchParams, inModal }: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string; grain?: string }>
  inModal: boolean
}) {
  await requireAdminPageOrRedirect('pos')

  const sp = await searchParams
  const range = await resolveReportRange(sp, new Date())
  const tabs = reportTabsFor(false)
  const tab = parseReportTab(sp.tab, false)
  const res = await loadReport(tab, range.from, range.to)
  const exportHref = `/admin/reports/export?${new URLSearchParams({ tab, from: range.from, to: range.to })}`

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">Báo cáo</h1>
          <p className="mt-1 text-sm text-muted">
            Kỳ <span className="font-medium text-foreground tabular">{periodLabel(range)}</span> · {reportScopeNote(tab)}
          </p>
        </div>

        <ReportToolbar
          key={toolbarKey(range)}
          tab={tab}
          preset={range.preset}
          from={range.from}
          to={range.to}
          today={range.today}
          tabs={tabs.map(({ value, label }) => ({ value, label }))}
          inModal={inModal}
          exportHref={exportHref}
        />

        {res.ok ? <ReportBody report={res.report} /> : <ErrorState title="Không tải được báo cáo" reason={res.error} />}
      </div>
    </div>
  )
}

function ReportBody({ report }: { report: SalesReport }) {
  switch (report.tab) {
    case 'item':
      return <><SalesSummaryBlock summary={report.summary} /><SalesItemView rows={report.rows} itemsAmount={report.summary.itemsAmount} /></>
    case 'category':
      return <><SalesSummaryBlock summary={report.summary} /><SalesCategoryView rows={report.rows} itemsAmount={report.summary.itemsAmount} /></>
    case 'hour':
      return <><SalesSummaryBlock summary={report.summary} /><SalesHourView rows={report.rows} /></>
    case 'voids':
      return <VoidsView totals={report.totals} rows={report.rows} />
  }
}
