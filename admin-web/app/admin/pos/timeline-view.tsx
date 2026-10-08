'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Clock3, Crosshair, Link2, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { STATUS_TONE_CLASSES, TABLE_STATE, type TableVisualState } from '@/components/ui/status'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { AreaPlacedTable, TableArea } from '@/lib/area-layout'
import { clock, hourTicks, nextBookableSlot, percentOf, type TimelineBar, type TimelineWindow } from '@/lib/pos-timeline'
import type { TrayAssignment } from '@/lib/tray-colors'
import { cn } from '@/lib/utils'
import { areaColorClasses } from '@/lib/area-colors'

const HOUR_PX = 132
const NAME_COL = 'w-28 md:w-48'
const NAME_LEFT = 'left-28 md:left-48'
const LANE_PX = 48
/** Vạch "bây giờ" đứng ở tỉ lệ này của khung nhìn, tính từ mép trái vùng giờ. */
const NOW_AT = 0.2

// Dải tiêu đề khu vực có màu như bản Stitch P01 (Sân vườn xanh lá, Tầng 1 xanh dương, VIP tím…).
// Chỉ để phân khu bằng mắt — KHÔNG phải màu trạng thái; xoay vòng theo thứ tự khu.

// Thanh đặt bàn chờ duyệt: viền đứt + sọc chéo nhạt ("Dự kiến" trong bản Stitch).
const HATCH = 'bg-[repeating-linear-gradient(135deg,rgb(255_247_237)_0,rgb(255_247_237)_8px,rgb(255_237_213)_8px,rgb(255_237_213)_16px)]'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

// Nhãn ngắn ở cột bàn (bản Stitch: "Đang ăn", "Đã đặt", "Trống"…).
const SHORT_STATE: Record<TableVisualState, string> = {
  serving: 'Đang ăn',
  booked: 'Đã đặt',
  pending: 'Chờ duyệt',
  late: 'Trễ',
  free: 'Trống',
}

type Group = { id: string | null; name: string; color?: string; tables: AreaPlacedTable[] }

