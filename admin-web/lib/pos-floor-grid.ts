// Logic thuần cho lưới bàn dày của tab "Sơ đồ" trên POS: xếp nhóm theo khu, lọc, đếm, nhãn giờ ngồi.
// Không đọc đồng hồ, không gọi server — `now` luôn được truyền vào để test được.

import type { AreaPlacedTable, TableArea } from '@/lib/area-layout'
import type { OpenTableSession } from '@/lib/actions/table-session'
import type { ReservationRow } from '@/lib/actions/reservations'
import { clock } from '@/lib/pos-timeline'
import { pendingCount } from '@/lib/table-status'

export type GridStatus = 'all' | 'busy' | 'free' | 'pending' | 'booked'

export const GRID_STATUS_LABEL: Record<GridStatus, string> = {
  all: 'Tất cả',
  busy: 'Có khách',
  free: 'Trống',
  pending: 'Chờ duyệt',
  booked: 'Sắp có khách đặt',
}

// Cùng giá trị NO_AREA / ALL trong pos-client.tsx.
export const NO_AREA_ID = '__none__'
export const ALL_AREAS = '__all__'

const MIN = 60_000

/**
 * Bàn đang giữ cho khách đặt: đặt bàn đã xác nhận, chưa có phiên, và now nằm trong
 * [đến − 60', đến + planningHoldMinutes). Khớp `prearrivalReservedTableIds` ở pos-client.tsx.
 * Một bàn có nhiều đặt bàn thì lấy đặt bàn đến sớm nhất.
 */
export function heldReservationByTable(reservations: ReservationRow[], now: number): Map<string, ReservationRow> {
  const out = new Map<string, ReservationRow>()
  for (const r of reservations) {
    if (r.status !== 'confirmed' || r.sessionId !== null) continue
    const arrival = new Date(r.arrivalAt).getTime()
    if (!(arrival - 60 * MIN <= now && arrival + r.planningHoldMinutes * MIN > now)) continue
    for (const tableId of r.tableIds) {
      const cur = out.get(tableId)
      if (!cur || arrival < new Date(cur.arrivalAt).getTime()) out.set(tableId, r)
    }
  }
  return out
}

export type GridContext = {
  sessionByTable: Map<string, OpenTableSession>
  heldByTable: Map<string, ReservationRow>
}

export function matchesGridStatus(tableId: string, status: GridStatus, ctx: GridContext): boolean {
  const session = ctx.sessionByTable.get(tableId)
  switch (status) {
    case 'all': return true
    case 'busy': return !!session
    case 'free': return !session
    case 'pending': return pendingCount(session) > 0
    case 'booked': return !session && ctx.heldByTable.has(tableId)
  }
}

/** Bỏ dấu, đ→d, thường hoá, gộp khoảng trắng — để "ban a2" khớp "Bàn A2". */
export function normalizeTableSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // dấu thanh / dấu mũ tách ra sau NFD
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export type GridGroup = { areaId: string | null; name: string; color: string | null; tables: AreaPlacedTable[] }

const byYThenX = (a: AreaPlacedTable, b: AreaPlacedTable) => a.y - b.y || a.x - b.x

/**
 * MỘT định nghĩa "Chưa phân khu" cho nhóm, lọc và đếm: chưa gán khu HOẶC trỏ tới khu không còn trong `areas`
 * (khu đã xoá). knownAreaIds = id các khu hiện có.
 */
const isLoose = (t: AreaPlacedTable, knownAreaIds: ReadonlySet<string>) => !t.area_id || !knownAreaIds.has(t.area_id)

/** Bàn có thuộc lựa chọn khu không — dùng chung cho lưới Sơ đồ và ô chọn khu của Timeline / Danh sách. */
export function tableInAreaFilter(t: AreaPlacedTable, areaFilter: string, knownAreaIds: ReadonlySet<string>): boolean {
  return areaFilter === ALL_AREAS ? true : areaFilter === NO_AREA_ID ? isLoose(t, knownAreaIds) : t.area_id === areaFilter
}

