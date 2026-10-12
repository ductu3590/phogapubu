'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Banknote, Gift, Landmark, ListOrdered, Printer, Receipt, Search, Undo2, Users, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getButtonClasses } from '@/components/ui/button-classes'
import { EmptyState } from '@/components/ui/feedback'
import { formatVND, cn } from '@/lib/utils'
import { instrumentLabel } from '@/lib/daily-report'
import {
  buildBillRows,
  chipCounts,
  filterBillRows,
  paginate,
  type BillChip,
  type BillRow,
  type BillsReport,
  type BillsReportAdjustment,
} from '@/lib/bills-report'
import ReportDatePicker from './report-date-picker'

const CHIPS: { id: BillChip; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'paid', label: 'Đã thanh toán' },
  { id: 'adjusted', label: 'Đã huỷ / giảm trừ' },
  { id: 'waiting', label: 'Chờ thu' },
]

const time = (iso: string, withSeconds = false) =>
  iso
    ? new Date(iso).toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}),
      })
    : '—'

export default function BillsReportView({ report, date, maxDate, today, dateTitle, viewer, updatedAt }: {
  report: BillsReport
  date: string
  maxDate: string
  today: boolean
  dateTitle: string
  viewer: string
  updatedAt: string
}) {
  const [chip, setChip] = useState<BillChip>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const rows = useMemo(() => buildBillRows(report), [report])
  const counts = useMemo(() => chipCounts(rows), [rows])
  const visible = useMemo(() => filterBillRows(rows, chip, query), [rows, chip, query])
  const paged = paginate(visible, page)
  const expiredDebt = report.waiting.filter((w) => w.expired)

  const pickChip = (id: BillChip) => { setChip(id); setPage(1) }

  return (
    <div className="@container space-y-5">
      {/* Đầu trang: ngày đang xem + người đăng nhập. Chưa có "ca" — báo cáo theo NGÀY (spec §2). */}
      <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">Hoá đơn &amp; Báo cáo</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="font-medium text-foreground first-letter:uppercase">{dateTitle}</span>
            {today && <Badge tone="success" withDot>Hôm nay</Badge>}
          </p>
          <p className="mt-1 text-[13px] text-muted">Đang xem: <strong className="font-medium text-foreground">{viewer}</strong></p>
        </div>
        <ReportDatePicker value={date} max={maxDate} showRefresh={today} />
      </div>

      {/* 4 thẻ số liệu — tiền từ server, không tính lại. */}
      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <Stat icon={<Wallet />} tone="accent" label="Tổng thực thu" value={formatVND(report.totals.revenue)}
          note={`${report.totals.billsCount} hoá đơn đã thanh toán${report.totals.other > 0 ? ` · ${formatVND(report.totals.other)} ví / khác` : ''}`} />
        <Stat icon={<Banknote />} tone="success" label="Tiền mặt" value={formatVND(report.totals.cash)} note="Đối chiếu với két" />
        {/* KHÔNG ghi "khớp tài khoản": hệ thống không xác minh được tiền chuyển khoản đã về (Option A, 2026-07-08). */}
        <Stat icon={<Landmark />} tone="info" label="Chuyển khoản" value={formatVND(report.totals.bank)} note="Đối chiếu app ngân hàng" />
        {today ? (
          <Stat icon={<Users />} tone="warning" label="Đang phục vụ · chưa thu" value={`${report.open.tablesCount} bàn`}
            note={`Tạm tính ${formatVND(report.open.provisionalTotal)}${expiredDebt.length > 0 ? ` · ${expiredDebt.length} bàn hết hạn còn nợ` : ''}`}
            attention={report.open.tablesCount > 0 || expiredDebt.length > 0} />
        ) : (
          <Stat icon={<Receipt />} tone="neutral" label="Chờ thu trong ngày" value={`${counts.waiting} dòng`}
            note={counts.waiting > 0 ? 'Bàn hết hạn còn nợ / đơn chưa nhận tiền' : 'Không còn khoản chưa thu'} attention={counts.waiting > 0} />
        )}
      </div>

      {/* Thanh lọc: chip + ô tìm. Lọc ở trình duyệt — dữ liệu một ngày đủ nhỏ. */}
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc hoá đơn">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={chip === c.id}
              onClick={() => pickChip(c.id)}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
                chip === c.id ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-foreground hover:bg-item-hover',
              )}
            >
              {c.label}
              <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold tabular',
                chip === c.id ? 'bg-white/20 text-white' : 'bg-secondary text-muted')}>
                {counts[c.id]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative w-full @3xl:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }}
            placeholder="Tìm theo bàn, mã #xxxxxx, tên khách…"
            aria-label="Tìm hoá đơn"
            className="min-h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-focus"
          />
        </label>
      </div>

      <div className="grid gap-5 @5xl:grid-cols-12">
        {/* Bảng hoá đơn */}
        <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface @5xl:col-span-8">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Danh sách hoá đơn trong ngày</h2>
            <span className="text-xs text-muted tabular">Cập nhật lúc {time(updatedAt, true)}</span>
          </header>
          {paged.total === 0 ? (
            <EmptyState className="m-4">
              {rows.length === 0 ? 'Chưa có hoá đơn nào trong ngày này.' : 'Không có hoá đơn khớp bộ lọc.'}
            </EmptyState>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="hidden border-b border-border bg-background whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted @3xl:table-header-group">
                <tr>
                  <th className="px-4 py-2.5">Mã</th>
                  <th className="px-4 py-2.5">Bàn</th>
                  <th className="px-4 py-2.5">Khách</th>
                  <th className="px-4 py-2.5">Vào · Món</th>
                  <th className="px-4 py-2.5 text-right">Tổng tiền</th>
                  <th className="px-4 py-2.5">Trạng thái</th>
                  <th className="px-4 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.items.map((r) => <BillTableRow key={r.key} row={r} />)}
              </tbody>
            </table>
          )}
          {paged.total > 0 && (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
              <span className="tabular">Hiển thị {paged.from}–{paged.to} trên {paged.total} dòng</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}
                  className="min-h-9 rounded-lg border border-border px-3 font-medium text-foreground hover:bg-item-hover disabled:cursor-not-allowed disabled:opacity-40">
                  Trước
                </button>
                <span className="tabular font-medium text-foreground">{paged.page}/{paged.pageCount}</span>
                <button type="button" disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}
                  className="min-h-9 rounded-lg border border-border px-3 font-medium text-foreground hover:bg-item-hover disabled:cursor-not-allowed disabled:opacity-40">
                  Sau
                </button>
              </div>
            </footer>
          )}
        </section>

        {/* Lịch sử điều chỉnh bill (Bỏ / Tặng / Sửa số lượng) */}
        <section className="min-w-0 self-start rounded-xl border border-border bg-surface @5xl:col-span-4">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Lịch sử điều chỉnh bill</h2>
            <span className="text-xs text-muted tabular">{report.adjustments.length}</span>
          </header>
          {report.adjustments.length === 0 ? (
            <EmptyState className="m-4">Không có điều chỉnh nào trong ngày.</EmptyState>
          ) : (
            <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
              {report.adjustments.map((a, i) => <AdjustmentItem key={`${a.at}-${i}`} a={a} />)}
            </ul>
          )}
          <p className="border-t border-border px-4 py-3 text-xs text-muted">Mọi lần bỏ món, tặng món, sửa số lượng đều được ghi lại tự động kèm người làm và lý do.</p>
        </section>
      </div>
    </div>
  )
}

