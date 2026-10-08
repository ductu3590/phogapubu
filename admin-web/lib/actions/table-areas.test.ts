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

const { createArea, deleteArea, setTableArea, updateArea } = await import('./table-areas')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.writes = []
  mocks.state.areas = [
    { id: 'a1', store_id: 'store-1', name: 'Trong nhà', color: 'violet', sort_order: 1 },
    { id: 'a2', store_id: 'store-1', name: 'Ngoài trời', color: 'indigo', sort_order: 2 },
    { id: 'x1', store_id: 'store-2', name: 'Khu quán khác', color: 'pink', sort_order: 1 },
  ]
  mocks.state.tables = [
    { id: 't1', store_id: 'store-1', area_id: 'a1' },
    { id: 'tx', store_id: 'store-2', area_id: 'x1' },
  ]
})

describe('khu (PA-3)', () => {
  it('tạo khu: màu chưa dùng + thứ tự cuối', async () => {
    await expect(createArea(' Tầng 2 ')).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ table: 'table_areas', op: 'insert', payload: { store_id: 'store-1', name: 'Tầng 2', color: 'purple', sort_order: 3 } })
  })
  it('tên trùng (khác hoa thường) / rỗng / quá dài → lỗi, không ghi', async () => {
    await expect(createArea('trong NHÀ')).resolves.toEqual({ ok: false, error: 'Đã có khu tên «Trong nhà»' })
    await expect(createArea('   ')).resolves.toEqual({ ok: false, error: 'Tên khu từ 1 đến 60 ký tự' })
    await expect(createArea('x'.repeat(61))).resolves.toEqual({ ok: false, error: 'Tên khu từ 1 đến 60 ký tự' })
    expect(mocks.state.writes).toEqual([])
  })
  it('đổi tên + màu: lọc đúng quán; màu rác → tím', async () => {
    await expect(updateArea('a2', { name: 'Sân vườn', color: 'cyan' })).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ op: 'update', payload: { name: 'Sân vườn', color: 'violet' } })
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 'a2'], ['store_id', 'store-1']]))
  })
  it('khu của quán khác → không tìm thấy, không ghi', async () => {
    await expect(updateArea('x1', { color: 'pink' })).resolves.toEqual({ ok: false, error: 'Không tìm thấy khu' })
    await expect(deleteArea('x1')).resolves.toEqual({ ok: false, error: 'Không tìm thấy khu' })
    expect(mocks.state.writes).toEqual([])
  })
  it('xoá khu còn bàn → từ chối', async () => {
    await expect(deleteArea('a1')).resolves.toEqual({ ok: false, error: 'Khu còn 1 bàn — chuyển hết bàn sang khu khác trước' })
    expect(mocks.state.writes).toEqual([])
  })
  it('xoá khu trống → xoá đúng quán', async () => {
    await expect(deleteArea('a2')).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ table: 'table_areas', op: 'delete' })
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 'a2'], ['store_id', 'store-1']]))
  })
  it('gán bàn vào khu / bỏ khu; bàn hoặc khu quán khác → lỗi', async () => {
    await expect(setTableArea('t1', 'a2')).resolves.toEqual({ ok: true })
    expect(mocks.state.writes[0]).toMatchObject({ table: 'tables', op: 'update', payload: { area_id: 'a2' } })
    expect(mocks.state.writes[0].eq).toEqual(expect.arrayContaining([['id', 't1'], ['store_id', 'store-1']]))
    await expect(setTableArea('t1', null)).resolves.toEqual({ ok: true })
    await expect(setTableArea('tx', 'a1')).resolves.toEqual({ ok: false, error: 'Không tìm thấy bàn' })
    await expect(setTableArea('t1', 'x1')).resolves.toEqual({ ok: false, error: 'Không tìm thấy khu' })
  })
  it('không phải chủ quán → lỗi, không ghi', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(createArea('Tầng 3')).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán mới thao tác được ở đây' })
    expect(mocks.state.writes).toEqual([])
  })
})
