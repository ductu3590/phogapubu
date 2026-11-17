import { describe, expect, it } from 'vitest'
import type { AreaPlacedTable, TableArea } from './area-layout'
import type { OpenTableSession } from './actions/table-session'
import type { ReservationRow } from './actions/reservations'
import {
  ALL_AREAS, NO_AREA_ID, buildGridGroups, effectivePickedTables, gridAreaCounts, gridStatusCounts, heldReservationByTable,
  matchesGridStatus, normalizeTableSearch, seatedLabel, tableInAreaFilter, type GridContext,
} from './pos-floor-grid'

const areas: TableArea[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
const mk = (id: string, n: string, x: number, y: number, area: string | null): AreaPlacedTable =>
  ({ id, table_number: n, pos_x: x, pos_y: y, x, y, area_id: area }) as unknown as AreaPlacedTable
const A1 = mk('a1', 'Bàn A1', 0, 1, 'a')
const A2 = mk('a2', 'Bàn A2', 1, 0, 'a')
const B1 = mk('b1', 'Bàn B1', 0, 0, 'b')
const X1 = mk('x1', 'Bàn X1', 0, 0, null)
const tables = [A1, A2, B1, X1]

const session = {
  session_id: 's1', table_id: 'a2', status: 'open',
  orders: [{ status: 'pending', order_source: 'customer' }],
} as unknown as OpenTableSession
const T = (iso: string) => new Date(iso).getTime()
const res = (o: Partial<ReservationRow>): ReservationRow => ({
  reservationId: 'r1', status: 'confirmed', sessionId: null, arrivalAt: '2026-11-17T12:30:00Z',
  planningHoldMinutes: 120, tableIds: ['b1'], ...o,
}) as unknown as ReservationRow
const ctx: GridContext = {
  sessionByTable: new Map([['a2', session]]),
  heldByTable: new Map([['b1', res({})]]),
}

describe('heldReservationByTable', () => {
  it("chỉ confirmed, chưa có phiên, trong khung -60'..+hold; nhiều đặt bàn lấy đến sớm nhất", () => {
    const arrival = '2026-11-17T12:30:00Z'
    const at = (m: number) => T(arrival) + m * 60_000
    const held = (now: number, r = res({})) => heldReservationByTable([r], now).has('b1')
    expect(held(at(-61))).toBe(false)
    expect(held(at(-60))).toBe(true)
    expect(held(at(119))).toBe(true)
    expect(held(at(120))).toBe(false)
    expect(held(at(0), res({ status: 'pending' }))).toBe(false)
    expect(held(at(0), res({ sessionId: 'x' }))).toBe(false)
    const early = res({ reservationId: 'r0', arrivalAt: '2026-11-17T12:00:00Z' })
    const m = heldReservationByTable([res({}), early], at(0))
    expect(m.get('b1')?.reservationId).toBe('r0')
  })
})

describe('buildGridGroups', () => {
  const base = { tables, areas, areaFilter: ALL_AREAS, status: 'all' as const, query: '', ctx }
  it('Tất cả khu chia nhóm theo areas, Chưa phân khu cuối, xếp y rồi x', () => {
    const g = buildGridGroups(base)
    expect(g.map(x => x.name)).toEqual(['A', 'B', 'Chưa phân khu'])
    expect(g[0].tables.map(t => t.id)).toEqual(['a2', 'a1'])
    expect(g[2].areaId).toBeNull()
  })
  it('lọc khu + trạng thái + tìm kiếm; nhóm rỗng bị bỏ', () => {
    const g = buildGridGroups({ ...base, areaFilter: 'a', status: 'pending' })
    expect(g).toHaveLength(1)
    expect(g[0].tables.map(t => t.id)).toEqual(['a2'])
    expect(buildGridGroups({ ...base, query: 'ban a2' }).flatMap(x => x.tables.map(t => t.id))).toEqual(['a2'])
    expect(buildGridGroups({ ...base, query: 'BÀN A2' }).flatMap(x => x.tables.map(t => t.id))).toEqual(['a2'])
    expect(buildGridGroups({ ...base, query: 'b9' })).toEqual([])
  })
  it('lọc bàn chưa phân khu', () => {
    const g = buildGridGroups({ ...base, areaFilter: NO_AREA_ID })
    expect(g.map(x => x.name)).toEqual(['Chưa phân khu'])
  })
})

describe('matchesGridStatus', () => {
  it('busy gồm pending; free gồm bàn đang giữ; booked chỉ bàn trống đang giữ', () => {
    expect(matchesGridStatus('a2', 'busy', ctx)).toBe(true)
    expect(matchesGridStatus('a2', 'pending', ctx)).toBe(true)
    expect(matchesGridStatus('a2', 'free', ctx)).toBe(false)
    expect(matchesGridStatus('b1', 'free', ctx)).toBe(true)
    expect(matchesGridStatus('b1', 'booked', ctx)).toBe(true)
    expect(matchesGridStatus('a1', 'booked', ctx)).toBe(false)
    expect(matchesGridStatus('a1', 'all', ctx)).toBe(true)
  })
})

describe('đếm', () => {
  it('gridStatusCounts đếm trong khu đang lọc', () => {
    expect(gridStatusCounts(tables, areas, ALL_AREAS, ctx)).toEqual({ all: 4, busy: 1, free: 3, pending: 1, booked: 1 })
    expect(gridStatusCounts(tables, areas, 'b', ctx)).toEqual({ all: 1, busy: 0, free: 1, pending: 0, booked: 1 })
  })
  it('gridAreaCounts: Chưa phân khu đứng cuối (như thứ tự lưới)', () => {
    expect(gridAreaCounts(tables, areas)).toEqual([
      { value: '__all__', label: 'Tất cả khu', color: null, count: 4 },
      { value: 'a', label: 'A', color: null, count: 2 },
      { value: 'b', label: 'B', color: null, count: 1 },
      { value: '__none__', label: 'Chưa phân khu', color: null, count: 1 },
    ])
    expect(gridAreaCounts([X1], [])).toEqual([{ value: '__all__', label: 'Tất cả khu', color: null, count: 1 }])
  })
})

describe('bàn trỏ tới khu đã xoá = Chưa phân khu (một định nghĩa cho nhóm, lọc, đếm)', () => {
  const Z1 = mk('z1', 'Bàn Z1', 0, 0, 'khu-da-xoa')
  const all = [...tables, Z1]
  it('buildGridGroups xếp vào Chưa phân khu và lọc NO_AREA_ID vẫn thấy', () => {
    const base = { tables: all, areas, areaFilter: ALL_AREAS, status: 'all' as const, query: '', ctx }
    expect(buildGridGroups(base).at(-1)?.tables.map(t => t.id)).toEqual(['x1', 'z1'])
    expect(buildGridGroups({ ...base, areaFilter: NO_AREA_ID }).flatMap(g => g.tables.map(t => t.id))).toEqual(['x1', 'z1'])
  })
  it('gridAreaCounts + gridStatusCounts đếm cả bàn đó vào Chưa phân khu', () => {
    expect(gridAreaCounts(all, areas).find(a => a.value === NO_AREA_ID)?.count).toBe(2)
    expect(gridStatusCounts(all, areas, NO_AREA_ID, ctx).all).toBe(2)
  })
  it('tableInAreaFilter (lọc khu của Timeline / Danh sách) dùng cùng định nghĩa', () => {
    const known = new Set(areas.map(a => a.id))
    expect(all.filter(t => tableInAreaFilter(t, NO_AREA_ID, known)).map(t => t.id)).toEqual(['x1', 'z1'])
    expect(all.filter(t => tableInAreaFilter(t, ALL_AREAS, known))).toHaveLength(all.length)
    expect(all.filter(t => tableInAreaFilter(t, 'a', known)).every(t => t.area_id === 'a')).toBe(true)
  })
})

describe('chuỗi', () => {
  it('normalizeTableSearch bỏ dấu + đ', () => expect(normalizeTableSearch('  Bàn  Đá 1 ')).toBe('ban da 1'))
  it('seatedLabel', () => {
    const now = T('2026-11-17T12:00:00Z')
    const ago = (m: number) => new Date(now - m * 60_000).toISOString()
    expect(seatedLabel(ago(0), now)).toBe("0'")
    expect(seatedLabel(ago(45), now)).toBe("45'")
    expect(seatedLabel(ago(72), now)).toBe('1g12')
    expect(seatedLabel(ago(125), now)).toBe('2g05')
    expect(seatedLabel(ago(-10), now)).toBe("0'")
  })
})

describe('effectivePickedTables', () => {
  const free = new Set(['a1', 'a2', 'b1'])
  it('giữ bàn còn trống, bỏ bàn vừa có phiên / đã xoá / đang giữ cho khách đặt', () => {
    const picked = new Set(['a1', 'x9', 'b1', 'gone'])
    expect([...effectivePickedTables(picked, free, new Set(['b1']))]).toEqual(['a1'])
  })
  it('không có gì bị loại → vẫn đủ bàn, thứ tự giữ nguyên', () => {
    expect([...effectivePickedTables(new Set(['a2', 'a1']), free, new Set())]).toEqual(['a2', 'a1'])
  })
  it('nhận Map bàn → đặt bàn làm danh sách bàn đang giữ', () => {
    const held = new Map([['a2', {}]])
    expect([...effectivePickedTables(new Set(['a1', 'a2']), free, held)]).toEqual(['a1'])
  })
})
