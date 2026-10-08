import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    writes: [] as Array<{ table: string; op: string; payload?: unknown; eq: Array<[string, unknown]> }>,
    uniqueError: false,
    conflict: null as null | { name: string },
    // Dòng trả về cho .single() khi kiểm danh mục/món thuộc quán
    rows: { menu_categories: { id: 'c1', store_id: 'store-1' }, menu_items: { id: 'i1', store_id: 'store-1' } } as Record<string, unknown>,
  }
  const from = vi.fn((table: string) => {
    const eq: Array<[string, unknown]> = []
    let op = 'select'
    let payload: unknown
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((c: string, v: unknown) => { eq.push([c, v]); return b })
    b.order = vi.fn(() => b)
    b.limit = vi.fn(() => b)
    b.insert = vi.fn((p: unknown) => { op = 'insert'; payload = p; return b })
    b.update = vi.fn((p: unknown) => { op = 'update'; payload = p; return b })
    b.delete = vi.fn(() => { op = 'delete'; return b })
    const result = () => {
      if (op !== 'select') {
        if (state.uniqueError) return { data: null, error: { code: '23505', message: 'duplicate key' } }
        state.writes.push({ table, op, payload, eq: [...eq] })
        return { data: op === 'insert' ? { id: 'new-1' } : null, error: null }
      }
      return { data: null, error: null, count: 0 }
    }
    b.single = vi.fn(async () => (op === 'select' ? { data: state.rows[table] ?? null, error: null } : result()))
    b.maybeSingle = vi.fn(async () => (op === 'select' ? { data: state.conflict, error: null } : result()))
    b.then = (resolve: (v: unknown) => void) => resolve(result())
    return b
  })
  return {
    state,
    from,
    requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
    requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
    rpc: vi.fn(),
    revalidatePath: vi.fn(),
  }
})
vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { addCategory, addMenuItem, deleteCategory, deleteMenuItem, setMenuItemAvailable, updateCategory, updateMenuItem } = await import('./menu')

function form(obj: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.set(k, v)
  return fd
}
function lastWrite(table: string) {
  const w = mocks.state.writes.filter((x) => x.table === table)
  return w[w.length - 1]
}

describe('setMenuItemAvailable (PA-2)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gọi RPC bằng phiên đăng nhập, KHÔNG dùng service key', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, is_available: false }, error: null })
    await expect(setMenuItemAvailable('item-1', false)).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('set_menu_item_available', { p_item_id: 'item-1', p_available: false })
  })

  it('RPC từ chối → trả lỗi', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Không có quyền đổi trạng thái món' } })
    await expect(setMenuItemAvailable('item-1', true)).resolves.toEqual({ ok: false, error: 'Không có quyền đổi trạng thái món' })
  })

  it('không có quyền POS → báo lỗi, không gọi RPC', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    await expect(setMenuItemAvailable('item-1', true)).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

// Lỗi người dùng (mã trùng, sai định dạng, danh mục quán khác) phải TRẢ VỀ, không ném: Next ở production
// giấu nội dung lỗi ném từ server action → chủ quán chỉ thấy trang "Không tải được trang này".
describe('mã món + nhãn + tiền tố (PA-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.writes = []
    mocks.state.uniqueError = false
    mocks.state.conflict = null
  })

  it('thêm món: mã gõ tay in hoa + nhãn; mã trống để DB tự sinh', async () => {
    await expect(addMenuItem(form({ category_id: 'c1', name: 'Bia', price: '20000', sku: ' bia-01 ', badge: 'best_seller' }))).resolves.toEqual({ ok: true, id: 'new-1' })
    expect(lastWrite('menu_items').payload).toMatchObject({ sku: 'BIA-01', badge: 'best_seller', store_id: 'store-1' })
    await addMenuItem(form({ category_id: 'c1', name: 'Bia 2', price: '20000', sku: '', badge: '' }))
    expect(lastWrite('menu_items').payload).not.toHaveProperty('sku')
    expect(lastWrite('menu_items').payload).toMatchObject({ badge: null })
  })

  it('mã sai định dạng → lỗi, không ghi', async () => {
    await expect(addMenuItem(form({ category_id: 'c1', name: 'X', price: '1000', sku: 'bia tháp' }))).resolves.toEqual({ ok: false, error: expect.stringContaining('Mã món chỉ gồm') })
    expect(mocks.state.writes).toEqual([])
  })

  it('mã trùng → báo tên món đang dùng', async () => {
    mocks.state.uniqueError = true
    mocks.state.conflict = { name: 'Bia hơi' }
    await expect(addMenuItem(form({ category_id: 'c1', name: 'X', price: '1000', sku: 'DU-001' }))).resolves.toEqual({ ok: false, error: 'Mã món đã dùng cho «Bia hơi»' })
  })

  it('sửa món: mã trống giữ mã cũ; lọc đúng quán', async () => {
    await expect(updateMenuItem('i1', form({ category_id: 'c1', name: 'Bia', price: '20000', sku: '', badge: 'signature' }))).resolves.toEqual({ ok: true })
    const w = lastWrite('menu_items')
    expect(w.payload).not.toHaveProperty('sku')
    expect(w.payload).toMatchObject({ badge: 'signature' })
    expect(w.eq).toEqual(expect.arrayContaining([['id', 'i1'], ['store_id', 'store-1']]))
  })

  it('sửa món sang danh mục của quán khác → từ chối', async () => {
    mocks.state.rows.menu_categories = { id: 'cx', store_id: 'store-2' }
    await expect(updateMenuItem('i1', form({ category_id: 'cx', name: 'Bia', price: '20000' }))).resolves.toEqual({ ok: false, error: 'Danh mục không thuộc quán của bạn' })
    mocks.state.rows.menu_categories = { id: 'c1', store_id: 'store-1' }
  })

  it('xoá món / sửa / xoá danh mục: lọc đúng quán', async () => {
    await deleteMenuItem('i1')
    expect(lastWrite('menu_items').eq).toEqual(expect.arrayContaining([['store_id', 'store-1']]))
    await updateCategory('c1', form({ name: 'Bia', sku_prefix: 'bia' }))
    expect(lastWrite('menu_categories')).toMatchObject({ payload: { name: 'Bia', sku_prefix: 'BIA' } })
    expect(lastWrite('menu_categories').eq).toEqual(expect.arrayContaining([['store_id', 'store-1']]))
    await deleteCategory('c9')
    expect(lastWrite('menu_categories').eq).toEqual(expect.arrayContaining([['store_id', 'store-1']]))
  })

  it('tiền tố trống khi sửa → giữ tiền tố cũ; tiền tố sai → lỗi', async () => {
    await updateCategory('c1', form({ name: 'Bia', sku_prefix: '' }))
    expect(lastWrite('menu_categories').payload).not.toHaveProperty('sku_prefix')
    await expect(addCategory(form({ name: 'Lẩu', sku_prefix: 'LAU-1' }))).resolves.toEqual({ ok: false, error: expect.stringContaining('Tiền tố chỉ gồm') })
  })

  it('tiền tố trùng → báo danh mục đang dùng', async () => {
    mocks.state.uniqueError = true
    mocks.state.conflict = { name: 'Đồ uống' }
    await expect(addCategory(form({ name: 'Bia', sku_prefix: 'DU' }))).resolves.toEqual({ ok: false, error: 'Tiền tố đã dùng cho danh mục «Đồ uống»' })
  })
})
