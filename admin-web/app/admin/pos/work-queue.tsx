'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Bell, BellRing, CalendarDays, CircleCheck, Phone, Printer, TriangleAlert, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { Banner, EmptyState } from '@/components/ui/feedback'
import { Tabs } from '@/components/ui/tabs'
import { STATUS_TONE_CLASSES, type StatusTone } from '@/components/ui/status'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ServiceRequestRow } from '@/lib/actions/service-requests'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
import { clock } from '@/lib/pos-timeline'
import { countByFilter, waitLabel, type WorkFilter, type WorkItem } from '@/lib/pos-work-queue'
import type { TrayAssignment } from '@/lib/tray-colors'
import { phoneHref } from '../reservations/reservation-ui'
import { cn } from '@/lib/utils'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

// Viền thẻ theo mức độ việc — bản Stitch P05.
const TONE_BORDER: Record<StatusTone, string> = {
  critical: 'border-red-200',
  warning: 'border-amber-200',
  success: 'border-emerald-200',
  info: 'border-blue-200',
  accent: 'border-orange-200',
  neutral: 'border-slate-200',
}

const REASON_LABEL = {
  conflict: 'Xung đột: bàn còn khách',
  late: 'Khách trễ',
  due: 'Đến giờ hẹn',
  pending: 'Chờ duyệt',
  change: 'Khách xin đổi',
  upcoming: 'Sắp đến',
} as const

export type WorkQueueHandlers = {
  onOpenSession: (sessionId: string) => void
  onOpenReservation: (reservationId: string) => void
  onConfirmOrder: (orderId: string) => void
  onRejectOrder: (orderId: string) => void
  onResolveRequest: (requestId: string) => void
  onConfirmReservation: (reservation: ReservationRow) => void
  onArriveReservation: (reservation: ReservationRow) => void
  onSnoozeReservation: (reservationId: string, minutes: 10 | 15 | 30) => void
  onResolveCustomerCall: (taskId: string, outcome: 'called' | 'unreachable') => void
}

