import { layoutTables, moveTable, type LayoutTable, type PlacedTable } from './table-layout'

export type TableArea = { id: string; name: string }
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
