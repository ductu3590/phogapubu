import { Banknote, Gift, Landmark, Printer, Receipt, Undo2, Users, Wallet } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { loadDailyReport } from '@/lib/actions/daily-report'
import { clampReportDate, instrumentLabel, isViewingToday, vnToday, type DailyReportBill } from '@/lib/daily-report'
import { formatVND, cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState, ErrorState } from '@/components/ui/feedback'
import { getButtonClasses } from '@/components/ui/button-classes'
import ReportDatePicker from './report-date-picker'

// Báo cáo NGÀY theo bill (PA-1, 2026-10-07) — thay dashboard cũ. Chưa có khái niệm "ca".
// Mọi con số lấy nguyên từ RPC get_daily_report; trang này chỉ hiển thị.
export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const now = new Date()
  const { date: rawDate } = await searchParams
  const date = clampReportDate(rawDate, now)
  const today = isViewingToday(date, now)
  const res = await loadDailyReport(date)

  const title = new Date(`${date}T00:00:00+07:00`).toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <PageHeader
          title="Báo cáo ngày"
          description={today ? `Hôm nay · ${title}` : title}
          actions={<ReportDatePicker value={date} max={vnToday(now)} showRefresh={today} />}
        />

        {!res.ok ? (
          <ErrorState title="Không tải được báo cáo" reason={res.error} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={<Wallet />} label="Tổng thực thu" value={formatVND(res.report.totals.revenue)}
                note={`${res.report.totals.billsCount} bill${res.report.totals.other > 0 ? ` · trong đó ${formatVND(res.report.totals.other)} ví / khác` : ''}`} />
              <Stat icon={<Banknote />} label="Tiền mặt" value={formatVND(res.report.totals.cash)} note="Đối chiếu với két" />
              <Stat icon={<Landmark />} label="Chuyển khoản" value={formatVND(res.report.totals.bank)} note="Đối chiếu app ngân hàng" />
              {today ? (
                <Stat icon={<Users />} label="Đang mở · chưa thu" value={`${res.report.open.tablesCount} bàn`}
                  note={`Tạm tính ${formatVND(res.report.open.provisionalTotal)}`} attention={res.report.open.tablesCount > 0} />
              ) : (
                <Stat icon={<Receipt />} label="Số bill" value={String(res.report.totals.billsCount)} note="Đã thu trong ngày" />
              )}
            </div>

            <Card title={`Bill đã thu (${res.report.bills.length})`} flush>
              {res.report.bills.length === 0 ? (
                <EmptyState>Chưa có bill nào được thu trong ngày này.</EmptyState>
              ) : (
                <ul className="divide-y divide-border">{res.report.bills.map((b) => <BillRow key={b.key} bill={b} />)}</ul>
              )}
            </Card>

            <Card title={`Điều chỉnh bill (${res.report.adjustments.length})`} flush>
              {res.report.adjustments.length === 0 ? (
                <EmptyState>Không có điều chỉnh nào.</EmptyState>
              ) : (
                <ul className="divide-y divide-border">
                  {res.report.adjustments.map((a, i) => (
                    <li key={`${a.at}-${i}`} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {a.type === 'gift' ? <Gift className="mr-1 inline size-4 text-violet-600" aria-hidden /> : <Undo2 className="mr-1 inline size-4 text-red-600" aria-hidden />}
                          {a.quantity} × {a.itemName} <span className="text-muted">· {a.tableLabel}</span>
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {time(a.at)} · {a.byName ?? 'Không rõ người làm'}{a.reason ? ` · Lý do: ${a.reason}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={a.type === 'gift' ? 'info' : 'critical'}>{a.type === 'gift' ? 'Tặng' : 'Bỏ'}</Badge>
                        <span className="text-sm font-medium tabular">{formatVND(a.amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })
}

function BillRow({ bill }: { bill: DailyReportBill }) {
  // In lại hoá đơn chỉ có với bill trả sau (theo phiên); đơn trả trước không có mẫu hoá đơn 80mm.
  const printHref = bill.sessionIds.length > 0 ? `/staff/tables/print?ids=${bill.sessionIds.join(',')}` : null
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {bill.tableLabel}
          {bill.merged && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">Gộp {bill.sessionIds.length} mâm</span>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted tabular">
          {time(bill.paidAt)} · {bill.itemsCount} món{bill.receivedByName ? ` · ${bill.receivedByName}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={bill.instrument === 'cash' ? 'success' : bill.instrument === 'bank' ? 'info' : 'neutral'}>{instrumentLabel(bill.instrument)}</Badge>
        <span className="w-28 text-right text-sm font-semibold text-foreground tabular">{formatVND(bill.total)}</span>
        {printHref ? (
          <a href={printHref} target="_blank" rel="noopener" className={getButtonClasses('outline')}>
            <Printer className="size-4" aria-hidden />
            Xem / In lại
          </a>
        ) : <span className="w-[118px]" aria-hidden />}
      </div>
    </li>
  )
}

function Stat({ icon, label, value, note, attention = false }: { icon: React.ReactNode; label: string; value: string; note?: string; attention?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4', attention ? 'border-warning-border' : 'border-border')}>
      <span className={cn('grid size-9 place-items-center rounded-lg [&>svg]:size-[18px]', attention ? 'bg-warning-bg text-warning' : 'bg-secondary text-muted')} aria-hidden>{icon}</span>
      <p className="mt-3 text-2xl font-semibold text-foreground tabular">{value}</p>
      <p className="mt-0.5 text-[13px] text-muted">{label}</p>
      {note ? <p className="mt-1 text-[12px] text-muted">{note}</p> : null}
    </div>
  )
}