export default function WorkQueue({
  items,
  filter,
  onFilter,
  now,
  reservationsEnabled,
  sessionsById,
  requestsById,
  reservationsById,
  customerCallsById,
  trayColors,
  reminderIds,
  busy,
  requestBusyId,
  requestError,
  footer,
  handlers,
}: {
  items: WorkItem[]
  filter: WorkFilter
  onFilter: (filter: WorkFilter) => void
  now: number
  reservationsEnabled: boolean
  sessionsById: Map<string, OpenTableSession>
  requestsById: Map<string, ServiceRequestRow>
  reservationsById: Map<string, ReservationRow>
  customerCallsById: Map<string, ReservationCustomerCallTask>
  trayColors: Map<string, TrayAssignment>
  /** Đặt bàn đang đến lượt chuông nhắc — hiện nút hoãn +10/+15/+30. */
  reminderIds: Set<string>
  busy: boolean
  requestBusyId: string | null
  requestError: string | null
  /** Khối phụ cuối danh sách (món đặt trước) — chỉ hiện ở Tất cả / Đặt bàn. */
  footer?: ReactNode
  handlers: WorkQueueHandlers
}) {
  const counts = countByFilter(items)
  const visible = filter === 'all' ? items : items.filter((i) => i.filter === filter)
  const sessionName = (s: OpenTableSession) => {
    const tray = trayColors.get(s.session_id)
    return tray ? `Mâm ${tray.index} · ${s.table_number}` : s.table_number
  }

  const tabs = [
    { value: 'all' as const, label: 'Tất cả', count: counts.all },
    { value: 'orders' as const, label: 'Lượt món', count: counts.orders },
    { value: 'calls' as const, label: 'Gọi NV', count: counts.calls },
    ...(reservationsEnabled ? [{ value: 'booking' as const, label: 'Đặt bàn', count: counts.booking }] : []),
  ]

  const card = (item: WorkItem, icon: ReactNode, title: ReactNode, meta: ReactNode, body: ReactNode, actions: ReactNode, extra?: ReactNode) => (
    <li
      key={item.key}
      className={cn('rounded-xl border-2 bg-white p-3', TONE_BORDER[item.tone])}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border [&>svg]:size-4', STATUS_TONE_CLASSES[item.tone].badge)} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <p className="min-w-0 text-sm font-semibold text-foreground">{title}</p>
            <p className="shrink-0 text-[13px] text-muted tabular">{meta}</p>
          </div>
          {body}
        </div>
      </div>
      {extra}
      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </li>
  )

  const render = (item: WorkItem) => {
    if (item.kind === 'call') {
      const r = requestsById.get(item.requestId)
      if (!r) return null
      const s = item.sessionId ? sessionsById.get(item.sessionId) : undefined
      return card(
        item,
        <Bell />,
        s ? sessionName(s) : r.table_number,
        `chờ ${waitLabel(item.since, now)}`,
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Bàn gọi nhân viên · {r.ping_count} lần <span className="font-normal text-amber-800">· lần cuối {clock(new Date(r.last_ping_at).getTime())}</span>
        </p>,
        <div className="grid w-full grid-cols-2 gap-2">
          {s ? <Button onClick={() => handlers.onOpenSession(s.session_id)} className="font-semibold">Mở bill</Button> : <span />}
          <Button
            icon={<CircleCheck />}
            isLoading={requestBusyId === r.id}
            disabled={requestBusyId !== null && requestBusyId !== r.id}
            onClick={() => handlers.onResolveRequest(r.id)}
            className="border-emerald-700 bg-emerald-600 font-bold text-white hover:bg-emerald-700 hover:text-white"
          >
            Đã xử lý xong
          </Button>
        </div>,
      )
    }

    if (item.kind === 'order') {
      const s = sessionsById.get(item.sessionId)
      const o = s?.orders.find((x) => x.id === item.orderId)
      if (!s || !o) return null
      const items = o.items.filter((i) => i.void_type !== 'cancelled')
      const staff = o.order_source === 'staff'
      return card(
        item,
        <BellRing />,
        <>{sessionName(s)} <span className="font-normal text-muted">· Lượt #{String(item.round).padStart(2, '0')}</span></>,
        `${clock(item.since)} · ${waitLabel(item.since, now)}`,
        <>
          <span className={cn('mt-1 inline-flex items-center gap-1 rounded px-1.5 text-[11px] leading-5 font-bold text-white uppercase', staff ? 'bg-blue-600' : 'bg-orange-600')}>
            {staff ? 'NV đặt hộ' : 'QR khách tại bàn'}
          </span>
          <ul className="mt-2 space-y-1 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-slate-900">
                  <b className="font-bold text-orange-600 tabular">{i.quantity}x</b> {i.name}
                  {i.toppings.length > 0 && <span className="block text-[12px] text-muted">+ {i.toppings.map((t) => t.name).join(', ')}</span>}
                </span>
                <span className="shrink-0 font-semibold text-slate-900 tabular">{dong((i.price + i.toppings.reduce((n, t) => n + t.price, 0)) * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
            <span>Tổng lượt</span><span className="tabular">{dong(o.total_amount)}</span>
          </p>
        </>,
        <>
          <div className="grid w-full grid-cols-[1fr_auto] gap-2">
            <Button variant="primary" icon={<Printer />} disabled={busy} onClick={() => handlers.onConfirmOrder(o.id)} className="font-bold">Duyệt &amp; in bếp</Button>
            <Button icon={<X />} disabled={busy} onClick={() => handlers.onRejectOrder(o.id)} className="border-red-200 bg-red-50 font-semibold text-red-700 hover:bg-red-100 hover:text-red-800">Từ chối</Button>
          </div>
          <Button variant="ghost" onClick={() => handlers.onOpenSession(s.session_id)} className="w-full">Mở bill bàn này</Button>
        </>,
      )
    }

    if (item.kind === 'reservation') {
      const r = reservationsById.get(item.reservationId)
      if (!r) return null
      const call = item.callTaskId ? customerCallsById.get(item.callTaskId) : undefined
      const callHref = call ? phoneHref(call.customerPhone) : null
      const reasonLabel = item.reason === 'late' ? `Trễ ${item.minutes} phút` : item.reason === 'upcoming' ? `Còn ${-item.minutes} phút` : REASON_LABEL[item.reason]
      return card(
        item,
        item.reason === 'conflict' || item.reason === 'late' ? <TriangleAlert /> : <CalendarDays />,
        <>{r.customerName} <span className="font-normal text-muted">· {r.partySize} khách</span></>,
        `hẹn ${clock(new Date(r.arrivalAt).getTime())}`,
        // Bàn + trạng thái chung một dòng — không xếp nhãn thành hàng riêng thò ra thụt vào.
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span>{r.tableNumbers.length ? r.tableNumbers.join(', ') : 'Chưa xếp bàn'}</span>
          <Badge tone={item.tone} withDot>{reasonLabel}</Badge>
        </p>,
        // Hàng nút: nút chính giãn hết chỗ, "Chi tiết" gọn bên phải. Hoãn nhắc là một hàng đủ rộng bên dưới.
        <>
          <div className="grid w-full grid-cols-[1fr_auto] gap-2">
            {r.status === 'pending' && <Button variant="primary" disabled={busy} onClick={() => handlers.onConfirmReservation(r)}>Xác nhận &amp; chọn bàn</Button>}
            {r.status === 'confirmed' && <Button variant="primary" disabled={busy} onClick={() => handlers.onArriveReservation(r)}>Khách đã đến</Button>}
            {r.status === 'change_requested' && <Link href="/admin/reservations" className={getButtonClasses('primary')}>Xử lý ở trang Đặt bàn</Link>}
            <Button variant="ghost" onClick={() => handlers.onOpenReservation(r.reservationId)}>Chi tiết</Button>
          </div>
          {reminderIds.has(r.reservationId) && (
            <div className="grid w-full grid-cols-[auto_1fr_1fr_1fr] items-center gap-1.5 text-[13px] text-muted">
              <span>Hoãn nhắc</span>
              {([10, 15, 30] as const).map((m) => (
                <Button key={m} disabled={busy} onClick={() => handlers.onSnoozeReservation(r.reservationId, m)} className="min-h-8 px-2 text-[13px] whitespace-nowrap tabular md:min-h-8">+{m} phút</Button>
              ))}
            </div>
          )}
        </>,
        <>
          {item.reason === 'conflict' && (
            <p className="mt-3 rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[13px] text-critical">Bàn giữ cho khách này vẫn còn khách khác ngồi.</p>
          )}
          {call && (
            // Gọi nhắc khách gộp vào thẻ đặt bàn: một khối rộng hết thẻ, cùng mép với hàng nút.
            <div className="mt-3 rounded-lg border border-info-border bg-info-bg p-2.5">
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex items-center gap-1.5 font-semibold text-info"><Phone className="size-3.5" aria-hidden />Gọi nhắc khách</span>
                {callHref
                  ? <a href={callHref} className="font-semibold text-foreground tabular underline-offset-4 hover:underline">{call.customerPhone}</a>
                  : <span className="text-critical">Số không hợp lệ</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button disabled={busy} onClick={() => handlers.onResolveCustomerCall(call.taskId, 'called')} className="min-h-9 bg-surface text-[13px] whitespace-nowrap md:min-h-9">Đã gọi</Button>
                <Button disabled={busy} onClick={() => handlers.onResolveCustomerCall(call.taskId, 'unreachable')} className="min-h-9 bg-surface text-[13px] whitespace-nowrap md:min-h-9">Không gọi được</Button>
              </div>
            </div>
          )}
        </>,
      )
    }

    const t = customerCallsById.get(item.taskId)
    if (!t) return null
    const href = phoneHref(t.customerPhone)
    return card(
      item,
      <Phone />,
      <>{t.customerName} <span className="font-normal text-muted">· {t.partySize} khách</span></>,
      `hẹn ${clock(new Date(t.arrivalAt).getTime())}`,
      <p className="mt-0.5 text-[13px] text-muted">Gọi nhắc khách trước giờ đến. Mở cuộc gọi không tự đánh dấu xong.</p>,
      <>
        {href ? <a href={href} className={getButtonClasses('primary')}><Phone className="size-4" aria-hidden />Gọi {t.customerPhone}</a> : <span className="self-center text-[13px] text-critical">Số điện thoại không hợp lệ</span>}
        <Button disabled={busy} onClick={() => handlers.onResolveCustomerCall(t.taskId, 'called')}>Đã gọi</Button>
        <Button variant="ghost" disabled={busy} onClick={() => handlers.onResolveCustomerCall(t.taskId, 'unreachable')}>Chưa liên hệ được</Button>
      </>,
    )
  }

  const emptyText: Record<WorkFilter, string> = {
    all: 'Không có việc nào đang chờ. Bấm một thanh trên Timeline để mở bill.',
    orders: 'Không có lượt món nào chờ duyệt.',
    calls: 'Không có bàn nào đang gọi nhân viên.',
    booking: 'Không có đặt bàn nào cần xử lý trong giờ tới.',
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-2">
        <Tabs label="Lọc việc" value={filter} onValueChange={onFilter} items={tabs} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {requestError && <Banner tone="error" title="Không tải được yêu cầu gọi nhân viên" className="mb-3">{requestError}</Banner>}
        {visible.length === 0 ? (
          <EmptyState className="py-6">
            <Users className="mx-auto mb-2 size-6 text-muted" aria-hidden />
            {emptyText[filter]}
          </EmptyState>
        ) : (
          <ul className="space-y-3">{visible.map(render)}</ul>
        )}
        {(filter === 'all' || filter === 'booking') && footer}
      </div>
    </div>
  )
}