export function buildGridGroups(input: {
  tables: AreaPlacedTable[]
  areas: TableArea[]
  areaFilter: string
  status: GridStatus
  query: string
  ctx: GridContext
}): GridGroup[] {
  const q = normalizeTableSearch(input.query)
  const known = new Set(input.areas.map(a => a.id))
  const visible = input.tables.filter(t =>
    tableInAreaFilter(t, input.areaFilter, known)
    && matchesGridStatus(t.id, input.status, input.ctx)
    && (q === '' || normalizeTableSearch(t.table_number).includes(q)),
  )
  const groups: GridGroup[] = input.areas.map(a => ({
    areaId: a.id, name: a.name, color: a.color ?? null,
    tables: visible.filter(t => t.area_id === a.id).sort(byYThenX),
  }))
  // Bàn chưa phân khu (hoặc trỏ tới khu đã xoá) luôn xuống nhóm cuối.
  groups.push({
    areaId: null, name: 'Chưa phân khu', color: null,
    tables: visible.filter(t => isLoose(t, known)).sort(byYThenX),
  })
  return groups.filter(g => g.tables.length > 0)
}

/**
 * Lựa chọn lọc khu: "Tất cả khu", từng khu theo thứ tự `areas`, rồi "Chưa phân khu" CUỐI (cùng thứ tự lưới).
 * "Chưa phân khu" chỉ hiện khi có cả khu lẫn bàn chưa phân khu (giống areaItems cũ).
 */
export function gridAreaCounts(
  tables: AreaPlacedTable[],
  areas: TableArea[],
): { value: string; label: string; color: string | null; count: number }[] {
  const known = new Set(areas.map(a => a.id))
  const loose = tables.filter(t => isLoose(t, known)).length
  return [
    { value: ALL_AREAS, label: 'Tất cả khu', color: null, count: tables.length },
    ...areas.map(a => ({ value: a.id, label: a.name, color: a.color ?? null, count: tables.filter(t => t.area_id === a.id).length })),
    ...(loose > 0 && areas.length > 0 ? [{ value: NO_AREA_ID, label: 'Chưa phân khu', color: null, count: loose }] : []),
  ]
}

/** Đếm theo khu đang lọc, KHÔNG theo ô tìm kiếm. */
export function gridStatusCounts(
  tables: AreaPlacedTable[],
  areas: TableArea[],
  areaFilter: string,
  ctx: GridContext,
): Record<GridStatus, number> {
  const known = new Set(areas.map(a => a.id))
  const scoped = tables.filter(t => tableInAreaFilter(t, areaFilter, known))
  const count = (s: GridStatus) => scoped.filter(t => matchesGridStatus(t.id, s, ctx)).length
  return { all: count('all'), busy: count('busy'), free: count('free'), pending: count('pending'), booked: count('booked') }
}

/** Thời gian ngồi: 0'..59' rồi 1g12. Lệch đồng hồ (opened_at > now) thì 0', không ra số âm. */
export function seatedLabel(openedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / MIN))
  if (minutes < 60) return `${minutes}'`
  return `${Math.floor(minutes / 60)}g${String(minutes % 60).padStart(2, '0')}`
}

/** "19:30" theo giờ Việt Nam. */
export function clockHHmm(iso: string): string {
  return clock(new Date(iso).getTime())
}

/**
 * Bàn trống đang chọn CÒN hiệu lực: vẫn còn trong danh sách bàn trống (chưa có phiên, chưa bị xoá) và không bị
 * giữ cho khách đặt. Bàn vừa có khách qua QR / vừa vào khung giữ thì rơi khỏi lựa chọn — không được gửi đi ghép mâm,
 * không làm bảng bàn trống hiện lại bất ngờ khi phiên đóng.
 */
export function effectivePickedTables(
  picked: ReadonlySet<string>,
  freeTableIds: ReadonlySet<string>,
  heldTableIds: { has(id: string): boolean },
): Set<string> {
  return new Set([...picked].filter(id => freeTableIds.has(id) && !heldTableIds.has(id)))
}
