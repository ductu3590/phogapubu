import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { isBackOfficeRole } from '@/lib/auth/roles'
import { loadReport, resolveReportRange, type ReportData } from '@/lib/actions/reports'
import { compareLabel, prevOf, previousRange, type Compare } from '@/lib/reports/compare'
import { periodLabel } from '@/lib/reports/period'
import { parseReportTab, reportTabsFor } from '@/lib/reports/tabs'
import { shownPeriod } from '@/lib/reports/finance'
import { ErrorState } from '@/components/ui/feedback'
import ReportToolbar from './report-toolbar'
import { toolbarKey } from '@/lib/reports/toolbar-key'
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
  // Kỳ trước tải song song để so sánh. Công nợ (so với đầu kỳ) và Doanh thu chế độ tháng không cần.
  // Kỳ trước lỗi → prev = null, chỉ ẩn phần so sánh, trang vẫn hiện.
  const needPrev = tab !== 'debts' && !(tab === 'revenue' && grain === 'month')
  const prev = previousRange(range.preset, range.from, range.to)
  const [res, prevRes] = await Promise.all([
    loadReport(tab, range.from, range.to, grain),
    needPrev ? loadReport(tab, prev.from, prev.to, grain) : Promise.resolve(null),
  ])
  const compare: Compare = { prev: prevRes?.ok ? prevRes.report : null, label: compareLabel(range.preset) }
  const periodText = periodLabel(shownPeriod(res.ok ? res.report : { tab }, range))
  const exportQuery = new URLSearchParams({ tab, from: range.from, to: range.to })
  if (grain === 'month') exportQuery.set('grain', 'month')
  const exportHref = `/admin/reports/export?${exportQuery}`

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Báo cáo</h1>
          <p className="mt-1 text-sm text-muted">
            {/* Doanh thu chế độ tháng: kỳ thật là 12 tháng server trả về, không phải kỳ đang chọn. */}
            Kỳ <span className="font-medium text-foreground tabular">{periodText}</span> · {reportScopeNote(tab)}
          </p>
        </div>

        <ReportToolbar
          key={toolbarKey(range)}
          periodText={periodText}
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

        {res.ok ? <ReportBody report={res.report} compare={compare} /> : <ErrorState title="Không tải được báo cáo" reason={res.error} />}
      </div>
    </div>
  )
}

// compare đã truyền cho mọi tab trừ Công nợ (so với đầu kỳ của chính nó).
function ReportBody({ report, compare }: { report: ReportData; compare: Compare }) {
  switch (report.tab) {
    case 'item': {
      const prev = prevOf(compare, 'item')
      return <><SalesSummaryBlock summary={report.summary} prev={prev?.summary} compareLabel={compare.label} /><SalesItemView rows={report.rows} itemsAmount={report.summary.itemsAmount} qtySold={report.summary.qtySold} /></>
    }
    case 'category': {
      const prev = prevOf(compare, 'category')
      return <><SalesSummaryBlock summary={report.summary} prev={prev?.summary} compareLabel={compare.label} /><SalesCategoryView rows={report.rows} itemsAmount={report.summary.itemsAmount} /></>
    }
    case 'hour': {
      const prev = prevOf(compare, 'hour')
      return <><SalesSummaryBlock summary={report.summary} prev={prev?.summary} compareLabel={compare.label} /><SalesHourView rows={report.rows} /></>
    }
    case 'voids': {
      const prev = prevOf(compare, 'voids')
      return <VoidsView totals={report.totals} rows={report.rows} prev={prev?.totals} compareLabel={compare.label} />
    }
    case 'revenue': {
      // Chế độ tháng: compare.prev = null nên không có chip (RevenueView cũng tự chặn).
      const prev = report.grain === 'month' ? null : prevOf(compare, 'revenue')
      return <RevenueView report={report} prev={prev?.totals} compareLabel={compare.label} />
    }
    case 'cashflow':
      return <CashFlowView report={report} prev={prevOf(compare, 'cashflow')?.funds} compareLabel={compare.label} />
    case 'pnl':
      return <ProfitLossView report={report} prev={prevOf(compare, 'pnl')} compareLabel={compare.label} />
    case 'debts':
      // Công nợ không tải kỳ trước: so cuối kỳ với đầu kỳ ngay trong view.
      return <ReceivablesView report={report} />
  }
}
