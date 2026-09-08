import { describe, expect, it } from 'vitest'
import { layoutByArea, moveInArea, transferToArea } from './area-layout'

const tables = [
  { id: 'a', table_number: 'Bàn 1', area_id: 'up', pos_x: 0, pos_y: 0 },
  { id: 'b', table_number: 'Bàn 2', area_id: 'down', pos_x: 0, pos_y: 0 },
  { id: 'c', table_number: 'Bàn 3', area_id: 'up', pos_x: 1, pos_y: 0 },
]

describe('sơ đồ theo khu vực', () => {
  it('hai khu giữ được cùng tọa độ mà không đẩy bàn khác', () => {
    expect(layoutByArea(tables).find(t => t.id === 'b')).toMatchObject({ x: 0, y: 0 })
  })
  it('đổi chỗ trong khu hiện tại không di chuyển bàn của khu khác', () => {
    const result = moveInArea(layoutByArea(tables), 'a', 1, 0)
    expect(result.find(t => t.id === 'a')).toMatchObject({ x: 1, y: 0 })
    expect(result.find(t => t.id === 'c')).toMatchObject({ x: 0, y: 0 })
    expect(result.find(t => t.id === 'b')).toMatchObject({ x: 0, y: 0 })
  })
  it('chuyển khu lấy ô trống và giữ nguyên định danh bàn', () => {
    const result = transferToArea(layoutByArea(tables), 'a', 'down')
    expect(result.find(t => t.id === 'a')).toMatchObject({ area_id: 'down', x: 1, y: 0 })
    expect(result.find(t => t.id === 'b')).toMatchObject({ x: 0, y: 0 })
  })
  it('chuyển về chưa phân khu và nạp lại vẫn giữ vị trí đã lưu', () => {
    const result = transferToArea(layoutByArea(tables), 'a', null)
    const saved = result.map(t => ({ ...t, pos_x: t.x, pos_y: t.y }))
    expect(layoutByArea(saved)).toEqual(result.map(t => ({ ...t, pos_x: t.x, pos_y: t.y })))
    expect(result.find(t => t.id === 'a')).toMatchObject({ area_id: null, x: 0, y: 0 })
  })
})
