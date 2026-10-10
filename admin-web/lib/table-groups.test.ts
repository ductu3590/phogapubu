import { describe, expect, it } from 'vitest'
import { groupTablesByArea, pickPrintTables } from './table-groups'

const areas = [
  { id: 'a1', name: 'Trong nhà', color: 'violet' },
  { id: 'a2', name: 'Ngoài trời', color: 'pink' },
  { id: 'a3', name: 'Tầng 2', color: 'indigo' },
]
const t = (id: string, table_number: string, area_id: string | null, is_active = true) => ({ id, table_number, area_id, is_active })
const tables = [t('1', 'Bàn 10', 'a1'), t('2', 'Bàn 2', 'a1'), t('3', 'Bàn 5', 'a2'), t('4', 'Bàn 9', null), t('5', 'Bàn 7', 'a2', false)]

describe('nhóm bàn theo khu', () => {
  it('khu theo thứ tự, khu rỗng vẫn có, chưa phân khu ở cuối, sắp tự nhiên', () => {
    const g = groupTablesByArea(areas, tables)
    expect(g.map((x) => x.area?.id ?? null)).toEqual(['a1', 'a2', 'a3', null])
    expect(g[0].tables.map((x) => x.table_number)).toEqual(['Bàn 2', 'Bàn 10'])
    expect(g[2].tables).toEqual([])
  })
  it('không có bàn chưa phân khu → không có nhóm đó', () => {
    expect(groupTablesByArea(areas, tables.filter((x) => x.area_id)).some((x) => x.area === null)).toBe(false)
  })
  it('bàn trỏ tới khu đã mất → vào Chưa phân khu', () => {
    const g = groupTablesByArea(areas, [t('9', 'Bàn 1', 'gone')])
    expect(g.at(-1)?.area).toBeNull()
    expect(g.at(-1)?.tables.map((x) => x.id)).toEqual(['9'])
  })
})

describe('chọn bàn để in QR', () => {
  it('cả quán: chỉ bàn đang mở, bỏ nhóm rỗng', () => {
    const r = pickPrintTables(areas, tables, 'all')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['2', '1', '3', '4'])
    expect(r.ok && r.title).toBe('Cả quán')
  })
  it('một khu', () => {
    const r = pickPrintTables(areas, tables, 'a2')
    expect(r.ok && r.title).toBe('Ngoài trời')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['3'])
  })
  it('chưa phân khu', () => {
    const r = pickPrintTables(areas, tables, 'none')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['4'])
  })
  it('một bàn', () => {
    const r = pickPrintTables(areas, tables, undefined, '3')
    expect(r.ok && r.title).toBe('Bàn 5')
    expect(r.ok && r.groups.flatMap((g) => g.tables.map((x) => x.id))).toEqual(['3'])
    expect(pickPrintTables(areas, tables, undefined, '5')).toEqual({ ok: false, error: 'Không tìm thấy bàn' })
  })
  it('khu lạ / khu không có bàn mở → lỗi rõ', () => {
    expect(pickPrintTables(areas, tables, 'zzz')).toEqual({ ok: false, error: 'Không tìm thấy khu' })
    expect(pickPrintTables(areas, tables, 'a3')).toEqual({ ok: false, error: 'Không có bàn đang mở để in' })
  })
})
