import { describe, expect, it } from 'vitest'
import { areaTabs, layoutByArea, moveInArea, pickAreaId, transferToArea } from './area-layout'

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

describe('tab khu trên sơ đồ POS (sau PA-3)', () => {
  const areas = [{ id: 'a1', name: 'Trong nhà', color: 'violet' }, { id: 'a2', name: 'Ngoài trời', color: 'indigo' }]
  const tbl = (id: string, area_id: string | null) => ({ id, table_number: id, pos_x: null, pos_y: null, area_id })

  it('mọi bàn đã có khu → KHÔNG có tab "Chưa phân khu"', () => {
    expect(areaTabs(areas, [tbl('1', 'a1'), tbl('2', 'a2')]).map((a) => a.id)).toEqual(['a1', 'a2'])
  })
  it('còn bàn chưa có khu → tab đó hiện (ở đầu) để bàn không bị mất', () => {
    expect(areaTabs(areas, [tbl('1', 'a1'), tbl('2', null)]).map((a) => a.id)).toEqual([null, 'a1', 'a2'])
  })
  it('đang chọn "Chưa phân khu" mà tab đã ẩn → chuyển sang khu đầu tiên', () => {
    expect(pickAreaId(null, { areas, tables: [tbl('1', 'a1')] })).toBe('a1')
    expect(pickAreaId(null, { areas, tables: [tbl('1', null)] })).toBeNull()
    expect(pickAreaId('a2', { areas, tables: [tbl('1', 'a1')] })).toBe('a2')
    expect(pickAreaId('gone', { areas, tables: [tbl('1', 'a1')] })).toBe('a1')
  })
})
