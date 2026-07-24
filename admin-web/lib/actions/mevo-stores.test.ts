import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireOperator = vi.fn()
  const revalidatePath = vi.fn()
  const updateArgs = { value: null as unknown }
  const eqCalls = { value: [] as Array<[string, unknown]> }

  const admin = {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.update = vi.fn((arg: unknown) => {
        updateArgs.value = arg
        return builder
      })
      builder.eq = vi.fn((col: string, val: unknown) => {
        eqCalls.value.push([col, val])
        return builder
      })
      builder.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
      return builder
    }),
    _updateArgs: updateArgs,
    _eqCalls: eqCalls,
  }
  return { requireOperator, revalidatePath, admin }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { updateStoreOaId } = await import('./mevo-stores')

function oaForm(oaId: string) {
  const fd = new FormData()
  fd.set('zalo_oa_id', oaId)
  return fd
}

describe('updateStoreOaId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin._updateArgs.value = null
    mocks.admin._eqCalls.value = []
    mocks.requireOperator.mockResolvedValue({ userId: 'u1', role: 'mevo_superadmin', storeId: null })
  })

  it('ghi zalo_oa_id đúng store', async () => {
    await updateStoreOaId('store-1', oaForm('  123456  '))
    expect(mocks.admin.from).toHaveBeenCalledWith('stores')
    expect(mocks.admin._updateArgs.value).toEqual({ zalo_oa_id: '123456' })
    expect(mocks.admin._eqCalls.value).toContainEqual(['id', 'store-1'])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/mevo/stores/store-1')
  })

  it('chuỗi rỗng → ghi null', async () => {
    await updateStoreOaId('store-1', oaForm('   '))
    expect(mocks.admin._updateArgs.value).toEqual({ zalo_oa_id: null })
  })

  it('chặn người không phải superadmin', async () => {
    mocks.requireOperator.mockResolvedValue({ userId: 'u1', role: 'store_owner', storeId: 'store-1' })
    await expect(updateStoreOaId('store-1', oaForm('123'))).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })
})
