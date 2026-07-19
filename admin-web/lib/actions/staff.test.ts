import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock hạ tầng: admin client (service role) + guard chủ quán + revalidatePath.
const mocks = vi.hoisted(() => {
  const requireStoreOwnerStoreId = vi.fn()
  const revalidatePath = vi.fn()

  // Chain builder cho supabase-js: from().select()/upsert()/update()/delete()/eq()...
  const operatorsRow = { value: null as null | { user_id: string; store_id: string; role: string } }
  const upsertArgs = { value: null as unknown }
  const updateArgs = { value: null as unknown }
  const eqCalls = { value: [] as Array<[string, unknown]> }

  const admin = {
    auth: {
      admin: {
        listUsers: vi.fn(),
        createUser: vi.fn(),
      },
    },
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.upsert = vi.fn((arg: unknown) => {
        upsertArgs.value = arg
        return Promise.resolve({ error: null })
      })
      builder.update = vi.fn((arg: unknown) => {
        updateArgs.value = arg
        return builder
      })
      builder.delete = vi.fn(() => builder)
      // .eq().eq().eq() — thu lại mọi cặp eq để test scope
      builder.eq = vi.fn((col: string, val: unknown) => {
        eqCalls.value.push([col, val])
        return builder
      })
      builder.maybeSingle = vi.fn(() => Promise.resolve({ data: operatorsRow.value, error: null }))
      // update/delete chain là thenable để `await` ra { error }
      builder.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
      return builder
    }),
    _operatorsRow: operatorsRow,
    _upsertArgs: upsertArgs,
    _updateArgs: updateArgs,
    _eqCalls: eqCalls,
  }

  return { requireStoreOwnerStoreId, revalidatePath, admin }
})

vi.mock('@/lib/auth/operator', () => ({
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => mocks.admin),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { createStoreStaff, setStaffActive } = await import('./staff')

function emailForm(email: string) {
  const fd = new FormData()
  fd.set('email', email)
  return fd
}

describe('createStoreStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin._operatorsRow.value = null
    mocks.admin._upsertArgs.value = null
    mocks.admin._eqCalls.value = []
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
    mocks.admin.auth.admin.listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    mocks.admin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'new-user' } },
      error: null,
    })
  })

  it('từ chối trước mọi thao tác khi không phải chủ quán', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Tài khoản chưa được cấp quyền vận hành'))
    await expect(createStoreStaff(emailForm('nv@x.vn'))).rejects.toThrow('chưa được cấp quyền')
    expect(mocks.admin.auth.admin.listUsers).not.toHaveBeenCalled()
  })

  it('gán role store_staff với store_id LẤY TỪ guard chủ quán, không tin client', async () => {
    await createStoreStaff(emailForm('NV@X.vn'))
    expect(mocks.admin._upsertArgs.value).toEqual({
      user_id: 'new-user',
      store_id: 'store-1', // từ requireStoreOwnerStoreId, không phải form
      role: 'store_staff',
      is_active: true,
    })
  })

  it('tạo user mới kèm mật khẩu tạm khi email chưa tồn tại và trả về 1 lần', async () => {
    const res = await createStoreStaff(emailForm('moi@x.vn'))
    expect(mocks.admin.auth.admin.createUser).toHaveBeenCalled()
    expect(res.email).toBe('moi@x.vn')
    expect(res.tempPassword).toBeTruthy()
  })

  it('KHÔNG chiếm quyền tài khoản đang là operator của quán/role khác', async () => {
    // Email này đã là chủ quán khác → tuyệt đối không được upsert đè thành staff quán mình
    mocks.admin.auth.admin.listUsers.mockResolvedValue({
      data: { users: [{ id: 'u-owner-b', email: 'ownerb@x.vn' }] },
      error: null,
    })
    mocks.admin._operatorsRow.value = { user_id: 'u-owner-b', store_id: 'store-2', role: 'store_owner' }
    await expect(createStoreStaff(emailForm('ownerb@x.vn'))).rejects.toThrow()
    expect(mocks.admin._upsertArgs.value).toBeNull() // không ghi gì
  })
})

describe('setStaffActive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admin._eqCalls.value = []
    mocks.admin._updateArgs.value = null
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
  })

  it('từ chối khi không phải chủ quán', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Tài khoản chưa được cấp quyền vận hành'))
    await expect(setStaffActive('some-user', false)).rejects.toThrow('chưa được cấp quyền')
  })

  it('tắt/bật có scope theo store_id + role store_staff (không đụng operator quán/role khác)', async () => {
    await setStaffActive('staff-user', false)
    expect(mocks.admin._updateArgs.value).toEqual({ is_active: false })
    const calls = mocks.admin._eqCalls.value
    expect(calls).toContainEqual(['user_id', 'staff-user'])
    expect(calls).toContainEqual(['store_id', 'store-1'])
    expect(calls).toContainEqual(['role', 'store_staff'])
  })

  it('bật lại nhân viên đã tắt (is_active=true)', async () => {
    await setStaffActive('staff-user', true)
    expect(mocks.admin._updateArgs.value).toEqual({ is_active: true })
  })
})
