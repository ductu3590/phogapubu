import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { isBackOfficeRole } from '@/lib/auth/roles'
import { loadReport, resolveReportRange, type ReportData } from '@/lib/actions/reports'
import { periodLabel } from '@/lib/reports/period'
import { parseReportTab, reportTabsFor } from '@/lib/reports/tabs'
import { shownPeriod } from '@/lib/reports/finance'
import { ErrorState } from '@/components/ui/feedback'
import ReportToolbar, { toolbarKey } from './report-toolbar'
import { reportScopeNote } from './report-format'
import SalesSummaryBlock from './report-summary'
import SalesItemView from './sales-item-view'
import SalesCategoryView from './sales-category-view'
import SalesHourView from './sales-hour-view'
import VoidsView from './voids-view'
import RevenueView from './revenue-view'
import CashFlowView from './cash-flow-view'
import ProfitLossView from './profit-loss-view'
import ReceivablesView from './receivables-view'

// Trang "Báo cáo": 4 tab bán hàng (mig 117: chủ quán, quản lý, thu ngân) + 4 tab tài chính (mig 125: chỉ chủ quán +
// quản lý). Mọi con số do RPC tính theo kỳ NGÀY KINH DOANH; trang chỉ hiển thị, đọc một lần mỗi lần điều hướng.
// Dùng chung cho trang đầy đủ (page.tsx) và bản hộp thoại đè lên POS (@modal/(.)reports) — `inModal` quyết định cách
// đổi kỳ/tab (xem ReportToolbar). Thu ngân gõ tay ?tab=pnl về Theo món; loadReport cũng chặn tab tài chính.
export default async function ReportsScreen({ searchParams, inModal }: {
  searchParams: Promise<{ tab?: string; period?: string; from?: string; to?: string; grain?: string }>
  inModal: boolean
}) {
  const operator = await requireAdminPageOrRedirect('pos')
  const canSeeFinance = isBackOfficeRole(operator.role)

  const sp = await searchParams
  const range = await resolveReportRange(sp, new Date())
  const tabs = reportTabsFor(canSeeFinance)
  const tab = parseReportTab(sp.tab, canSeeFinance)
  const grain = tab === 'revenue' && sp.grain === 'month' ? 'month' : 'day'
  const res = await loadReport(tab, range.from, range.to, grain)
  const exportQuery = new URLSearchParams({ tab, from: range.from, to: range.to })
  if (grain === 'month') exportQuery.set('grain', 'month')
  const exportHref = `/admin/reports/export?${exportQuery}`

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">Báo cáo</h1>
          <p className="mt-1 text-sm text-muted">
            {/* Doanh thu chế độ tháng: kỳ thật là 12 tháng server trả về, không phải kỳ đang chọn. */}
            Kỳ <span className="font-medium text-foreground tabular">{periodLabel(shownPeriod(res.ok ? res.report : { tab }, range))}</span> · {reportScopeNote(tab)}
          </p>
        </div>

        <ReportToolbar
          key={toolbarKey(range)}
          tab={tab}
          grain={grain}
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

function ReportBody({ report }: { report: ReportData }) {
  switch (report.tab) {
    case 'item':
      return <><SalesSummaryBlock summary={report.summary} /><SalesItemView rows={report.rows} itemsAmount={report.summary.itemsAmount} /></>
    case 'category':
      return <><SalesSummaryBlock summary={report.summary} /><SalesCategoryView rows={report.rows} itemsAmount={report.summary.itemsAmount} /></>
    case 'hour':
      return <><SalesSummaryBlock summary={report.summary} /><SalesHourView rows={report.rows} /></>
    case 'voids':
      return <VoidsView totals={report.totals} rows={report.rows} />
    case 'revenue':
      return <RevenueView report={report} />
    case 'cashflow':
      return <CashFlowView report={report} />
    case 'pnl':
      return <ProfitLossView report={report} />
    case 'debts':
      return <ReceivablesView report={report} />
  }
}
