'use client'

import { TableStateBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ReservationRow } from '@/lib/actions/reservations'
import { clock, type TimelineBar } from '@/lib/pos-timeline'
import type { TrayAssignment } from '@/lib/tray-colors'
import { tableVisualState } from '@/lib/table-status'
import { cn } from '@/lib/utils'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

type Item =
  | { kind: 'session'; at: number; session: OpenTableSession }
  | { kind: 'reservation'; at: number; reservation: ReservationRow; bar: TimelineBar }

// Danh sách = cùng dữ liệu với Timeline, xếp theo giờ: phiên đang mở trước, đặt bàn sắp đến sau.
export default function ListView({
  sessions,
  reservationBars,
  reservationsById,
  tableNames,
  trayColors,
  visibleTableIds,
  selectedSessionId,
  pickedSessionIds,
  selectedReservationId,
  onSelectSession,
  onSelectReservation,
}: {
  sessions: OpenTableSession[]
  /** Một thanh đại diện cho mỗi đặt bàn (đã tính trễ / xung đột). */
  reservationBars: TimelineBar[]
  reservationsById: Map<string, ReservationRow>
  tableNames: Map<string, string>
  trayColors: Map<string, TrayAssignment>
  visibleTableIds: Set<string>
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  selectedReservationId: string | null
  onSelectSession: (sessionId: string, additive: boolean) => void
  onSelectReservation: (reservationId: string) => void
}) {
  const items: Item[] = [
    ...sessions
      .filter((s) => s.status === 'open' && s.tables.some((t) => visibleTableIds.has(t.id)))
      .map((s) => ({ kind: 'session' as const, at: new Date(s.opened_at).getTime(), session: s })),
    ...reservationBars.flatMap((bar) => {
      const r = bar.reservationId ? reservationsById.get(bar.reservationId) : undefined
      if (!r) return []
      if (r.tableIds.length > 0 && !r.tableIds.some((id) => visibleTableIds.has(id))) return []
      return [{ kind: 'reservation' as const, at: new Date(r.arrivalAt).getTime(), reservation: r, bar }]
    }),
  ].sort((a, b) => (a.kind === b.kind ? a.at - b.at : a.kind === 'session' ? -1 : 1))

  if (items.length === 0) {
    return <EmptyState className="m-4">Không có bàn đang phục vụ hay đặt bàn nào trong ca ở khu vực này.</EmptyState>
  }

  const th = 'px-3 py-2 text-left text-[13px] font-medium text-muted'
  const td = 'px-3 py-2.5 align-middle'

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 md:px-5">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-xl border border-border bg-surface text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="[&>th]:border-b [&>th]:border-border">
            <th className={th}>Bàn</th>
            <th className={th}>Khách</th>
            <th className={th}>Giờ</th>
            <th className={th}>Trạng thái</th>
            <th className={cn(th, 'text-right')}>Tạm tính</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            if (item.kind === 'session') {
              const s = item.session
              const tray = trayColors.get(s.session_id)
              const picked = pickedSessionIds.has(s.session_id)
              const selected = selectedSessionId === s.session_id || picked
              return (
                <tr
                  key={`s:${s.session_id}`}
                  onClick={(e) => onSelectSession(s.session_id, e.ctrlKey || e.metaKey)}
                  className={cn('cursor-pointer hover:bg-item-hover [&>td]:border-b [&>td]:border-border', selected && 'bg-primary-light')}
                >
                  <td className={cn(td, 'font-semibold text-foreground', tray?.color.bar)}>
                    <button type="button" className="cursor-pointer text-left" onClick={(e) => { e.stopPropagation(); onSelectSession(s.session_id, e.ctrlKey || e.metaKey) }}>
                      {picked ? '✓ ' : ''}{tray ? `Mâm ${tray.index} · ` : ''}{s.table_number}
                    </button>
                  </td>
                  <td className={cn(td, 'text-muted')}>{s.opened_by === 'staff' ? 'Nhân viên mở' : 'Khách quét QR'} · {s.order_count} đơn</td>
                  <td className={cn(td, 'tabular text-muted')}>Mở {clock(item.at)}</td>
                  <td className={td}><TableStateBadge state={tableVisualState(s)} /></td>
                  <td className={cn(td, 'text-right font-semibold tabular text-foreground')}>{dong(s.unpaid_total)}</td>
                </tr>
              )
            }
            const r = item.reservation
            const selected = selectedReservationId === r.reservationId
            const tables = r.tableIds.map((id) => tableNames.get(id)).filter(Boolean).join(', ')
            return (
              <tr
                key={`r:${r.reservationId}`}
                onClick={() => onSelectReservation(r.reservationId)}
                className={cn('cursor-pointer hover:bg-item-hover [&>td]:border-b [&>td]:border-border', selected && 'bg-item-hover')}
              >
                <td className={cn(td, 'font-semibold text-foreground')}>
                  <button type="button" className="cursor-pointer text-left" onClick={(e) => { e.stopPropagation(); onSelectReservation(r.reservationId) }}>
                    {tables || 'Chưa xếp bàn'}
                  </button>
                </td>
                <td className={cn(td, 'text-foreground')}>{r.customerName} · {r.partySize} khách</td>
                <td className={cn(td, 'tabular text-muted')}>Hẹn {clock(item.at)}</td>
                <td className={td}>
                  <TableStateBadge
                    state={item.bar.state}
                    label={item.bar.conflict ? 'Xung đột' : item.bar.lateMinutes ? `Trễ ${item.bar.lateMinutes}p` : r.status === 'confirmed' ? 'Đã đặt' : 'Chờ duyệt'}
                  />
                </td>
                <td className={cn(td, 'text-right text-muted')}>—</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
