import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    writes: [] as Array<{ table: string; op: string; payload?: unknown; eq: Array<[string, unknown]> }>,
    targetFound: true,
    updatedRows: [{ id: 'd1' }] as unknown[],
    role: 'store_owner' as string,
  }
  const from = vi.fn((table: string) => {
    const eq: Array<[string, unknown]> = []
    let op = 'select'
    let payload: unknown
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((c: string, v: unknown) => { eq.push([c, v]); return b })
    b.insert = vi.fn((p: unknown) => { op = 'insert'; payload = p; return b })
    b.update = vi.fn((p: unknown) => { op = 'update'; payload = p; return b })
    b.delete = vi.fn(() => { op = 'delete'; return b })
    b.maybeSingle = vi.fn(async () => ({ data: state.targetFound ? { id: 'x' } : null, error: null }))
    b.then = (resolve: (v: unknown) => void) => {
      if (op !== 'select') state.writes.push({ table, op, payload, eq: [...eq] })
      resolve({ data: op === 'update' ? state.updatedRows : null, error: null })
    }
    return b
  })
  return {
    state,
    from,
    requireOperator: vi.fn(async () => ({ userId: 'u1', role: state.role, storeId: 'store-1' })),
    revalidatePath: vi.fn(),
  }
})
vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => ({ from: mocks.from })) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { addMenuDiscount, updateMenuDiscount, setMenuDiscountActive, deleteMenuDiscount } = await import('./menu-discounts')

function form(obj: Record<string, string | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x))
    else fd.set(k, v)
  }
  return fd
}

describe('menu-discounts actions (mig 115)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.writes = []
    mocks.state.targetFound = true
    mocks.state.updatedRows = [{ id: 'd1' }]
    mocks.state.role = 'store_owner'
  })

  it('thêm giảm giá món: ghi đúng quán, người tạo và lịch', async () => {
    const res = await addMenuDiscount(
      { menuItemId: 'i1' },
      form({ discount_type: 'percent', value: '20', name: 'Happy hour', schedule: 'scheduled', time_from: '16:00', time_to: '18:00', days: ['1', '2'] }),
    )
    expect(res).toEqual({ ok: true })
    const w = mocks.state.writes.find((x) => x.table === 'menu_discounts')
    expect(w?.payload).toMatchObject({
      store_id: 'store-1', menu_item_id: 'i1', category_id: null, created_by: 'u1',
      discount_type: 'percent', value: 20, name: 'Happy hour', time_from: '16:00', time_to: '18:00', days_of_week: [1, 2],
    })
  })

  it('món / danh mục không thuộc quán → từ chối, không ghi', async () => {
    mocks.state.targetFound = false
    const res = await addMenuDiscount({ categoryId: 'c-other' }, form({ discount_type: 'amount', value: '5.000', schedule: 'always' }))
    expect(res.ok).toBe(false)
    expect(mocks.state.writes).toHaveLength(0)
  })

  it('phải chọn đúng một đích', async () => {
    const res = await addMenuDiscount({ menuItemId: 'i1', categoryId: 'c1' }, form({ discount_type: 'percent', value: '10' }))
    expect(res.ok).toBe(false)
  })

  it('giá trị sai → trả lỗi, không ném', async () => {
    const res = await addMenuDiscount({ menuItemId: 'i1' }, form({ discount_type: 'percent', value: '150' }))
    expect(res).toEqual({ ok: false, error: 'Phần trăm giảm tối đa là 100' })
  })

  it('thu ngân không được sửa', async () => {
    mocks.state.role = 'store_cashier'
    await expect(setMenuDiscountActive('d1', false)).rejects.toThrow('Chỉ chủ quán')
  })

  it('sửa / bật tắt / xoá luôn lọc store_id', async () => {
    await updateMenuDiscount('d1', form({ discount_type: 'amount', value: '3000', schedule: 'always' }))
    await setMenuDiscountActive('d1', false)
    await deleteMenuDiscount('d1')
    for (const w of mocks.state.writes) expect(w.eq).toContainEqual(['store_id', 'store-1'])
    expect(mocks.state.writes.map((w) => w.op)).toEqual(['update', 'update', 'delete'])
  })

  it('sửa chương trình không tồn tại / quán khác → báo lỗi', async () => {
    mocks.state.updatedRows = []
    const res = await setMenuDiscountActive('d-other', true)
    expect(res.ok).toBe(false)
  })
})
