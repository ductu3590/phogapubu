'use client'

import { useMemo, useState } from 'react'
import WorkQueue from '@/app/admin/pos/work-queue'
import { useNow } from '@/app/admin/pos/use-now'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ServiceRequestRow } from '@/lib/actions/service-requests'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
import { buildWorkQueue, type WorkFilter } from '@/lib/pos-work-queue'
import type { TimelineBar } from '@/lib/pos-timeline'
import { TRAY_COLORS, type TrayAssignment } from '@/lib/tray-colors'

// "Việc cần xử lý" của /admin/pos với dữ liệu minh hoạ — không đọc/ghi database, nút bấm không làm gì.
const MIN = 60_000
const item = (id: string, name: string, quantity: number, price: number, toppings: { name: string; price: number }[] = []) =>
  ({ id, name, quantity, price, toppings: toppings.map((t, i) => ({ id: `${id}-t${i}`, ...t })), void_type: null, void_reason: null, voided_at: null, is_gift: false })

export default function PosWorkQueueDemo() {
  const now = useNow()
  const [filter, setFilter] = useState<WorkFilter>('all')
  const data = useMemo(() => {
    if (now === null) return null
    const iso = (m: number) => new Date(now + m * MIN).toISOString()
    const sessions = [
      { session_id: 's9', status: 'open', table_number: 'Bàn 9, Bàn 10', tables: [{ id: 't9' }, { id: 't10' }], orders: [
        { id: 'o1', status: 'confirmed', created_at: iso(-40), order_source: 'customer', total_amount: 560_000, items: [] },
        { id: 'o2', status: 'pending', created_at: iso(-7), order_source: 'customer', total_amount: 100_000, items: [item('i1', 'Bia Tiger bạc (Tháp 3L)', 4, 25_000)] },
        { id: 'o3', status: 'pending', created_at: iso(-3), order_source: 'staff', total_amount: 50_000, items: [item('i2', 'Rau rừng cuốn thêm', 1, 40_000, [{ name: 'Thêm nước chấm', price: 10_000 }])] },
      ] },
      { session_id: 's3', status: 'open', table_number: 'Bàn 3', tables: [{ id: 't3' }], orders: [] },
    ] as unknown as OpenTableSession[]
    const requests = [{ id: 'q1', store_id: 'x', table_id: 't3', table_number: 'Bàn 3', type: 'call_staff', session_id: 's3', created_at: iso(-4), last_ping_at: iso(-1), ping_count: 2, resolved_at: null, resolved_by: null }] as ServiceRequestRow[]
    const reservations = [
      { reservationId: 'r1', status: 'confirmed', customerName: 'C. Thảo', partySize: 4, arrivalAt: iso(-25), tableNumbers: ['Bàn 4'], tableIds: ['t4'], sessionId: null },
      { reservationId: 'r2', status: 'pending', customerName: 'Đoàn công ty', partySize: 20, arrivalAt: iso(150), tableNumbers: [], tableIds: [], sessionId: null },
      { reservationId: 'r3', status: 'confirmed', customerName: 'A. Nam', partySize: 6, arrivalAt: iso(35), tableNumbers: ['Bàn 5'], tableIds: ['t5'], sessionId: null },
    ] as unknown as ReservationRow[]
    const calls = [{ taskId: 'c1', reservationId: 'r3', customerName: 'A. Nam', customerPhone: '0912345882', partySize: 6, arrivalAt: iso(35), dueAt: iso(-25), createdAt: iso(-60) }] as ReservationCustomerCallTask[]
    const bars = new Map<string, TimelineBar>([['r1', { key: 'b', kind: 'reservation', start: 0, end: 0, clippedStart: false, state: 'late', lane: 0, lateMinutes: 25 }]])
    const trays = new Map<string, TrayAssignment>([['s9', { color: TRAY_COLORS[0], index: 1 }]])
    return { sessions, requests, reservations, calls, trays, items: buildWorkQueue({ sessions, requests, reservations, reservationBars: bars, customerCalls: calls, now }) }
  }, [now])

  if (!data || now === null) return null
  const noop = () => undefined
  return (
    <div className="flex h-[640px] w-full max-w-[400px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <WorkQueue
        items={data.items}
        filter={filter}
        onFilter={setFilter}
        now={now}
        reservationsEnabled
        sessionsById={new Map(data.sessions.map((s) => [s.session_id, s]))}
        requestsById={new Map(data.requests.map((r) => [r.id, r]))}
        reservationsById={new Map(data.reservations.map((r) => [r.reservationId, r]))}
        customerCallsById={new Map(data.calls.map((c) => [c.taskId, c]))}
        trayColors={data.trays}
        reminderIds={new Set(['r1'])}
        busy={false}
        requestBusyId={null}
        requestError={null}
        handlers={{
          onOpenSession: noop, onOpenReservation: noop, onConfirmOrder: noop, onRejectOrder: noop, onResolveRequest: noop,
          onConfirmReservation: noop, onArriveReservation: noop, onSnoozeReservation: noop, onResolveCustomerCall: noop,
        }}
      />
    </div>
  )
}
