'use client'

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
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  pickedTableIds: Set<string>
  onPickTable: (tableId: string) => void
  /** additive = ctrl/cmd+click: tick thêm mâm để gộp bill thay vì mở bill một mâm */
  onSelectSession: (sessionId: string, additive: boolean) => void
  onMove: (tableId: string, x: number, y: number) => void
}) {
  const rows = Math.max(1, ...placed.map((t) => t.y + 1)) + (arrange ? 1 : 0)
  const byCell = new Map(placed.map((t) => [`${t.x},${t.y}`, t]))

  const cells: { x: number; y: number; table: PlacedTable | undefined }[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < LAYOUT_COLS; x++) {
      cells.push({ x, y, table: byCell.get(`${x},${y}`) })
    }
  }

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${LAYOUT_COLS}, minmax(0, 1fr))` }}
    >
      {cells.map(({ x, y, table }) => (
        <div
          key={`${x}-${y}`}
          onDragOver={arrange ? (e) => e.preventDefault() : undefined}
          onDrop={
            arrange
              ? (e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) onMove(id, x, y)
                }
              : undefined
          }
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
                if (arrange) return
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
      draggable={arrange}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', table.id)}
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
