import { describe, expect, it } from 'vitest'
import { groupTablesByArea } from './staff-area-groups'

const areas = [
  { id: 'a', name: 'Trong nhà', color: 'violet' },
  { id: 'b', name: 'Vỉa hè', color: 'pink' },
  { id: 'c', name: 'Gác', color: 'indigo' },
]

describe('groupTablesByArea', () => {
  it('nhóm theo thứ tự khu, bỏ khu rỗng, bàn lạc khu xuống cuối', () => {
    const tables = [
      { id: '1', area_id: 'b' },
      { id: '2', area_id: 'a' },
      { id: '3', area_id: null },
      { id: '4', area_id: 'xoa-roi' },
    ]
    const g = groupTablesByArea(tables, areas)
    expect(g.map((x) => x.area?.id ?? null)).toEqual(['a', 'b', null])
    expect(g[2].tables.map((t) => t.id)).toEqual(['3', '4'])
  })

  it('quán chưa chia khu: một nhóm area=null', () => {
    const g = groupTablesByArea([{ id: '1', area_id: null }], [])
    expect(g).toEqual([{ area: null, tables: [{ id: '1', area_id: null }] }])
  })

  it('không bàn: rỗng', () => {
    expect(groupTablesByArea([], areas)).toEqual([])
  })
})
