import type { FloorSnapshot } from '@/lib/area-layout'
import type { OpenTableSession } from '@/lib/actions/table-session'

export type ReservationTableChoice = {
  id: string
  tableNumber: string
  selected: boolean
  disabled: boolean
  reason: string | null
}

export type ReservationTableGroup = {
  id: string | null
  name: string
  tables: ReservationTableChoice[]
}

export type ReservationTableHoldCandidate = {
  reservationId: string
  status: string
  arrivalAt: string
  planningHoldMinutes: number
  tableIds: string[]
}

/** Chỉ khóa bàn khi khoảng giữ theo snapshot của hai booking thực sự chồng nhau. */
export function heldTableIdsForReservationWindow(
  reservations: ReservationTableHoldCandidate[],
  reservationId: string,
  arrivalAt: string,
  planningHoldMinutes: number,
): Set<string> {
  const targetStartsAt = new Date(arrivalAt).getTime()
  const targetEndsAt = targetStartsAt + planningHoldMinutes * 60_000
  if (!Number.isFinite(targetStartsAt) || !Number.isFinite(targetEndsAt) || planningHoldMinutes <= 0) return new Set()

  return new Set(reservations
    .filter((reservation) => {
      if (reservation.reservationId === reservationId || reservation.status !== 'confirmed') return false
      const startsAt = new Date(reservation.arrivalAt).getTime()
      const endsAt = startsAt + reservation.planningHoldMinutes * 60_000
      return Number.isFinite(startsAt)
        && Number.isFinite(endsAt)
        && reservation.planningHoldMinutes > 0
        && startsAt < targetEndsAt
        && endsAt > targetStartsAt
    })
    .flatMap((reservation) => reservation.tableIds))
}

export function buildReservationTableGroups({
  floor,
  sessions,
  selectedTableIds,
  currentReservationTableIds,
  otherReservationTableIds,
}: {
  floor: FloorSnapshot
  sessions: OpenTableSession[]
  selectedTableIds: Set<string>
  currentReservationTableIds: Set<string>
  otherReservationTableIds: Set<string>
}): ReservationTableGroup[] {
  const sessionTableIds = new Set(sessions.filter((session) => session.status === 'open')
    .flatMap((session) => session.tables.map((table) => table.id)))
  const orderedAreaIds = [...floor.areas.map((area) => area.id), null]

  return orderedAreaIds.map((areaId) => {
    const area = areaId === null ? null : floor.areas.find((item) => item.id === areaId)
    const tables = floor.tables
      .filter((table) => table.area_id === areaId)
      .sort((left, right) => {
        const top = (left.pos_y ?? Number.MAX_SAFE_INTEGER) - (right.pos_y ?? Number.MAX_SAFE_INTEGER)
        if (top !== 0) return top
        const leftPosition = left.pos_x ?? Number.MAX_SAFE_INTEGER
        const rightPosition = right.pos_x ?? Number.MAX_SAFE_INTEGER
        if (leftPosition !== rightPosition) return leftPosition - rightPosition
        return left.table_number.localeCompare(right.table_number, 'vi', { numeric: true, sensitivity: 'base' })
      })
      .map((table) => {
        const isCurrent = currentReservationTableIds.has(table.id)
        const inSession = sessionTableIds.has(table.id)
        const reservedElsewhere = otherReservationTableIds.has(table.id) && !isCurrent
        return {
          id: table.id,
          tableNumber: table.table_number,
          selected: selectedTableIds.has(table.id),
          disabled: inSession || reservedElsewhere,
          reason: inSession ? 'Đang có khách' : reservedElsewhere ? 'Đã giữ cho booking khác' : null,
        }
      })
    return { id: areaId, name: area?.name ?? 'Chưa phân khu', tables }
  }).filter((group) => group.tables.length > 0)
}

export function reservationSelectionHint(selectedTableIds: Set<string>, suggestedTableCount: number): string {
  return `Đã chọn ${selectedTableIds.size} bàn · gợi ý ${suggestedTableCount} bàn`
}

export default function ReservationTablePicker({
  floor,
  sessions,
  selectedTableIds,
  currentReservationTableIds,
  otherReservationTableIds,
  suggestedTableCount,
  onToggle,
}: {
  floor: FloorSnapshot
  sessions: OpenTableSession[]
  selectedTableIds: Set<string>
  currentReservationTableIds: Set<string>
  otherReservationTableIds: Set<string>
  suggestedTableCount: number
  onToggle: (tableId: string) => void
}) {
  const groups = buildReservationTableGroups({
    floor, sessions, selectedTableIds, currentReservationTableIds, otherReservationTableIds,
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{reservationSelectionHint(selectedTableIds, suggestedTableCount)}</p>
      {groups.map((group) => (
        <section key={group.id ?? 'unassigned'}>
          <h3 className="mb-2 text-sm font-bold text-gray-800">{group.name}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.tables.map((table) => (
              <button
                key={table.id}
                type="button"
                disabled={table.disabled}
                onClick={() => onToggle(table.id)}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  table.selected
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : table.disabled
                      ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                      : 'border-gray-300 bg-white text-gray-800 hover:border-orange-400'
                }`}
              >
                <span className="block">{table.tableNumber}</span>
                {table.reason && <span className="block text-[11px] font-normal">{table.reason}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