function BillTableRow({ row: r }: { row: BillRow }) {
  // In lại hoá đơn 80mm chỉ có với bill trả sau đã thu (theo phiên) — như trang Báo cáo cũ.
  const printHref = r.kind === 'paid' && r.sessionIds.length > 0 ? `/print/bill?ids=${r.sessionIds.join(',')}` : null
  return (
    <tr className={cn('flex flex-col gap-1.5 px-4 py-3 @3xl:table-row @3xl:p-0', r.kind === 'cancelled' && 'bg-background/60')}>
      <td className="whitespace-nowrap font-mono text-[13px] font-semibold text-foreground @3xl:px-4 @3xl:py-3">{r.code}</td>
      <td className="@3xl:px-4 @3xl:py-3">
        <span className="font-medium text-foreground">{r.tableLabel}</span>
        {r.grouped && <span className="ml-2 whitespace-nowrap rounded-md bg-violet-50 px-1.5 py-0.5 text-[12px] font-medium text-violet-700">Ghép</span>}
      </td>
      <td className="text-foreground @3xl:px-4 @3xl:py-3">
        {r.customerName ? (
          <>{r.customerName}{r.partySize ? <span className="text-muted"> · {r.partySize} khách</span> : null}</>
        ) : <span className="text-muted">—</span>}
      </td>
      <td className="whitespace-nowrap text-muted tabular @3xl:px-4 @3xl:py-3">
        {time(r.startedAt)}{r.itemsCount !== null && <> <span aria-hidden>•</span> {r.itemsCount} món</>}
      </td>
      <td className="whitespace-nowrap @3xl:px-4 @3xl:py-3 @3xl:text-right">
        <span className={cn('block font-semibold tabular', r.kind === 'cancelled' ? 'text-muted line-through' : 'text-foreground')}>
          {formatVND(r.amount)}
        </span>
        <span className="block text-[12px] text-muted">
          {r.kind === 'paid' && r.instrument ? instrumentLabel(r.instrument) : r.kind === 'waiting' ? 'Tạm tính' : '—'}
          {r.kind === 'paid' && r.discountTotal > 0 && <> · giảm {formatVND(r.discountTotal)}</>}
        </span>
      </td>
      <td className="@3xl:px-4 @3xl:py-3">
        <RowStatus row={r} />
      </td>
      <td className="@3xl:px-4 @3xl:py-3">
        <div className="flex @3xl:justify-end">
          {printHref ? (
            <a href={printHref} target="_blank" rel="noopener" className={cn(getButtonClasses('outline'), 'whitespace-nowrap')}>
              <Printer className="size-4" aria-hidden />
              In lại
            </a>
          ) : <span className="hidden text-muted @3xl:inline">—</span>}
        </div>
      </td>
    </tr>
  )
}

