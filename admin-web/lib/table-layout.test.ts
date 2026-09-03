import { describe, it, expect } from 'vitest'
import {
  LAYOUT_COLS,
  layoutTables,
  moveTable,
  changedPositions,
  type LayoutTable,
} from './table-layout'

const ban = (
  id: string,
  table_number: string,
  pos_x: number | null = null,
  pos_y: number | null = null,
): LayoutTable => ({ id, table_number, pos_x, pos_y })

describe('layoutTables', () => {
  it('danh sách rỗng → không có ô nào', () => {
    expect(layoutTables([])).toEqual([])
  })

  it('bàn chưa sắp được xếp trái sang phải theo tên, số hiểu theo kiểu số', () => {
    const out = layoutTables([ban('c', 'Bàn 10'), ban('a', 'Bàn 2'), ban('b', 'Bàn 1')])
    expect(out.map((t) => t.table_number)).toEqual(['Bàn 1', 'Bàn 2', 'Bàn 10'])
    expect(out.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
  })

  it('xếp quá số cột thì xuống hàng mới', () => {
    const nhieu = Array.from({ length: LAYOUT_COLS + 2 }, (_, i) => ban(`t${i}`, `Bàn ${i + 1}`))
    const out = layoutTables(nhieu)
    expect(out[LAYOUT_COLS]).toMatchObject({ x: 0, y: 1 })
    expect(out[LAYOUT_COLS + 1]).toMatchObject({ x: 1, y: 1 })
  })

  it('bàn đã có toạ độ thì giữ nguyên, không bị xếp lại', () => {
    const out = layoutTables([ban('a', 'Bàn 1', 5, 3)])
    expect(out[0]).toMatchObject({ x: 5, y: 3 })
  })

  it('bàn chưa sắp không được đè lên ô mà bàn đã sắp đang chiếm', () => {
    const out = layoutTables([ban('a', 'Bàn 1', 0, 0), ban('b', 'Bàn 2')])
    const b = out.find((t) => t.id === 'b')!
    expect([b.x, b.y]).toEqual([1, 0])
  })

  // Dữ liệu hỏng: bàn xét sau bị coi như CHƯA SẮP, nhận ô trống đầu tiên của lưới (0,0) —
  // cùng một luật với bàn chưa sắp, không phải luật riêng. Thà lệch chỗ còn hơn vẽ đè mất bàn.
  it('hai bàn cùng toạ độ (dữ liệu hỏng) thì bàn sau rơi về ô trống đầu tiên', () => {
    const out = layoutTables([ban('a', 'Bàn 1', 2, 0), ban('b', 'Bàn 2', 2, 0)])
    expect(out.find((t) => t.id === 'a')).toMatchObject({ x: 2, y: 0 })
    expect(out.find((t) => t.id === 'b')).toMatchObject({ x: 0, y: 0 })
  })

  it('toạ độ ngoài lưới bị coi như chưa sắp', () => {
    const out = layoutTables([ban('a', 'Bàn 1', LAYOUT_COLS + 4, 0)])
    expect(out[0]).toMatchObject({ x: 0, y: 0 })
  })
})

describe('moveTable', () => {
  const base = () => layoutTables([ban('a', 'Bàn 1'), ban('b', 'Bàn 2')])

  it('chuyển sang ô trống', () => {
    const out = moveTable(base(), 'a', 4, 2)
    expect(out.find((t) => t.id === 'a')).toMatchObject({ x: 4, y: 2 })
    expect(out.find((t) => t.id === 'b')).toMatchObject({ x: 1, y: 0 })
  })

  it('thả vào ô đã có bàn khác → ĐỔI CHỖ hai bàn, không chồng', () => {
    const out = moveTable(base(), 'a', 1, 0)
    expect(out.find((t) => t.id === 'a')).toMatchObject({ x: 1, y: 0 })
    expect(out.find((t) => t.id === 'b')).toMatchObject({ x: 0, y: 0 })
  })

  it('thả vào đúng ô cũ → không đổi gì', () => {
    const out = moveTable(base(), 'a', 0, 0)
    expect(out).toEqual(base())
  })

  it('id không có thật → trả nguyên danh sách', () => {
    expect(moveTable(base(), 'khong-co', 3, 3)).toEqual(base())
  })

  it('toạ độ ngoài lưới → từ chối, trả nguyên danh sách', () => {
    expect(moveTable(base(), 'a', LAYOUT_COLS, 0)).toEqual(base())
    expect(moveTable(base(), 'a', -1, 0)).toEqual(base())
  })
})

describe('changedPositions', () => {
  it('không đổi gì → mảng rỗng', () => {
    const p = layoutTables([ban('a', 'Bàn 1', 0, 0)])
    expect(changedPositions(p, p)).toEqual([])
  })

  it('chỉ trả về bàn thực sự đổi toạ độ', () => {
    const before = layoutTables([ban('a', 'Bàn 1'), ban('b', 'Bàn 2')])
    const after = moveTable(before, 'a', 1, 0) // đổi chỗ a với b
    expect(changedPositions(before, after).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'a', pos_x: 1, pos_y: 0 },
      { id: 'b', pos_x: 0, pos_y: 0 },
    ])
  })

  it('bàn lần đầu được xếp (pos NULL → có toạ độ) cũng phải được lưu', () => {
    const chuaSap: LayoutTable[] = [ban('a', 'Bàn 1')]
    const after = layoutTables(chuaSap)
    expect(changedPositions([], after)).toEqual([{ id: 'a', pos_x: 0, pos_y: 0 }])
  })
})
