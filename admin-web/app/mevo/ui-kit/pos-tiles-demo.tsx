'use client'

import { useMemo, useState } from 'react'
import FloorMap, { type TableState } from '@/app/admin/cashier/floor-map'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { PlacedTable } from '@/lib/table-layout'
import { TRAY_COLORS } from '@/lib/tray-colors'
import { TableStateLegend } from '@/components/ui/badge'

// Dữ liệu minh hoạ cho trang xem thử — không đọc/ghi database. Ép kiểu vì ô bàn chỉ đọc vài field.
function phien(id: string, statuses: string[], total: number, extra: Partial<OpenTableSession> = {}): OpenTableSession {
  return {
    session_id: id,
    status: 'open',
    total,
    order_count: statuses.length,
    needs_review: false,
    orders: statuses.map((status, index) => ({ id: `${id}-o${index}`, status })),
    ...extra,
  } as unknown as OpenTableSession
}

const TABLES: PlacedTable[] = [
  { id: 't1', table_number: 'Bàn 1', pos_x: 0, pos_y: 0, x: 0, y: 0 },
  { id: 't2', table_number: 'Bàn 2', pos_x: 1, pos_y: 0, x: 1, y: 0 },
  { id: 't3', table_number: 'Bàn 3', pos_x: 2, pos_y: 0, x: 2, y: 0 },
  { id: 't4', table_number: 'Bàn 4', pos_x: 3, pos_y: 0, x: 3, y: 0 },
  { id: 't5', table_number: 'Bàn 5 VIP sân vườn', pos_x: 4, pos_y: 0, x: 4, y: 0 },
  { id: 't9', table_number: 'Bàn 9', pos_x: 0, pos_y: 1, x: 0, y: 1 },
  { id: 't10', table_number: 'Bàn 10', pos_x: 1, pos_y: 1, x: 1, y: 1 },
  { id: 't11', table_number: 'Bàn 11', pos_x: 2, pos_y: 1, x: 2, y: 1 },
]

export default function PosTilesDemo() {
  const [selected, setSelected] = useState<string | null>(null)
  const stateByTable = useMemo(() => {
    const map = new Map<string, TableState>()
    map.set('t1', { session: phien('s1', ['confirmed', 'confirmed'], 1360000), tray: undefined })
    map.set('t2', { session: phien('s2', ['confirmed', 'pending', 'pending'], 455000), tray: undefined })
    map.set('t3', { session: phien('s3', ['confirmed'], 2150000, { needs_review: true }), tray: undefined })
    const tray = phien('s9', ['confirmed'], 12360000)
    map.set('t9', { session: tray, tray: { color: TRAY_COLORS[0], index: 1 } })
    map.set('t10', { session: tray, tray: { color: TRAY_COLORS[0], index: 1 } })
    map.set('t11', { session: phien('s11', [], 0), tray: { color: TRAY_COLORS[1], index: 2 } })
    return map
  }, [])

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <TableStateLegend />
      <FloorMap
        placed={TABLES}
        stateByTable={stateByTable}
        arrange={false}
        selectedSessionId={selected}
        pickedSessionIds={new Set()}
        pickedTableIds={new Set()}
        prearrivalReservedTableIds={new Set(['t4'])}
        onPickTable={() => undefined}
        onSelectSession={(id) => setSelected(id)}
        onMove={() => undefined}
      />
      <p className="text-[13px] text-muted">
        Bàn 1 đang phục vụ · Bàn 2 có 2 đơn chờ duyệt (nhấp nháy, nhãn &quot;Chờ duyệt · 2&quot;) · Bàn 3 quá hạn còn tiền chưa thu · Bàn 4 giữ cho khách đặt trước ·
        Bàn 5 trống (tên dài) · Bàn 9 + 10 là Mâm 1 · Bàn 11 là Mâm 2 vừa ghép chưa gọi món. Bấm bàn có khách để thấy viền đang chọn.
      </p>
    </div>
  )
}
