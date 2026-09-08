'use client'

import { useRef, useState } from 'react'
import { LAYOUT_COLS, type PlacedTable } from '@/lib/table-layout'
import { pendingCount, tableDot } from '@/lib/table-status'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { TrayAssignment } from '@/lib/tray-colors'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

export type TableState = {
  session: OpenTableSession
  tray: TrayAssignment | undefined
}

export default function FloorMap({
  placed,
  stateByTable,
  arrange,
  locked = false,
  selectedSessionId,
  pickedSessionIds,
  pickedTableIds,
  onPickTable,
  onSelectSession,
  onMove,
}: {
  placed: PlacedTable[]
  stateByTable: Map<string, TableState>
  arrange: boolean
  locked?: boolean
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  pickedTableIds: Set<string>
  onPickTable: (tableId: string) => void
  /** additive = ctrl/cmd+click: tick thêm mâm để gộp bill thay vì mở bill một mâm */
  onSelectSession: (sessionId: string, additive: boolean) => void
  onMove: (tableId: string, x: number, y: number) => void
}) {
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null)
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  const rows = Math.min(200, Math.max(1, ...placed.map((t) => t.y + 1)) + (arrange ? 1 : 0))
  const byCell = new Map(placed.map((t) => [`${t.x},${t.y}`, t]))

  const cells: { x: number; y: number; table: PlacedTable | undefined }[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < LAYOUT_COLS; x++) {
      cells.push({ x, y, table: byCell.get(`${x},${y}`) })
    }
  }

  return (
    <div
      className="grid min-w-[960px] gap-3"
      style={{ gridTemplateColumns: `repeat(${LAYOUT_COLS}, minmax(0, 1fr))` }}
      onPointerDown={e => {
        if (!arrange || locked || !e.isPrimary || e.button !== 0) return
        const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-table-id]')
        if (!tile) return
        drag.current = { id: tile.dataset.tableId!, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
        tile.focus()
        e.preventDefault()
      }}
      onPointerMove={e => {
        if (!drag.current || drag.current.pointerId !== e.pointerId) return
        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-floor-cell]')
        setHoverCell(cell && e.currentTarget.contains(cell) ? cell.dataset.floorCell! : null)
      }}
      onPointerUp={e => {
        const source = drag.current
        if (!source || source.pointerId !== e.pointerId) return
        drag.current = null
        setHoverCell(null)
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        if (!arrange || locked || Math.hypot(e.clientX - source.x, e.clientY - source.y) < 5) return
        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-floor-cell]')
        if (!cell || !e.currentTarget.contains(cell)) return
        const [x, y] = cell.dataset.floorCell!.split(',').map(Number)
        onMove(source.id, x, y)
      }}
      onPointerCancel={() => { drag.current = null; setHoverCell(null) }}
      onLostPointerCapture={() => { drag.current = null; setHoverCell(null) }}
      onKeyDown={e => {
        if (!arrange || locked) return
        const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]
        const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-table-id]')
        const table = placed.find(t => t.id === tile?.dataset.tableId)
        if (!delta || !table) return
        e.preventDefault()
        onMove(table.id, table.x + delta[0], table.y + delta[1])
        // Bàn đổi ô khiến React tạo lại nút; khôi phục focus để bấm mũi tên liên tiếp.
        const grid = e.currentTarget
        requestAnimationFrame(() => grid.querySelector<HTMLElement>(`[data-table-id="${table.id}"]`)?.focus())
      }}
    >
      {cells.map(({ x, y, table }) => (
        <div
          key={`${x}-${y}`}
          data-floor-cell={`${x},${y}`}
          style={hoverCell === `${x},${y}` ? { outline: '2px solid #f97316', borderRadius: 12 } : undefined}
          className={
            arrange && !table
              ? 'min-h-24 rounded-xl border border-dashed border-gray-200'
              : 'min-h-24'
          }
        >
          {table && (
            <Tile
              table={table}
              state={stateByTable.get(table.id)}
              arrange={arrange}
              selected={
                selectedSessionId !== null &&
                stateByTable.get(table.id)?.session.session_id === selectedSessionId
              }
              picked={
                pickedTableIds.has(table.id) ||
                (!!stateByTable.get(table.id) &&
                  pickedSessionIds.has(stateByTable.get(table.id)!.session.session_id))
              }
              onClick={(e) => {
                if (arrange || locked) return
                const st = stateByTable.get(table.id)
                if (st) onSelectSession(st.session.session_id, e.ctrlKey || e.metaKey)
                else onPickTable(table.id)
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function Tile({
  table,
  state,
  arrange,
  selected,
  picked,
  onClick,
}: {
  table: PlacedTable
  state: TableState | undefined
  arrange: boolean
  selected: boolean
  picked: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const s = state?.session
  const tray = state?.tray
  const dot = tableDot(s)
  const cho = pendingCount(s)

  // Màu nền: mâm dùng bảng màu chung với màn nhân viên; bàn lẻ có khách = cam; trống = xám.
  const base = !s
    ? 'border-gray-200 bg-white text-gray-400'
    : tray
      ? `${tray.color.box} text-gray-800`
      : 'border-orange-200 bg-orange-50 text-gray-800'

  // Đơn chưa xác nhận thắng mọi viền khác: đó là việc thu ngân phải làm NGAY.
  const vien = cho > 0
    ? 'ring-4 ring-amber-500 animate-pulse'
    : selected
      ? 'ring-2 ring-gray-900'
      : picked
        ? 'ring-2 ring-orange-400'
        : s?.needs_review
          ? 'ring-2 ring-amber-400'
          : ''

  return (
    <button
      type="button"
      data-table-id={table.id}
      style={arrange ? { touchAction: 'none', userSelect: 'none' } : undefined}
      aria-label={arrange ? `${table.table_number}, cột ${table.x + 1}, hàng ${table.y + 1}. Dùng phím mũi tên để di chuyển.` : table.table_number}
      onClick={onClick}
      className={`relative flex h-24 w-full flex-col items-center justify-center rounded-xl border p-1 text-center transition-colors ${base} ${vien} ${
        arrange ? 'cursor-move' : 'cursor-pointer hover:brightness-95'
      }`}
    >
      {/* Chấm trạng thái: đỏ = đang có khách ngồi ăn, xanh = trống (kể cả mâm chưa gọi món) */}
      <span
        className={`absolute right-1.5 top-1.5 h-3 w-3 rounded-full ${
          dot === 'busy' ? 'bg-red-500' : 'bg-green-500'
        }`}
        title={dot === 'busy' ? 'Đang có khách, chưa thu tiền' : 'Bàn trống'}
      />
      {s?.needs_review && <span className="absolute left-1.5 top-1.5 text-xs">⏰</span>}
      <span className="w-full truncate text-sm font-bold">{table.table_number}</span>
      {s ? (
        <>
          <span className="text-xs font-semibold">{dong(s.total)}</span>
          <span className="text-[10px] text-gray-500">
            {tray ? `Mâm ${tray.index}` : `${s.order_count} đơn`}
          </span>
        </>
      ) : (
        <span className="text-[10px]">trống</span>
      )}
      {cho > 0 && (
        <span className="absolute inset-x-1 bottom-1 rounded bg-amber-500 px-1 py-0.5 text-[10px] font-bold text-white">
          {cho} đơn chờ xác nhận
        </span>
      )}
    </button>
  )
}
