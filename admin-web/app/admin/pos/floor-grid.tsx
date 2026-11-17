'use client'

// Lưới ô bàn dày cho tab "Sơ đồ" của POS (thay cho FloorMap ở chế độ xem; FloorMap vẫn dùng cho Sắp xếp bàn).
// Thuần trình bày: nội dung ô do cha tính (gridTileView), hành động bấm do cha quyết (gridTileAction).

import type { ReactNode } from 'react'
import { BellRing, Search } from 'lucide-react'
import { STATUS_TONE_CLASSES, TABLE_STATE } from '@/components/ui/status'
import { areaColorClasses } from '@/lib/area-colors'
import { GRID_STATUS_LABEL, type GridGroup, type GridStatus, type gridAreaCounts } from '@/lib/pos-floor-grid'
import type { GridTileView } from '@/lib/pos-grid-tile'
import type { TrayAssignment } from '@/lib/tray-colors'
import { cn } from '@/lib/utils'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const STATUS_ORDER: GridStatus[] = ['all', 'busy', 'free', 'pending', 'booked']

// Nút lọc cao ≥36px cho ngón tay.
const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors',
    active ? 'border-primary bg-primary text-white' : 'border-border-strong bg-surface text-foreground hover:bg-item-hover',
  )

export function FloorGridFilters({
  areaItems,
  areaFilter,
  onArea,
  counts,
  status,
  onStatus,
  query,
  onQuery,
  trailing,
}: {
  areaItems: ReturnType<typeof gridAreaCounts>
  areaFilter: string
  onArea: (v: string) => void
  counts: Record<GridStatus, number>
  status: GridStatus
  onStatus: (s: GridStatus) => void
  query: string
  onQuery: (q: string) => void
  trailing?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {areaItems.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo khu">
          {areaItems.map(a => (
            <button key={a.value} type="button" aria-pressed={areaFilter === a.value} onClick={() => onArea(a.value)} className={chip(areaFilter === a.value)}>
              {a.color && <span className={cn('size-2 rounded-full', areaColorClasses(a.color).dot)} aria-hidden />}
              <span>{a.label}</span>
              <span className="tabular opacity-80">{a.count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo trạng thái">
        {STATUS_ORDER.map(s => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => onStatus(s)} className={chip(status === s)}>
            <span>{GRID_STATUS_LABEL[s]}</span>
            <span className="tabular opacity-80">{counts[s]}</span>
          </button>
        ))}
      </div>
      <label className="relative ml-auto min-w-32 flex-1 sm:max-w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="Tìm bàn…"
          aria-label="Tìm bàn"
          className="min-h-9 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-8 text-sm"
        />
      </label>
      {trailing}
    </div>
  )
}

export default function FloorGrid({
  groups,
  tile,
  trayColor,
  selectedSessionId,
  pickedSessionIds,
  pickedTableIds,
  sessionIdOf,
  reservationMode,
  reservationTableIds,
  disabledReason,
  onTile,
  showGroupHeaders,
}: {
  groups: GridGroup[]
  tile: (tableId: string) => GridTileView
  /** Màu vạch mâm (tray.color.bar). Không truyền thì ô mâm chỉ có chữ "Mâm N". */
  trayColor?: (tableId: string) => TrayAssignment | undefined
  selectedSessionId: string | null
  pickedSessionIds: Set<string>
  pickedTableIds: Set<string>
  sessionIdOf: (tableId: string) => string | null
  reservationMode: boolean
  reservationTableIds: Set<string>
  disabledReason: (tableId: string) => string | null
  onTile: (tableId: string, modifier: boolean) => void
  showGroupHeaders: boolean
}) {
  if (groups.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Không có bàn nào khớp bộ lọc.</p>
  }
  return (
    <div className="space-y-4">
      {groups.map(g => {
        const color = g.color ? areaColorClasses(g.color) : null
        return (
          <section key={g.areaId ?? '__none__'}>
            {showGroupHeaders && (
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
                {color && <span className={cn('size-2.5 rounded-full', color.dot)} aria-hidden />}
                <span>{`${g.name} · ${g.tables.length} bàn`}</span>
              </h3>
            )}
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
              {g.tables.map(table => {
                const sessionId = sessionIdOf(table.id)
                return (
                  <GridTile
                    key={table.id}
                    tableId={table.id}
                    name={table.table_number}
                    view={tile(table.id)}
                    tray={trayColor?.(table.id)}
                    selected={selectedSessionId !== null && sessionId === selectedSessionId}
                    picked={pickedTableIds.has(table.id) || (sessionId !== null && pickedSessionIds.has(sessionId))}
                    reservationSelected={reservationMode && reservationTableIds.has(table.id)}
                    disabledReason={disabledReason(table.id)}
                    onClick={e => onTile(table.id, e.ctrlKey || e.metaKey)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function GridTile({
  tableId,
  name,
  view,
  tray,
  selected,
  picked,
  reservationSelected,
  disabledReason,
  onClick,
}: {
  tableId: string
  name: string
  view: GridTileView
  tray: TrayAssignment | undefined
  selected: boolean
  picked: boolean
  reservationSelected: boolean
  disabledReason: string | null
  onClick: (e: React.MouseEvent) => void
}) {
  const { label, tone } = TABLE_STATE[view.visual]
  const hasSession = view.money !== null
  const nen = view.visual === 'free' ? 'border-slate-200 bg-white' : STATUS_TONE_CLASSES[tone].badge
  // Ưu tiên viền: chọn bàn cho đặt bàn > chờ duyệt > bill đang mở > đang tick.
  const vien = reservationSelected
    ? 'ring-2 ring-info-dot'
    : view.pending > 0
      ? 'ring-2 ring-amber-500'
      : selected
        ? 'ring-2 ring-foreground'
        : picked
          ? 'ring-2 ring-primary'
          : ''
  const statusText = view.pending > 0
    ? `${label} · ${view.pending}`
    : !hasSession && view.heldAt
      ? `Đặt ${view.heldAt}`
      : label

  return (
    <button
      type="button"
      data-table-id={tableId}
      data-visual-state={view.visual}
      disabled={disabledReason !== null}
      aria-label={
        disabledReason
          ? `${name}: ${disabledReason}`
          : `${name}: ${statusText}${view.calling ? ', đang gọi nhân viên' : ''}`
      }
      title={disabledReason ?? name}
      onClick={onClick}
      className={cn(
        'relative flex h-[84px] w-full flex-col justify-between overflow-hidden rounded-xl border p-1.5 text-left transition-colors',
        nen,
        tray?.color.bar,
        vien,
        disabledReason ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:brightness-95',
      )}
    >
      {view.pending > 0 && (
        <span className="absolute top-1.5 right-1.5 flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
        </span>
      )}
      <span className="min-w-0">
        <span className={cn('block truncate text-[13px] leading-4 font-bold', hasSession ? 'text-slate-900' : 'text-slate-600')}>{name}</span>
        {hasSession ? (
          <span className="block truncate text-[12px] leading-4 font-bold text-slate-900 tabular">{dong(view.money ?? 0)}</span>
        ) : null}
      </span>
      <span className="min-w-0">
        {hasSession ? (
          <span className="flex items-center justify-between gap-1 text-[12px] leading-4 text-muted tabular">
            <span className="truncate">{view.seated}</span>
            {view.trayIndex !== null && (
              <span className={cn('truncate font-medium', tray ? tray.color.label : '')}>{`Mâm ${view.trayIndex}`}</span>
            )}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <span className={cn('inline-flex min-w-0 items-center rounded-md border px-1 text-[12px] leading-[18px] font-bold', STATUS_TONE_CLASSES[tone].solid)}>
            <span className="truncate">{statusText}</span>
          </span>
          {view.calling && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-500 px-1 text-[12px] leading-[18px] font-bold text-white">
              <BellRing className="size-3" aria-hidden />
              Gọi NV
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
