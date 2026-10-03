'use client'

import { useMemo, useState } from 'react'
import TimelineView from '@/app/admin/pos/timeline-view'
import { useNow } from '@/app/admin/pos/use-now'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { AreaPlacedTable } from '@/lib/area-layout'
import { buildTimeline, timelineWindow } from '@/lib/pos-timeline'
import { assignTrayColors } from '@/lib/tray-colors'
import { TableStateLegend } from '@/components/ui/badge'

// Timeline POS với dữ liệu minh hoạ, đặt theo giờ hiện tại — không đọc/ghi database.
const MIN = 60_000
const AREAS = [{ id: 'a1', name: 'Trong nhà' }, { id: 'a2', name: 'Ngoài trời' }]
const TABLES: AreaPlacedTable[] = ['Bàn 1', 'Bàn 2', 'Bàn 3', 'Bàn 4', 'Bàn 5', 'Bàn 9', 'Bàn 10', 'Bàn 11'].map((name, i) => ({
  id: `t${i + 1}`, table_number: name, pos_x: i, pos_y: 0, x: i, y: 0, area_id: i < 4 ? 'a1' : 'a2',
}))

function phien(id: string, tableIds: string[], openedAgoMin: number, statuses: string[], unpaid: number, extra: Partial<OpenTableSession> = {}, now = 0): OpenTableSession {
  return {
    session_id: id, status: 'open', opened_at: new Date(now - openedAgoMin * MIN).toISOString(), opened_by: 'customer',
    table_number: tableIds.map((t) => TABLES.find((x) => x.id === t)!.table_number).join(', '),
    tables: tableIds.map((t) => ({ id: t, table_number: TABLES.find((x) => x.id === t)!.table_number })),
    order_count: statuses.length, unpaid_total: unpaid, total: unpaid, needs_review: false,
    orders: statuses.map((status, i) => ({ id: `${id}-o${i}`, status })), ...extra,
  } as unknown as OpenTableSession
}

function datBan(id: string, name: string, size: number, inMin: number, tableIds: string[], status = 'confirmed', now = 0): ReservationRow {
  return {
    reservationId: id, status, customerName: name, partySize: size, customerPhone: '0900000000',
    arrivalAt: new Date(now + inMin * MIN).toISOString(), planningHoldMinutes: 120, tableIds,
    tableNumbers: tableIds.map((t) => TABLES.find((x) => x.id === t)!.table_number), sessionId: null, note: null,
  } as unknown as ReservationRow
}

export default function PosTimelineDemo() {
  const now = useNow()
  const [selected, setSelected] = useState<string | null>(null)
  const [reservation, setReservation] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // Dữ liệu đặt theo giờ lúc MỞ trang rồi đứng yên — đồng hồ chạy tiếp thì thanh mới đổi màu đúng như POS thật.
  const [base, setBase] = useState<number | null>(null)
  if (base === null && now !== null) setBase(now)
  const data = useMemo(() => {
    if (now === null || base === null) return null
    const sessions = [
      phien('s1', ['t1'], 95, ['confirmed', 'confirmed'], 1_360_000, {}, base),
      phien('s2', ['t2'], 6, ['confirmed', 'pending', 'pending'], 455_000, {}, base),
      phien('s3', ['t3'], 400, ['confirmed'], 2_150_000, { needs_review: true }, base),
      phien('s9', ['t6', 't7'], 70, ['confirmed'], 2_515_000, {}, base),
      phien('s11', ['t8'], 5, [], 0, {}, base),
    ]
    const reservations = [
      datBan('r1', 'A. Nam', 6, 45, ['t4'], 'confirmed', base),
      datBan('r2', 'C. Thảo', 4, -25, ['t5'], 'confirmed', base),
      datBan('r3', 'A. Phong', 12, 10, ['t1'], 'confirmed', base),
      datBan('r4', 'Đoàn công ty', 20, 120, [], 'pending', base),
    ]
    const window = timelineWindow([], now)
    return { sessions, reservations, window, timeline: buildTimeline({ tableIds: TABLES.map((t) => t.id), sessions, reservations, now, window }) }
  }, [now, base])

  if (!data || now === null) return null
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <TableStateLegend />
      <div className="flex h-[460px] flex-col overflow-hidden rounded-lg border border-border">
        <TimelineView
          tables={TABLES}
          areas={AREAS}
          rows={data.timeline.rows}
          unassigned={data.timeline.unassigned}
          window={data.window}
          now={now}
          sessionsById={new Map(data.sessions.map((s) => [s.session_id, s]))}
          reservationsById={new Map(data.reservations.map((r) => [r.reservationId, r]))}
          trayColors={assignTrayColors(data.sessions)}
          selectedSessionId={selected}
          pickedSessionIds={picked}
          selectedReservationId={reservation}
          slotMinutes={30}
          holdMinutes={120}
          bookUntil={null}
          onPickSlot={() => undefined}
          onSelectSession={(id, additive) => {
            setReservation(null)
            if (!additive) { setSelected(id); setPicked(new Set()); return }
            setPicked((prev) => { const next = new Set(prev); if (next.size === 0 && selected && selected !== id) next.add(selected); if (next.has(id)) next.delete(id); else next.add(id); return next })
            setSelected(null)
          }}
          onSelectReservation={(id) => { setReservation(id); setSelected(null) }}
        />
      </div>
      <p className="text-[13px] text-muted">
        Bàn 1 đang phục vụ, khách đặt A. Phong tới sau 10 phút → xung đột · Bàn 2 có 2 đơn chờ duyệt · Bàn 3 quá hạn còn tiền ·
        Bàn 4 đặt trước · Bàn 5 khách trễ 25 phút · Bàn 9+10 là Mâm 1 · Bàn 11 mâm vừa mở chưa gọi món · đoàn công ty chưa xếp bàn.
      </p>
    </div>
  )
}
