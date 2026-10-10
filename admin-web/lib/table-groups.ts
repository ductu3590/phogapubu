// Nhóm bàn theo khu cho tab Sơ đồ bàn & QR và trang in QR (PA-3). Thuần để test được.

export type GroupArea = { id: string; name: string; color: string; sort_order?: number }
export type GroupTable = { id: string; table_number: string; area_id: string | null; is_active: boolean }
export type TableGroup<T> = { area: GroupArea | null; tables: T[] }

const byName = (a: GroupTable, b: GroupTable) =>
  a.table_number.localeCompare(b.table_number, 'vi', { numeric: true, sensitivity: 'base' })

export function groupTablesByArea<T extends GroupTable>(areas: GroupArea[], tables: T[]): TableGroup<T>[] {
  const known = new Set(areas.map((a) => a.id))
  const groups: TableGroup<T>[] = areas.map((area) => ({ area, tables: tables.filter((t) => t.area_id === area.id).sort(byName) }))
  const loose = tables.filter((t) => !t.area_id || !known.has(t.area_id)).sort(byName)
  if (loose.length > 0) groups.push({ area: null, tables: loose })
  return groups
}

export function pickPrintTables<T extends GroupTable>(
  areas: GroupArea[],
  tables: T[],
  area: string | undefined,
  table?: string,
): { ok: true; title: string; groups: TableGroup<T>[] } | { ok: false; error: string } {
  if (table) {
    const one = tables.find((t) => t.id === table && t.is_active)
    if (!one) return { ok: false, error: 'Không tìm thấy bàn' }
    return { ok: true, title: one.table_number, groups: groupTablesByArea(areas, [one]).filter((g) => g.tables.length > 0) }
  }
  const all = groupTablesByArea(areas, tables.filter((t) => t.is_active))
  let title = 'Cả quán'
  let groups = all
  if (area && area !== 'all') {
    if (area === 'none') {
      title = 'Chưa phân khu'
      groups = all.filter((g) => g.area === null)
    } else {
      const found = areas.find((a) => a.id === area)
      if (!found) return { ok: false, error: 'Không tìm thấy khu' }
      title = found.name
      groups = all.filter((g) => g.area?.id === area)
    }
  }
  groups = groups.filter((g) => g.tables.length > 0)
  if (groups.length === 0) return { ok: false, error: 'Không có bàn đang mở để in' }
  return { ok: true, title, groups }
}

/** Khoá đổi khi bàn được thêm / xoá / đổi khu / bật tắt — trang Bàn & QR dùng làm `key` để danh sách
 *  (giữ trong state cho cập nhật lạc quan) dựng lại sau router.refresh(). Không phụ thuộc thứ tự. */
export function tablesVersion(tables: GroupTable[]): string {
  return tables.map((t) => `${t.id}:${t.area_id ?? '-'}:${t.is_active ? 1 : 0}`).sort().join('|')
}