function RowStatus({ row: r }: { row: BillRow }) {
  if (r.kind === 'waiting') {
    return r.expired
      ? <Badge tone="critical" withDot>Hết hạn · còn nợ</Badge>
      : <Badge tone="warning" withDot>Chờ thu</Badge>
  }
  if (r.kind === 'cancelled') {
    return (
      <div className="space-y-1">
        <Badge tone="critical" withDot>{r.rejected ? 'Từ chối' : 'Đã huỷ'}</Badge>
        {r.reasonText && <p className="text-[12px] text-muted">{r.reasonText}</p>}
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Badge tone="success" withDot>Đã thanh toán</Badge>
      {r.adjustmentsCount > 0 && <p className="text-[12px] text-warning">{r.adjustmentsCount} điều chỉnh</p>}
      {r.receivedByName && <p className="text-[12px] text-muted">{r.receivedByName}</p>}
    </div>
  )
}

function AdjustmentItem({ a }: { a: BillsReportAdjustment }) {
  const kind = a.type === 'gift'
    ? { icon: <Gift className="size-4 text-violet-600" aria-hidden />, label: 'Tặng', tone: 'info' as const }
    : a.type === 'quantity'
      ? { icon: <ListOrdered className="size-4 text-amber-600" aria-hidden />, label: 'Sửa số lượng', tone: 'warning' as const }
      : { icon: <Undo2 className="size-4 text-red-600" aria-hidden />, label: 'Bỏ', tone: 'critical' as const }
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted tabular">{time(a.at)} · {a.tableLabel}</span>
        <Badge tone={kind.tone}>{kind.label}</Badge>
      </div>
      <p className="flex items-start gap-1.5 text-sm text-foreground">
        <span className="mt-0.5 shrink-0">{kind.icon}</span>
        <span className="min-w-0">
          {a.type === 'quantity'
            ? <><strong className="font-medium">{a.itemName}</strong>: {a.oldQuantity} → {a.newQuantity}</>
            : <>{a.quantity} × <strong className="font-medium">{a.itemName}</strong></>}
          <span className="ml-1 text-muted tabular">({a.amount > 0 && a.type === 'quantity' ? '+' : ''}{formatVND(a.amount)})</span>
        </span>
      </p>
      <p className="text-[12px] text-muted">
        {a.byName ?? 'Không rõ người làm'}{a.reason ? ` · Lý do: ${a.reason}` : ''}
      </p>
    </li>
  )
}

function Stat({ icon, tone, label, value, note, attention = false }: {
  icon: ReactNode
  tone: 'accent' | 'success' | 'info' | 'warning' | 'neutral'
  label: string
  value: string
  note?: string
  attention?: boolean
}) {
  const iconTone = {
    accent: 'bg-orange-50 text-orange-600',
    success: 'bg-success-bg text-success',
    info: 'bg-info-bg text-info',
    warning: 'bg-warning-bg text-warning',
    neutral: 'bg-secondary text-muted',
  }[tone]
  return (
    <div className={cn('rounded-xl border bg-surface p-4', attention ? 'border-warning-border' : 'border-border')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-[18px]', iconTone)} aria-hidden>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground tabular">{value}</p>
      {note ? <p className="mt-1 text-[12px] text-muted">{note}</p> : null}
    </div>
  )
}
