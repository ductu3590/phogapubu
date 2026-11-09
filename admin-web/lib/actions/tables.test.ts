import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    areas: [] as Array<{ id: string; store_id: string; name: string; color: string; sort_order: number }>,
    tables: [] as Array<{ id: string; store_id: string; area_id: string | null; table_number?: string }>,
    writes: [] as Array<{ table: string; op: string; payload?: unknown; eq: Array<[string, unknown]> }>,
  }
  const from = vi.fn((table: string) => {
    const eq: Array<[string, unknown]> = []
    let op = 'select'
    let payload: unknown
    const rows = () => {
      const src = table === 'table_areas' ? state.areas : state.tables
      return (src as Array<Record<string, unknown>>).filter((r) => eq.every(([c, v]) => r[c] === v))
    }
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((c: string, v: unknown) => { eq.push([c, v]); return b })
    b.insert = vi.fn((p: unknown) => { op = 'insert'; payload = p; return b })
    b.update = vi.fn((p: unknown) => { op = 'update'; payload = p; return b })
    b.delete = vi.fn(() => { op = 'delete'; return b })
    b.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }))
    b.then = (resolve: (v: unknown) => void) => {
      if (op !== 'select') state.writes.push({ table, op, payload, eq: [...eq] })
      resolve({ data: op === 'select' ? rows() : null, error: null, count: rows().length })
    }
    return b
  })
  return { state, from, requireStoreOwnerStoreId: vi.fn(async () => 'store-1'), revalidatePath: vi.fn() }
})

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => ({ from: mocks.from })) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { addTable, addTablesBulk, toggleTable } = await import('./tables')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.writes = []
  mocks.state.areas = [
    { id: 'a1', store_id: 'store-1', name: 'Trong nhà', color: 'violet', sort_order: 1 },
    { id: 'x1', store_id: 'store-2', name: 'Khu quán khác', color: 'pink', sort_order: 1 },
  ]
  mocks.state.tables = [
    { id: 't1', store_id: 'store-1', area_id: 'a1', table_number: 'A1' },
    { id: 't2', store_id: 'store-1', area_id: 'a1', table_number: ' a3 ' },
    { id: 't9', store_id: 'store-2', area_id: null, table_number: 'A2' },
  ]
  mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
})

function form(name: string, area: string) {
  const fd = new FormData(); fd.set('table_number', name); fd.set('area_id', area); return fd
}

describe('bàn (PA-3)', () => {
  it('thêm bàn vào khu của quán mình', async () => {
    await addTable(form('Bàn 21', 'a1'))
    expect(mocks.state.writes[0]).toMatchObject({ table: 'tables', op: 'insert', payload: { store_id: 'store-1', table_number: 'Bàn 21', is_active: true, area_id: 'a1' } })
  })
  it('không chọn khu → chưa phân khu', async () => {
    await addTable(form('Bàn 22', ''))
    expect(mocks.state.writes[0]).toMatchObject({ payload: { area_id: null } })
  })
  it('khu của quán khác → báo lỗi, không thêm', async () => {
    await expect(addTable(form('Bàn 23', 'x1'))).rejects.toThrow('Không tìm thấy khu')
    expect(mocks.state.writes).toEqual([])
  })
  it('bật/tắt bàn chỉ trong quán mình', async () => {
    await toggleTable('t1', false)
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 't1'], ['store_id', 'store-1']]))
  })
})

describe('addTablesBulk', () => {
  it('một lệnh insert mảng đúng store_id, area_id, is_active, không có pos_x', async () => {
    const r = await addTablesBulk({ areaId: 'a1', prefix: 'B', from: 1, to: 3 })
    expect(r).toEqual({ ok: true, created: ['B1', 'B2', 'B3'], skipped: [] })
    const inserts = mocks.state.writes.filter((w) => w.op === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].payload).toEqual([
      { store_id: 'store-1', table_number: 'B1', is_active: true, area_id: 'a1' },
      { store_id: 'store-1', table_number: 'B2', is_active: true, area_id: 'a1' },
      { store_id: 'store-1', table_number: 'B3', is_active: true, area_id: 'a1' },
    ])
    expect(JSON.stringify(inserts[0].payload)).not.toContain('pos_x')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/tables')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/pos')
  })
  it('tên trùng bàn đang có (kể cả bàn đã đóng) bị bỏ qua và trả về skipped', async () => {
    mocks.state.tables.push({ id: 't3', store_id: 'store-1', area_id: null, table_number: 'A2' })
    const r = await addTablesBulk({ areaId: null, prefix: 'A', from: 1, to: 4 })
    expect(r).toEqual({ ok: true, created: ['A4'], skipped: ['A1', 'A2', 'A3'] })
  })
  it('cả loạt trùng thì không insert, ok:true', async () => {
    const r = await addTablesBulk({ areaId: null, prefix: 'A', from: 1, to: 1 })
    expect(r).toEqual({ ok: true, created: [], skipped: ['A1'] })
    expect(mocks.state.writes).toEqual([])
  })
  it('khu của quán khác → {ok:false, error:"Không tìm thấy khu"}, không insert', async () => {
    const r = await addTablesBulk({ areaId: 'x1', prefix: 'C', from: 1, to: 2 })
    expect(r).toEqual({ ok: false, error: 'Không tìm thấy khu' })
    expect(mocks.state.writes).toEqual([])
  })
  it('không phải chủ quán → {ok:false}, không ném', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Không có quyền'))
    const r = await addTablesBulk({ areaId: null, prefix: 'C', from: 1, to: 2 })
    expect(r).toEqual({ ok: false, error: 'Không có quyền' })
  })
  it('101 bàn → {ok:false}, không đọc DB', async () => {
    const r = await addTablesBulk({ areaId: null, prefix: 'C', from: 1, to: 101 })
    expect(r).toEqual({ ok: false, error: 'Tối đa 100 bàn một lần' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
