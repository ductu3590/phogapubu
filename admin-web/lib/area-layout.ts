import { layoutTables, moveTable, type LayoutTable, type PlacedTable } from './table-layout'

export type TableArea = { id: string; name: string; color?: string }
export type AreaTable = LayoutTable & { area_id: string | null }
export type AreaPlacedTable = PlacedTable & { area_id: string | null }
export type FloorSnapshot = { version: number; areas: TableArea[]; tables: AreaTable[] }
export type FloorDraft = { version: number; areas: TableArea[]; tables: AreaPlacedTable[] }

export function layoutByArea(tables: AreaTable[]): AreaPlacedTable[] {
  return [...new Set(tables.map(t => t.area_id))].flatMap(areaId =>
    layoutTables(tables.filter(t => t.area_id === areaId)).map(t => ({ ...t, area_id: areaId })),
  )
}

export function moveInArea(tables: AreaPlacedTable[], id: string, x: number, y: number): AreaPlacedTable[] {
  const table = tables.find(t => t.id === id)
  if (!table) return tables
  const moved = moveTable(tables.filter(t => t.area_id === table.area_id), id, x, y)
  return tables.map(t => {
    const next = moved.find(p => p.id === t.id)
    return next ? { ...next, area_id: t.area_id } : t
  })
}

export function transferToArea(tables: AreaPlacedTable[], id: string, areaId: string | null): AreaPlacedTable[] {
  const table = tables.find(t => t.id === id)
  if (!table || table.area_id === areaId) return tables
  // Giữ chỗ mọi bàn ở khu đích, rồi tìm ô trống đầu tiên cho bàn chuyển đến.
  const destination = layoutTables([
    ...tables.filter(t => t.area_id === areaId).map(t => ({ ...t, pos_x: t.x, pos_y: t.y })),
    { ...table, pos_x: null, pos_y: null },
  ]).find(t => t.id === id)!
  return tables.map(t => t.id === id ? { ...destination, area_id: areaId } : t)
}

/** Tab khu trên sơ đồ POS (2026-10-08, anh Tú: bỏ tab "Chưa phân khu"). Tab đó CHỈ hiện khi còn bàn
 *  chưa có khu — ẩn hẳn thì những bàn ấy không còn chỗ nào hiện trên sơ đồ. */
export function areaTabs(areas: TableArea[], tables: Array<{ area_id: string | null }>): Array<TableArea | { id: null; name: string; color?: undefined }> {
  const hasLoose = tables.some(t => !t.area_id)
  return [...(hasLoose ? [{ id: null, name: 'Chưa phân khu' } as const] : []), ...areas]
}

/** Khu đang chọn còn hợp lệ không; không thì về "Chưa phân khu" (nếu còn bàn chưa có khu) hoặc khu đầu tiên. */
export function pickAreaId(current: string | null, snapshot: { areas: TableArea[]; tables: Array<{ area_id: string | null }> }): string | null {
  const hasLoose = snapshot.tables.some(t => !t.area_id)
  if (current === null) return hasLoose ? null : snapshot.areas[0]?.id ?? null
  if (snapshot.areas.some(a => a.id === current)) return current
  return hasLoose ? null : snapshot.areas[0]?.id ?? null
}
