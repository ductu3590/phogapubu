// Chia bàn theo KHU cho màn nhân viên (Đặt món → chọn bàn, Bàn → Ghép mâm). Thứ tự khu theo sort_order
// server trả về; bàn chưa có khu (hoặc khu đã xoá) dồn xuống "Chưa phân khu" ở cuối. Khu không còn bàn nào
// thì bỏ — nhân viên không cần thấy tiêu đề rỗng. Quán chưa chia khu: trả đúng MỘT nhóm area=null.

export type StaffArea = { id: string; name: string; color: string | null }
export type AreaGroup<T> = { area: StaffArea | null; tables: T[] }

export function groupTablesByArea<T extends { area_id: string | null }>(tables: T[], areas: StaffArea[]): AreaGroup<T>[] {
  const known = new Set(areas.map((a) => a.id))
  const groups: AreaGroup<T>[] = areas
    .map((area) => ({ area, tables: tables.filter((t) => t.area_id === area.id) }))
    .filter((g) => g.tables.length > 0)
  const loose = tables.filter((t) => !t.area_id || !known.has(t.area_id))
  if (loose.length > 0) groups.push({ area: null, tables: loose })
  return groups
}
