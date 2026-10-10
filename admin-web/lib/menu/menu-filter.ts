import { stripVietnamese } from './sku'

// Tìm + lọc món cho tab Thực đơn & Giá (PA-4). Đang tìm hoặc đang lọc trạng thái thì TẮT kéo-sắp-xếp:
// kéo trên tập con rồi ghi thứ tự sẽ làm sai thứ tự cả danh mục.

export type StatusFilter = 'all' | 'on' | 'off'
export type FilterItem = { id: string; name: string; sku: string | null; is_available: boolean; category_id: string }

const norm = (s: string) => stripVietnamese(s).toLowerCase()

export function visibleMenuItems<T extends FilterItem>(input: {
  categories: Array<{ id: string; name: string; menu_items: T[] }>
  selectedCatId: string
  query: string
  status: StatusFilter
  isAvailable?: (item: T) => boolean
}): { items: Array<T & { categoryName: string }>; counts: { all: number; on: number; off: number }; searching: boolean; canReorder: boolean } {
  const isOn = input.isAvailable ?? ((i: T) => i.is_available)
  const q = norm(input.query.trim())
  const searching = q.length > 0
  const pool = (searching ? input.categories : input.categories.filter((c) => c.id === input.selectedCatId))
    .flatMap((c) => (c.menu_items ?? []).map((i) => ({ ...i, categoryName: c.name })))
    .filter((i) => !searching || norm(i.name).includes(q) || (i.sku ?? '').toLowerCase().includes(q))
  const on = pool.filter(isOn).length
  const items = input.status === 'all' ? pool : pool.filter((i) => (input.status === 'on' ? isOn(i) : !isOn(i)))
  return { items, counts: { all: pool.length, on, off: pool.length - on }, searching, canReorder: !searching && input.status === 'all' }
}