export default function TimelineView({
  tables,
  areas,
  rows,
  unassigned,
  window: baseWindow,
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
  bookUntil,
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
  /** Giờ đóng ca — nút "+ Đặt lúc" không vượt quá. */
  bookUntil: number | null
}) {
  const scroller = useRef<HTMLDivElement>(null)
  // Bề ngang khung nhìn thật — để thước giờ luôn đủ dài phía trước "bây giờ" (màn rộng 1920px
  // nhìn được ~9 giờ; thước chỉ tới cuối ca thì không cuộn được, vạch đỏ bị dồn ra giữa).
  const [viewportPx, setViewportPx] = useState(0)
  const isEmpty = tables.length === 0
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportPx(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [isEmpty])
  const window = useMemo<TimelineWindow>(() => {
    const visibleHours = Math.max(0, viewportPx - 192) / HOUR_PX
    const needEnd = now + visibleHours * (1 - NOW_AT) * 3_600_000
    return { start: baseWindow.start, end: Math.max(baseWindow.end, Math.ceil(needEnd / 3_600_000) * 3_600_000) }
  }, [baseWindow, viewportPx, now])
  const ticks = useMemo(() => hourTicks(window), [window])
  const width = ((window.end - window.start) / 3_600_000) * HOUR_PX
  const nowPct = percentOf(window, now)

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = areas
      .map((a) => ({ id: a.id, name: a.name, color: a.color, tables: tables.filter((t) => t.area_id === a.id) }))
      .filter((g) => g.tables.length > 0)
    const loose = tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id))
    if (loose.length > 0) out.unshift({ id: null, name: areas.length > 0 ? 'Chưa phân khu' : 'Tất cả bàn', tables: loose })
    return out
  }, [areas, tables])

  const scrollToNow = (behavior: ScrollBehavior = 'smooth') => {
    const el = scroller.current
    if (!el) return
    const nameCol = el.querySelector<HTMLElement>('[data-name-col]')?.offsetWidth ?? 0
    // Vạch "bây giờ" đứng ở ~1/5 khung nhìn (anh Tú vẽ chỗ 2026-10-03): phần còn lại là giờ sắp tới.
    const target = (nowPct / 100) * width - (el.clientWidth - nameCol) * NOW_AT
    el.scrollTo({ left: Math.max(0, target), behavior })
  }

  // Mở trang là thấy ngay "bây giờ", không phải cuộn từ đầu ca (chạy lại khi đo xong bề ngang).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scrollToNow('auto'), [window.start, window.end, viewportPx])

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
            '@container absolute flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-2.5 text-left text-[13px] leading-tight shadow-sm transition-[box-shadow,filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
            classes.solid,
            tray && tray.color.bar,
            bar.clippedStart && 'rounded-l-none',
            selected && 'ring-2 ring-slate-900 ring-offset-2',
          )}
          aria-pressed={picked || undefined}
        >
          {picked && <Check className="size-4 shrink-0" strokeWidth={3} aria-label="Đã chọn gộp bill" />}
          {/* Chờ duyệt: chỉ chấm trắng nháy, không nháy cả thanh (thanh đặc nháy thì nhạt màu, khó đọc). */}
          {bar.state === 'pending' && <span className="size-2 shrink-0 animate-ping rounded-full bg-white" aria-hidden />}
          {tray && <Link2 className="size-3.5 shrink-0 opacity-90" aria-hidden />}
          <span className="shrink-0 font-bold">{name}</span>
          <span className="hidden shrink-0 rounded bg-black/20 px-1.5 text-[12px] font-semibold tabular @[13rem]:inline">{clock(new Date(s.opened_at).getTime())}</span>
          <span className="min-w-0 flex-1 truncate font-semibold opacity-95">{title}</span>
          <span className="hidden shrink-0 font-bold tabular @[10rem]:inline">{dong(s.unpaid_total)}</span>
        </button>
      )
    }

    if (bar.kind === 'reservation' && bar.reservationId) {
      const r = reservationsById.get(bar.reservationId)
      if (!r) return null
      const status = bar.conflict
        ? 'Xung đột'
        : bar.lateMinutes
          ? `Trễ ${bar.lateMinutes}p`
          : r.status === 'confirmed' ? 'Đã đặt' : r.status === 'change_requested' ? 'Xin đổi' : 'Chờ duyệt'
      const selected = selectedReservationId === r.reservationId
      const look = bar.conflict
        ? 'border-2 border-red-500 bg-red-50 text-red-700'
        : bar.state === 'pending'
          ? cn('border-2 border-dashed border-orange-400 text-orange-900', HATCH)
          : classes.solid
      const pill = bar.conflict
        ? 'bg-red-600 text-white'
        : bar.state === 'pending' ? 'bg-orange-500 text-white' : 'bg-white/90 text-slate-900'
      return (
        <button
          key={bar.key}
          type="button"
          style={style}
          title={`${r.customerName} · ${r.partySize} khách · hẹn ${clock(new Date(r.arrivalAt).getTime())} · ${status}`}
          onClick={() => onSelectReservation(r.reservationId)}
          className={cn(
            '@container absolute flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-md border px-2.5 text-left text-[13px] leading-tight shadow-sm hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
            look,
            selected && 'ring-2 ring-slate-900 ring-offset-2',
          )}
        >
          {bar.conflict ? <TriangleAlert className="size-4 shrink-0" aria-hidden /> : <Clock3 className="size-3.5 shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1 truncate font-bold">
            {r.customerName} ({r.partySize}K) · {clock(new Date(r.arrivalAt).getTime())}
          </span>
          <span className={cn('hidden shrink-0 rounded px-1.5 text-[12px] leading-5 font-bold @[14rem]:inline', pill)}>{status}</span>
        </button>
      )
    }
    return null
  }

  const laneCount = (bars: TimelineBar[]) => Math.max(1, ...bars.map((b) => b.lane + 1))

  // Bấm nhầm vào khoảng trắng từng mở form đặt bàn liên tục → chỉ còn MỘT nút rõ ràng ở mốc trống đầu tiên.
  const slotButton = (tableId: string, bars: TimelineBar[]) => {
    if (!onPickSlot) return null
    const at = nextBookableSlot({ bars, now, window, slotMinutes, holdMinutes, until: bookUntil })
    if (at === null) return null
    return (
      <button
        type="button"
        onClick={() => onPickSlot(tableId, at)}
        style={{ left: `${percentOf(window, at)}%`, top: 8, height: LANE_PX - 16 }}
        className="absolute ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2.5 text-[13px] font-semibold whitespace-nowrap text-slate-500 hover:border-orange-500 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <Plus className="size-3.5" aria-hidden />Đặt lúc {clock(at)}
      </button>
    )
  }

  const row = (key: string, label: ReactNode, sub: ReactNode, bars: TimelineBar[], tableId?: string, state?: TableVisualState) => (
    <div key={key} className="flex border-b border-slate-100 last:border-b-0">
      <div
        data-name-col
        className={cn(NAME_COL, 'sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-slate-200 bg-white px-3')}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{label}</p>
          {sub ? <p className="truncate text-[12px] text-slate-500">{sub}</p> : null}
        </div>
        {state ? (
          <span className={cn('hidden shrink-0 rounded-md border px-1.5 text-[12px] leading-5 font-semibold md:inline', STATUS_TONE_CLASSES[TABLE_STATE[state].tone].badge)}>
            {SHORT_STATE[state]}
          </span>
        ) : null}
      </div>
      <div className="relative shrink-0" style={{ width, height: laneCount(bars) * LANE_PX }}>
        {bars.map(renderBar)}
        {tableId ? slotButton(tableId, bars) : null}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 bg-white px-4 py-1.5 md:px-5">
        <p className="min-w-0 truncate text-[13px] text-slate-500 tabular">
          Bấm thanh để mở bill{onPickSlot ? ' · "+ Đặt lúc" để đặt bàn' : ''}
        </p>
        <Button icon={<Crosshair className="text-orange-600" />} onClick={() => scrollToNow()} className="min-h-9 shrink-0 font-semibold md:min-h-9">
          <span className="tabular">Về &quot;Bây giờ&quot; ({clock(now)})</span>
        </Button>
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain border-t border-slate-200 bg-white">
        <div className="relative w-max min-w-full">
          {/* Thước giờ dính trên */}
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50">
            <div className={cn(NAME_COL, 'sticky left-0 z-10 flex shrink-0 items-center justify-between gap-2 border-r border-slate-200 bg-slate-50 px-3 py-2')}>
              <span className="text-[12px] font-bold tracking-wide text-slate-600 uppercase">Bàn</span>
              <span className="rounded bg-slate-200 px-1.5 text-[12px] leading-5 font-bold text-slate-600 tabular">{tables.length}</span>
            </div>
            <div className="relative h-10 shrink-0" style={{ width }}>
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute top-0 flex h-full items-center pl-1.5 text-[13px] font-semibold text-slate-600 tabular"
                  style={{ left: `${percentOf(window, t)}%` }}
                >
                  {clock(t)}
                </span>
              ))}
              <span
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-red-600 px-1.5 text-[12px] leading-5 font-bold text-white shadow-sm tabular"
                style={{ left: `${nowPct}%` }}
              >
                {clock(now)}
              </span>
            </div>
          </div>

          <div className="relative">
            {/* Lưới giờ + vạch "bây giờ" phủ lên mọi hàng */}
            <div aria-hidden className={cn('pointer-events-none absolute inset-y-0 right-0', NAME_LEFT)}>
              <div className="relative h-full" style={{ width }}>
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${percentOf(window, t)}%` }} />
                ))}
                <span className="absolute inset-y-0 z-10 w-0.5 bg-red-500" style={{ left: `${nowPct}%` }} />
              </div>
            </div>

            {unassigned.length > 0 && (
              <div className="border-b border-orange-100 bg-orange-50/60">
                {row('unassigned', 'Chưa xếp bàn', `${unassigned.length} đặt bàn`, unassigned)}
              </div>
            )}

            {groups.map((g) => (
              <section key={g.id ?? 'none'} aria-label={g.name}>
                {/* Màu KHU (PA-3, pastel) — nhận diện khu, không phải trạng thái. Chưa phân khu: xám nhạt trung tính. */}
                <div className={cn('border-y', g.id ? areaColorClasses(g.color).header : 'bg-slate-50 text-slate-700 border-slate-100')}>
                  {/* Dải rộng bằng cả thước; chỉ chữ dính trái để còn thấy tên khu khi cuộn ngang. */}
                  <span className="sticky left-0 z-10 inline-block px-3 py-1.5 text-[13px] font-bold tracking-wide uppercase">
                    {g.id && <span className={cn('mr-1.5 inline-block size-2 rounded-full align-middle', areaColorClasses(g.color).dot)} aria-hidden />}
                    {g.name} <span className="font-semibold opacity-80">({g.tables.length} bàn)</span>
                  </span>
                </div>
                {g.tables.map((t) => {
                  const bars = rows.get(t.id) ?? []
                  const sessionBar = bars.find((b) => b.kind === 'session')
                  const nextBooking = bars.find((b) => b.kind === 'reservation')
                  const state: TableVisualState = sessionBar ? sessionBar.state : nextBooking ? nextBooking.state : 'free'
                  const session = sessionBar?.sessionId ? sessionsById.get(sessionBar.sessionId) : undefined
                  const booking = nextBooking?.reservationId ? reservationsById.get(nextBooking.reservationId) : undefined
                  const sub = session
                    ? `Mở ${clock(new Date(session.opened_at).getTime())}`
                    : booking ? `Hẹn ${clock(new Date(booking.arrivalAt).getTime())} · ${booking.partySize} khách` : 'Sẵn sàng đón khách'
                  return row(t.id, t.table_number, sub, bars, t.id, state)
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
