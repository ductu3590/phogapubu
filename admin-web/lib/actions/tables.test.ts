import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    areas: [] as Array<{ id: string; store_id: string; name: string; color: string; sort_order: number }>,
    tables: [] as Array<{ id: string; store_id: string; area_id: string | null }>,
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

const { addTable, toggleTable } = await import('./tables')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.writes = []
  mocks.state.areas = [
    { id: 'a1', store_id: 'store-1', name: 'Trong nhà', color: 'violet', sort_order: 1 },
    { id: 'x1', store_id: 'store-2', name: 'Khu quán khác', color: 'pink', sort_order: 1 },
  ]
  mocks.state.tables = [{ id: 't1', store_id: 'store-1', area_id: 'a1' }]
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
