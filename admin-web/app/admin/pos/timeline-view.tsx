'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Check, Clock3, Crosshair, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { STATUS_TONE_CLASSES, TABLE_STATE } from '@/components/ui/status'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { AreaPlacedTable, TableArea } from '@/lib/area-layout'
import { clock, hourTicks, nextBookableSlot, percentOf, type TimelineBar, type TimelineWindow } from '@/lib/pos-timeline'
import type { TrayAssignment } from '@/lib/tray-colors'
import { cn } from '@/lib/utils'

const HOUR_PX = 132
const NAME_COL = 'w-24 md:w-40'
const LANE_PX = 44

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

type Group = { id: string | null; name: string; tables: AreaPlacedTable[] }

export default function TimelineView({
  tables,
  areas,
  rows,
  unassigned,
  window,
  now,
  sessionsById,
  reservationsById,
  trayColors,
  selectedSessionId,
  pickedSessionIds,
  selectedReservationId,
  onSelectSession,
  onSelectReservation,
  onPickSlot,
  slotMinutes,
  holdMinutes,
}: {
  tables: AreaPlacedTable[]
  areas: TableArea[]
  rows: Map<string, TimelineBar[]>
  unassigned: TimelineBar[]
  window: TimelineWindow
  now: number
  sessionsById: Map<string, OpenTableSession>
  reservationsById: Map<string, ReservationRow>
  trayColors: Map<string, TrayAssignment>
  selectedSessionId: string | null
  /** Các mâm đã chọn để gộp bill — vẽ viền + dấu tích như mâm đang mở bill. */
  pickedSessionIds: Set<string>
  selectedReservationId: string | null
  onSelectSession: (sessionId: string, additive: boolean) => void
  onSelectReservation: (reservationId: string) => void
  /** Nút "+ Đặt lúc HH:MM" ở mốc trống đầu tiên của mỗi bàn → đặt bàn lúc đó. */
  onPickSlot?: (tableId: string, at: number) => void
  /** Bước giờ đặt bàn + khoảng giữ bàn của quán (Cài đặt quán) — để tìm mốc trống. */
  slotMinutes: number
  holdMinutes: number
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const ticks = useMemo(() => hourTicks(window), [window])
  const width = ((window.end - window.start) / 3_600_000) * HOUR_PX
  const nowPct = percentOf(window, now)

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = areas
      .map((a) => ({ id: a.id, name: a.name, tables: tables.filter((t) => t.area_id === a.id) }))
      .filter((g) => g.tables.length > 0)
    const loose = tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id))
    if (loose.length > 0) out.unshift({ id: null, name: areas.length > 0 ? 'Chưa phân khu' : 'Tất cả bàn', tables: loose })
    return out
  }, [areas, tables])

  const scrollToNow = (behavior: ScrollBehavior = 'smooth') => {
    const el = scroller.current
    if (!el) return
    const nameCol = el.querySelector<HTMLElement>('[data-name-col]')?.offsetWidth ?? 0
    const target = (nowPct / 100) * width - (el.clientWidth - nameCol) / 3
    el.scrollTo({ left: Math.max(0, target), behavior })
  }

  // Mở trang là thấy ngay "bây giờ", không phải cuộn từ đầu ca.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scrollToNow('auto'), [window.start, window.end])

  if (tables.length === 0) {
    return <EmptyState className="m-4">Chưa có bàn nào trong khu vực này. Thêm bàn ở Bàn &amp; QR hoặc đổi khu vực.</EmptyState>
  }

  const renderBar = (bar: TimelineBar) => {
    const left = percentOf(window, bar.start)
    const right = percentOf(window, bar.end)
    const tone = TABLE_STATE[bar.state].tone
    const classes = STATUS_TONE_CLASSES[tone]
    const top = 4 + bar.lane * LANE_PX
    const style = { left: `${left}%`, width: `max(${right - left}%, 28px)`, top, height: LANE_PX - 8 }

    if (bar.kind === 'session' && bar.sessionId) {
      const s = sessionsById.get(bar.sessionId)
      if (!s) return null
      const tray = trayColors.get(s.session_id)
      const pending = s.orders.filter((o) => o.status === 'pending').length
      const title = bar.state === 'pending' ? `Chờ duyệt · ${pending}` : bar.state === 'late' ? 'Quá hạn · còn tiền' : s.order_count > 0 ? `${s.order_count} đơn` : 'Chưa gọi món'
      // Tên trước, trạng thái sau: thanh hẹp thì vẫn còn đọc được đây là bàn / mâm nào.
      const name = tray ? `Mâm ${tray.index}` : s.table_number
      const picked = pickedSessionIds.has(s.session_id)
      const selected = selectedSessionId === s.session_id || picked
      return (
        <button
          key={bar.key}
          type="button"
          style={style}
          title={`${tray ? `Mâm ${tray.index} · ` : ''}${s.table_number} · mở ${clock(new Date(s.opened_at).getTime())} · ${title} · ${dong(s.unpaid_total)}`}
          onClick={(e) => onSelectSession(s.session_id, e.ctrlKey || e.metaKey)}
          className={cn(
            '@container absolute flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border px-2 text-left text-[13px] leading-tight transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
            classes.bar,
            tray && tray.color.bar,
            bar.clippedStart && 'rounded-l-none',
            bar.state === 'pending' && 'animate-pulse',
            selected && 'ring-2 ring-primary ring-offset-1',
          )}
          aria-pressed={picked || undefined}
        >
          {picked && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} aria-label="Đã chọn gộp bill" />}
          <span className="shrink-0 font-semibold">{name}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
          <span className="hidden shrink-0 font-medium tabular @[10rem]:inline">{dong(s.unpaid_total)}</span>
        </button>
      )
    }

    if (bar.kind === 'reservation' && bar.reservationId) {
      const r = reservationsById.get(bar.reservationId)
      if (!r) return null
      const status = bar.conflict
        ? 'Xung đột: bàn còn khách'
        : bar.lateMinutes
          ? `Trễ ${bar.lateMinutes}p`
          : r.status === 'confirmed' ? 'Đã đặt' : r.status === 'change_requested' ? 'Xin đổi' : 'Chờ duyệt'
      const selected = selectedReservationId === r.reservationId
      return (
        <button
          key={bar.key}
          type="button"
          style={style}
          title={`${r.customerName} · ${r.partySize} khách · hẹn ${clock(new Date(r.arrivalAt).getTime())} · ${status}`}
          onClick={() => onSelectReservation(r.reservationId)}
          className={cn(
            '@container absolute flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-dashed px-2 text-left text-[13px] leading-tight hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
            classes.bar,
            selected && 'ring-2 ring-primary ring-offset-1',
          )}
        >
          <Clock3 className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {clock(new Date(r.arrivalAt).getTime())} {r.customerName} · {r.partySize} khách
          </span>
          <span className="hidden shrink-0 font-medium @[14rem]:inline">{status}</span>
        </button>
      )
    }
    return null
  }

  const laneCount = (bars: TimelineBar[]) => Math.max(1, ...bars.map((b) => b.lane + 1))

  // Bấm nhầm vào khoảng trắng từng mở form đặt bàn liên tục → chỉ còn MỘT nút rõ ràng ở mốc trống đầu tiên.
  const slotButton = (tableId: string, bars: TimelineBar[]) => {
    if (!onPickSlot) return null
    const at = nextBookableSlot({ bars, now, window, slotMinutes, holdMinutes })
    if (at === null) return null
    return (
      <button
        type="button"
        onClick={() => onPickSlot(tableId, at)}
        style={{ left: `${percentOf(window, at)}%`, top: 8, height: LANE_PX - 16 }}
        className="absolute ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-border-strong bg-surface px-2 text-[13px] font-medium whitespace-nowrap text-muted hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Plus className="size-3.5" aria-hidden />Đặt lúc {clock(at)}
      </button>
    )
  }

  const row = (key: string, label: ReactNode, sub: ReactNode, bars: TimelineBar[], tableId?: string) => (
    <div key={key} className="flex border-b border-border last:border-b-0">
      <div
        data-name-col
        className={cn(NAME_COL, 'sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-border bg-surface px-3')}
      >
        <span className="truncate text-sm font-semibold text-foreground">{label}</span>
        {sub ? <span className="truncate text-[13px] text-muted">{sub}</span> : null}
      </div>
      <div className="relative shrink-0" style={{ width, height: laneCount(bars) * LANE_PX }}>
        {bars.map(renderBar)}
        {tableId ? slotButton(tableId, bars) : null}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2 md:px-5">
        <p className="min-w-0 truncate text-[13px] text-muted tabular">
          {clock(window.start)} – {clock(window.end)}<span className="hidden sm:inline"> · bấm thanh để mở bill{onPickSlot ? ' · "+ Đặt lúc" để đặt bàn' : ''}</span>
        </p>
        <Button variant="ghost" icon={<Crosshair />} onClick={() => scrollToNow()} className="min-h-9 shrink-0 md:min-h-9">
          <span className="tabular">Về bây giờ · {clock(now)}</span>
        </Button>
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain border-t border-border bg-surface">
        <div className="relative w-max min-w-full">
          {/* Thước giờ dính trên */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-surface">
            <div className={cn(NAME_COL, 'sticky left-0 z-10 shrink-0 border-r border-border bg-surface px-3 py-2 text-[13px] font-medium text-muted')}>
              Bàn
            </div>
            <div className="relative h-9 shrink-0" style={{ width }}>
              {ticks.map((t) => (
                <span
                  key={t}
                  className={cn('absolute top-0 flex h-full items-center pl-1 text-[13px] text-muted tabular')}
                  style={{ left: `${percentOf(window, t)}%` }}
                >
                  {clock(t)}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            {/* Lưới giờ + vạch "bây giờ" phủ lên mọi hàng */}
            <div aria-hidden className={cn('pointer-events-none absolute inset-y-0 right-0', 'left-24 md:left-40')}>
              <div className="relative h-full" style={{ width }}>
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-border" style={{ left: `${percentOf(window, t)}%` }} />
                ))}
                <span className="absolute inset-y-0 z-10 w-0.5 bg-critical" style={{ left: `${nowPct}%` }} />
              </div>
            </div>

            {unassigned.length > 0 && (
              <div className="border-b border-border bg-warning-bg/40">
                {row('unassigned', 'Chưa xếp bàn', `${unassigned.length} đặt bàn`, unassigned)}
              </div>
            )}

            {groups.map((g) => (
              <section key={g.id ?? 'none'} aria-label={g.name}>
                <div className="border-b border-border bg-background">
                  {/* Dải rộng bằng cả thước; chỉ chữ dính trái để còn thấy tên khu khi cuộn ngang. */}
                  <span className="sticky left-0 z-10 inline-block px-3 py-1.5 text-[13px] font-semibold tracking-wide text-muted uppercase">
                    {g.name} · {g.tables.length} bàn
                  </span>
                </div>
                {g.tables.map((t) => {
                  const bars = rows.get(t.id) ?? []
                  const sessionBar = bars.find((b) => b.kind === 'session')
                  const sub = sessionBar ? TABLE_STATE[sessionBar.state].label : bars.length > 0 ? 'Có đặt bàn' : 'Trống'
                  return row(t.id, t.table_number, sub, bars, t.id)
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
