import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperadmin = vi.fn()
  const revalidatePath = vi.fn()
  const updateArgs = { value: null as unknown }
  const upsertArgs = { value: null as unknown }
  const existingZaloConfig = { value: null as null | {
    zalo_oa_access_token: string | null
    zalo_app_secret_key: string | null
    zalo_oa_app_id: string | null
  } }
  const eqCalls = { value: [] as Array<[string, unknown]> }

  const admin = {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.update = vi.fn((arg: unknown) => {
        updateArgs.value = arg
        return builder
      })
      builder.upsert = vi.fn((arg: unknown) => {
        upsertArgs.value = arg
        return builder
      })
      builder.select = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(async () => ({ data: existingZaloConfig.value, error: null }))
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
  return { requireSuperadmin, revalidatePath, admin, upsertArgs, existingZaloConfig }
})

vi.mock('@/lib/auth/operator', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { updateStoreOaId, updateZaloConfig } = await import('./mevo-stores')

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
    mocks.upsertArgs.value = null
    mocks.existingZaloConfig.value = null
    mocks.requireSuperadmin.mockResolvedValue({ userId: 'u1', role: 'mevo_superadmin', storeId: null })
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
    // Guard nằm ở requireSuperadmin (lib/auth/operator) — nó throw thì action không được ghi gì.
    mocks.requireSuperadmin.mockRejectedValue(new Error('Chỉ MEVO superadmin mới thao tác được ở đây'))
    await expect(updateStoreOaId('store-1', oaForm('123'))).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })
})

function zaloConfigForm(token = '', secret = '', oaAppId = '') {
  const fd = new FormData()
  fd.set('zalo_oa_access_token', token)
  fd.set('zalo_app_secret_key', secret)
  fd.set('zalo_oa_app_id', oaAppId)
  return fd
}

describe('updateZaloConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upsertArgs.value = null
    mocks.existingZaloConfig.value = null
    mocks.requireSuperadmin.mockResolvedValue({ userId: 'u1', role: 'mevo_superadmin', storeId: null })
  })

  it('lần cấu hình đầu tiên bắt buộc có OA API App ID', async () => {
    await expect(updateZaloConfig('store-1', zaloConfigForm('new-token', 'new-secret'))).rejects.toThrow('OA API App ID')
    expect(mocks.upsertArgs.value).toBeNull()
  })

  it('để trống khi cập nhật không xóa credential cũ', async () => {
    mocks.existingZaloConfig.value = {
      zalo_oa_access_token: 'old-token',
      zalo_app_secret_key: 'old-secret',
      zalo_oa_app_id: 'old-oa-app',
    }
    await updateZaloConfig('store-1', zaloConfigForm())
    expect(mocks.upsertArgs.value).toEqual({ store_id: 'store-1', is_enabled: true })
  })

  it('credential và OA API App ID mới hợp lệ được lưu nhưng action không trả secret', async () => {
    const result = await updateZaloConfig('store-1', zaloConfigForm('new-token', 'new-secret', 'oa-parent-app'))
    expect(mocks.upsertArgs.value).toEqual({
      store_id: 'store-1',
      is_enabled: true,
      zalo_oa_access_token: 'new-token',
      zalo_app_secret_key: 'new-secret',
      zalo_oa_app_id: 'oa-parent-app',
    })
    expect(result).toBeUndefined()
  })
})
