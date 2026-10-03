'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { LAYOUT_COLS, type PlacedTable } from '@/lib/table-layout'
import { pendingCount, tableVisualState } from '@/lib/table-status'
import { STATUS_TONE_CLASSES, TABLE_STATE } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { TrayAssignment } from '@/lib/tray-colors'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

export type TableState = {
  session: OpenTableSession
  tray: TrayAssignment | undefined
}

const PHONE_QUERY = '(max-width: 767px)'
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
/** Server render coi như desktop; trình duyệt đọc matchMedia thật ngay lần vẽ đầu. */
function useIsPhone() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}

export default function FloorMap({
  placed,
  stateByTable,
  arrange,
  locked = false,
  mode = 'normal',
  reservationTableIds = new Set<string>(),
  reservationBlockedTableIds = new Set<string>(),
  prearrivalReservedTableIds = new Set<string>(),
  selectedSessionId,
  pickedSessionIds,
  pickedTableIds,
  onPickTable,
  onReservationPick,
  onSelectSession,
  onMove,
}: {
  placed: PlacedTable[]
  stateByTable: Map<string, TableState>
  arrange: boolean
  locked?: boolean
  /** Chế độ chọn bàn cho booking: tách hẳn khỏi chọn/gộp bill đang mở. */
  mode?: 'normal' | 'reservation'
  reservationTableIds?: Set<string>
  reservationBlockedTableIds?: Set<string>
  /** Bàn đã ưu tiên cho booking trong 60 phút trước giờ đến. */
  prearrivalReservedTableIds?: Set<string>
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  pickedTableIds: Set<string>
  onPickTable: (tableId: string) => void
  onReservationPick?: (tableId: string) => void
  /** additive = ctrl/cmd+click: tick thêm mâm để gộp bill thay vì mở bill một mâm */
  onSelectSession: (sessionId: string, additive: boolean) => void
  onMove: (tableId: string, x: number, y: number) => void
}) {
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null)
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  const rows = Math.min(200, Math.max(1, ...placed.map((t) => t.y + 1)) + (arrange ? 1 : 0))
  const byCell = new Map(placed.map((t) => [`${t.x},${t.y}`, t]))

  // Điện thoại (không sắp xếp): bỏ toạ độ, xếp bàn thành lưới 3 cột theo thứ tự hàng → cột,
  // để không phải cuộn ngang mới thấy bàn. Sắp xếp bàn thì luôn hiện lưới toạ độ thật.
  const isPhone = useIsPhone()
  const compact = isPhone && !arrange
  // Ngoài lúc sắp xếp chỉ vẽ tới cột cuối cùng có bàn: lưới 12 cột cho khu chỉ dùng 7 cột thì
  // ô bàn bị bóp tới mức chữ trạng thái bị cắt. Lúc sắp xếp vẫn đủ 12 cột để kéo bàn đi khắp nơi.
  const cols = arrange ? LAYOUT_COLS : Math.min(LAYOUT_COLS, Math.max(1, ...placed.map((t) => t.x + 1)))

  const cells: { x: number; y: number; table: PlacedTable | undefined }[] = []
  if (compact) {
    for (const t of [...placed].sort((a, b) => a.y - b.y || a.x - b.x)) cells.push({ x: t.x, y: t.y, table: t })
  } else {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        cells.push({ x, y, table: byCell.get(`${x},${y}`) })
      }
    }
  }

  return (
    <div
      className={compact ? 'grid grid-cols-3 gap-2' : 'grid w-full gap-2'}
      style={compact ? undefined : {
        gridTemplateColumns: arrange ? `repeat(${LAYOUT_COLS}, minmax(88px, 1fr))` : `repeat(${cols}, minmax(88px, 160px))`,
      }}
      onPointerDown={e => {
        if (!arrange || mode === 'reservation' || locked || !e.isPrimary || e.button !== 0) return
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
        if (!arrange || mode === 'reservation' || locked || Math.hypot(e.clientX - source.x, e.clientY - source.y) < 5) return
        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-floor-cell]')
        if (!cell || !e.currentTarget.contains(cell)) return
        const [x, y] = cell.dataset.floorCell!.split(',').map(Number)
        onMove(source.id, x, y)
      }}
      onPointerCancel={() => { drag.current = null; setHoverCell(null) }}
      onLostPointerCapture={() => { drag.current = null; setHoverCell(null) }}
      onKeyDown={e => {
        if (!arrange || mode === 'reservation' || locked) return
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
          style={hoverCell === `${x},${y}` ? { outline: '2px solid var(--primary)', borderRadius: 12 } : undefined}
          className={
            arrange && !table
              ? 'min-h-28 rounded-xl border border-dashed border-border-strong'
              : 'min-h-28'
          }
        >
          {table && (
            <Tile
              table={table}
              state={stateByTable.get(table.id)}
              arrange={arrange}
              reservationMode={mode === 'reservation'}
              reservationSelected={reservationTableIds.has(table.id)}
              prearrivalReserved={prearrivalReservedTableIds.has(table.id)}
              disabledReason={
                mode === 'reservation'
                  ? stateByTable.has(table.id)
                    ? 'Bàn đang có khách'
                    : reservationBlockedTableIds.has(table.id)
                      ? 'Đã giữ cho booking khác'
                      : null
                  : !stateByTable.has(table.id) && prearrivalReservedTableIds.has(table.id)
                    ? 'Đã giữ cho khách sắp đến'
                  : null
              }
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
                if (mode === 'reservation') {
                  if (stateByTable.has(table.id) || reservationBlockedTableIds.has(table.id)) return
                  onReservationPick?.(table.id)
                  return
                }
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
  reservationMode,
  reservationSelected,
  prearrivalReserved,
  disabledReason,
  selected,
  picked,
  onClick,
}: {
  table: PlacedTable
  state: TableState | undefined
  arrange: boolean
  reservationMode: boolean
  reservationSelected: boolean
  prearrivalReserved: boolean
  disabledReason: string | null
  selected: boolean
  picked: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const s = state?.session
  const tray = state?.tray
  const cho = pendingCount(s)
  // Một nguồn màu + nhãn cho cả POS và màn nhân viên (lib/table-status.ts, chốt 2026-10-02).
  const visual = tableVisualState(s, { prearrivalReserved })
  const { label, tone } = TABLE_STATE[visual]

  // Pha 4 (theo Stitch): ô tô nền nhạt theo trạng thái + nhãn trạng thái tô đặc; bàn trống giữ nền trắng.
  const nen = visual === 'free' ? 'border-slate-200 bg-white' : STATUS_TONE_CLASSES[tone].badge

  // Thứ tự ưu tiên viền: đang chọn bàn cho booking > đơn chờ xác nhận > đang mở bill > đang tick.
  const vien = reservationMode && reservationSelected
    ? 'ring-2 ring-info-dot'
    : cho > 0
      ? 'ring-2 ring-amber-500'
      : selected
        ? 'ring-2 ring-foreground'
        : picked
          ? 'ring-2 ring-primary'
          : ''

  // Đang chờ duyệt thì nhãn trạng thái đã mang số đơn — bỏ dòng "N đơn" để ô hẹp vẫn đủ chỗ cho chữ.
  const phu = s ? (tray ? `Mâm ${tray.index}` : cho > 0 ? null : `${s.order_count} đơn`) : null

  return (
    <button
      type="button"
      data-table-id={table.id}
      data-visual-state={visual}
      disabled={disabledReason !== null}
      style={arrange ? { touchAction: 'none', userSelect: 'none' } : undefined}
      aria-label={
        disabledReason
          ? `${table.table_number}: ${disabledReason}`
          : arrange
            ? `${table.table_number}, cột ${table.x + 1}, hàng ${table.y + 1}. Dùng phím mũi tên để di chuyển.`
            : `${table.table_number}: ${label}${cho > 0 ? `, ${cho} đơn` : ""}`
      }
      title={disabledReason ?? table.table_number}
      onClick={onClick}
      className={cn(
        'relative flex h-28 w-full flex-col justify-between overflow-hidden rounded-xl border p-2 text-left transition-colors md:p-2.5',
        nen,
        tray?.color.bar,
        vien,
        disabledReason ? 'cursor-not-allowed opacity-50' : arrange ? 'cursor-move' : 'cursor-pointer hover:brightness-95',
      )}
    >
      {/* Chờ duyệt: chấm nháy ở góc thay vì nháy cả ô (ô nháy thì nhạt màu, khó đọc chữ). */}
      {cho > 0 && (
        <span className="absolute top-2 right-2 flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
        </span>
      )}
      <span className="min-w-0">
        <span className={cn('block truncate text-sm font-bold', s ? 'text-slate-900' : 'text-slate-600')}>{table.table_number}</span>
        {s ? <span className="block text-[13px] font-bold text-slate-900 tabular">{dong(s.total)}</span> : null}
      </span>
      <span className="min-w-0">
        {phu ? (
          <span className={cn('block truncate text-[13px]', tray ? `font-medium ${tray.color.label}` : 'text-muted')}>{phu}</span>
        ) : null}
        <span className={cn('inline-flex max-w-full items-center rounded-md border px-1.5 text-[12px] leading-5 font-bold', STATUS_TONE_CLASSES[tone].solid)}>
          <span className="truncate">{cho > 0 ? `${label} · ${cho}` : label}</span>
        </span>
      </span>
    </button>
  )
}
