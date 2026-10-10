import { describe, expect, it } from 'vitest'
import { visibleMenuItems } from './menu-filter'

const it_ = (id: string, name: string, sku: string | null, on: boolean, cat: string) => ({ id, name, sku, is_available: on, category_id: cat })
const categories = [
  { id: 'c1', name: 'Đồ uống', menu_items: [it_('1', 'Bia hơi', 'DU-001', true, 'c1'), it_('2', 'Nước cam', 'DU-002', false, 'c1')] },
  { id: 'c2', name: 'Đồ khô', menu_items: [it_('3', 'Mực nướng', 'DK-001', true, 'c2'), it_('4', 'Bò khô', 'DK-002', true, 'c2')] },
]

describe('lọc + tìm món', () => {
  it('không tìm: chỉ danh mục đang chọn; đếm trước khi lọc; kéo được khi xem Tất cả', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: '', status: 'all' })
    expect(r.items.map((i) => i.id)).toEqual(['1', '2'])
    expect(r.counts).toEqual({ all: 2, on: 1, off: 1 })
    expect(r.canReorder).toBe(true)
  })
  it('lọc Tạm hết: chỉ món tắt, đếm vẫn đủ, KHÔNG kéo được', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: '', status: 'off' })
    expect(r.items.map((i) => i.id)).toEqual(['2'])
    expect(r.counts).toEqual({ all: 2, on: 1, off: 1 })
    expect(r.canReorder).toBe(false)
  })
  it('tìm không dấu trên MỌI danh mục, kèm tên danh mục, KHÔNG kéo được', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: 'kho', status: 'all' })
    expect(r.items.map((i) => [i.id, i.categoryName])).toEqual([['4', 'Đồ khô']])
    expect(r.searching).toBe(true)
    expect(r.canReorder).toBe(false)
  })
  it('tìm theo mã (không phân biệt hoa thường)', () => {
    expect(visibleMenuItems({ categories, selectedCatId: 'c1', query: 'dk-00', status: 'all' }).items.map((i) => i.id)).toEqual(['3', '4'])
  })
  it('dùng trạng thái lạc quan do UI truyền vào', () => {
    const r = visibleMenuItems({ categories, selectedCatId: 'c1', query: '', status: 'on', isAvailable: (i) => i.id === '2' })
    expect(r.items.map((i) => i.id)).toEqual(['2'])
  })
})
