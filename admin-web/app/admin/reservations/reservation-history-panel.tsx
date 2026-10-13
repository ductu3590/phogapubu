'use client'

import { useState, type ReactNode } from 'react'
import { Ban, CalendarCheck, UserX, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import type { StatusTone } from '@/components/ui/status'
import {
  percentOf,
  summarizeReservationHistory,
  type ReservationHistoryRow,
  type ReservationOutcome,
} from '@/lib/reservation-history'
import { formatReservationDateTime } from './reservation-ui'

// Cột "Đã qua" (trang Đặt bàn, phương án B — 2026-10-13): ô số + thanh tỉ lệ + vài lượt gần nhất.
// Không làm biểu đồ theo ngày (anh Tú chọn ô số + thanh tỉ lệ): trang này chủ yếu để xem lại.

export type HistoryRange = '7' | '30' | '90'

const OUTCOME: Record<ReservationOutcome, { label: string; tone: StatusTone }> = {
  done: { label: 'Hoàn tất', tone: 'success' },
  no_show: { label: 'Không đến', tone: 'critical' },
  cancel_customer: { label: 'Khách huỷ', tone: 'neutral' },
  cancel_store: { label: 'Quán huỷ', tone: 'neutral' },
  rejected: { label: 'Từ chối', tone: 'neutral' },
}

const RECENT_COUNT = 6

function StatTile({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted [&>svg]:size-4" aria-hidden>{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular">{value}</p>
      <p className="text-[13px] text-muted tabular">{sub ?? ' '}</p>
    </div>
  )
}

function HistoryItem({ row }: { row: ReservationHistoryRow }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={row.customerName}>{row.customerName}</p>
        <p className="text-[13px] text-muted tabular">
          {formatReservationDateTime(row.arrivalAt)} · {row.partySize} khách{row.tableNumbers.length ? ` · ${row.tableNumbers.join(', ')}` : ''}
        </p>
      </div>
      <Badge tone={OUTCOME[row.outcome].tone} withDot>{OUTCOME[row.outcome].label}</Badge>
    </li>
  )
}

export default function ReservationHistoryPanel({
  range,
  onRangeChange,
  rows,
  loading,
  error,
}: {
  range: HistoryRange
  onRangeChange: (range: HistoryRange) => void
  rows: ReservationHistoryRow[] | null
  loading: boolean
  error: string | null
}) {
  const [allOpen, setAllOpen] = useState(false)
  const stats = summarizeReservationHistory(rows ?? [])
  const segments = [
    { label: 'Hoàn tất', count: stats.done, dot: 'bg-success-dot' },
    { label: 'Không đến', count: stats.noShow, dot: 'bg-critical-dot' },
    { label: 'Huỷ', count: stats.cancelled, dot: 'bg-neutral-dot' },
  ]

  let body: ReactNode
  if (error) {
    body = <div role="alert" className="rounded-xl border border-critical-border bg-critical-bg px-4 py-3 text-sm text-critical">{error}</div>
  } else if (rows === null) {
    body = (
      <div className="grid grid-cols-2 gap-3" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[104px] animate-pulse rounded-xl bg-secondary" />)}
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center">
        <p className="text-sm font-semibold">Chưa có lượt nào đã xong</p>
        <p className="mt-1 text-[13px] text-muted">Lượt đặt đã đến, không đến hoặc huỷ trong {range} ngày qua sẽ hiện ở đây.</p>
      </div>
    )
  } else {
    body = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Lượt đặt" value={stats.total} icon={<CalendarCheck />} />
          <StatTile label="Khách đã đến" value={stats.guests} icon={<Users />} />
          <StatTile label="Không đến" value={`${percentOf(stats.noShow, stats.total)}%`} sub={`${stats.noShow} lượt`} icon={<UserX />} />
          <StatTile label="Huỷ" value={`${percentOf(stats.cancelled, stats.total)}%`} sub={`${stats.cancelled} lượt`} icon={<Ban />} />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Kết quả các lượt đặt</p>
          <div
            className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={segments.map((s) => `${s.label} ${percentOf(s.count, stats.total)}%`).join(', ')}
          >
            {segments.map((s) => s.count > 0 ? <span key={s.label} className={s.dot} style={{ width: `${(s.count / stats.total) * 100}%` }} /> : null)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {segments.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${s.dot}`} aria-hidden />
                <span className="text-foreground/80">{s.label}</span>
                <span className="font-semibold tabular">{percentOf(s.count, stats.total)}%</span>
                <span className="text-muted tabular">({s.count})</span>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-2">
          <p className="pt-2 text-sm font-semibold">Gần đây</p>
          <ul className="divide-y divide-border">
            {rows.slice(0, RECENT_COUNT).map((row) => <HistoryItem key={row.reservationId} row={row} />)}
          </ul>
          {rows.length > RECENT_COUNT && (
            <button type="button" onClick={() => setAllOpen(true)} className="block w-full cursor-pointer py-3 text-left text-sm font-medium text-primary hover:underline">
              Xem tất cả {rows.length} lượt
            </button>
          )}
        </div>
      </>
    )
  }

  return (
    <aside className="flex flex-col gap-3 @5xl:sticky @5xl:top-0" aria-label="Đặt bàn đã qua" aria-busy={loading || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Đã qua</h2>
        <Tabs
          variant="segmented"
          label="Khoảng thời gian"
          value={range}
          onValueChange={onRangeChange}
          items={[{ value: '7', label: '7 ngày' }, { value: '30', label: '30 ngày' }, { value: '90', label: '90 ngày' }]}
        />
      </div>
      {body}
      <Dialog
        open={allOpen}
        onClose={() => setAllOpen(false)}
        placement="side"
        title={`Đặt bàn đã qua · ${range} ngày`}
        description={`${stats.total} lượt · Hoàn tất ${stats.done} · Không đến ${stats.noShow} · Huỷ ${stats.cancelled}`}
      >
        <ul className="divide-y divide-border">
          {(rows ?? []).map((row) => <HistoryItem key={row.reservationId} row={row} />)}
        </ul>
      </Dialog>
    </aside>
  )
}
