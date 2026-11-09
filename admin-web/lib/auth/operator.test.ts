import { beforeEach, describe, expect, it, vi } from 'vitest'

// requireSuperadmin giờ là cửa duy nhất của toàn khu /mevo — mọi action ở đó gọi nó,
// nên nó phải fail closed với đúng ba ca: không đăng nhập, sai role, tài khoản đã khoá.
const mocks = vi.hoisted(() => {
  const user = { value: null as null | { id: string } }
  const operatorRow = { value: null as null | { role: string; store_id: string | null; is_active: boolean } }

  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: user.value } })) },
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(async () => ({ data: operatorRow.value }))
      return builder
    }),
  }
  return { supabase, user, operatorRow }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => mocks.supabase) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) }) }))

const {
  requireAdminPageOrRedirect, requireBackOfficeStoreId, requirePosOperatorStoreId, requireStaffAreaOrRedirect,
  requireStoreOwnerStoreId, requireSuperadmin,
} = await import('./operator')

describe('requireSuperadmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.value = { id: 'u1' }
    mocks.operatorRow.value = { role: 'mevo_superadmin', store_id: null, is_active: true }
  })

  it('cho superadmin đi qua', async () => {
    await expect(requireSuperadmin()).resolves.toEqual({
      userId: 'u1',
      role: 'mevo_superadmin',
      storeId: null,
    })
  })

  it('chặn chủ quán', async () => {
    mocks.operatorRow.value = { role: 'store_owner', store_id: 'store-1', is_active: true }
    await expect(requireSuperadmin()).rejects.toThrow('superadmin')
  })

  it('chặn khi chưa đăng nhập', async () => {
    mocks.user.value = null
    await expect(requireSuperadmin()).rejects.toThrow('chưa được cấp quyền')
  })

  it('chặn tài khoản đã bị khoá', async () => {
    mocks.operatorRow.value = { role: 'mevo_superadmin', store_id: null, is_active: false }
    await expect(requireSuperadmin()).rejects.toThrow('chưa được cấp quyền')
  })
})

describe('thu ngân (PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.value = { id: 'c1' }
    mocks.operatorRow.value = { role: 'store_cashier', store_id: 's1', is_active: true }
  })

  it('requirePosOperatorStoreId cho thu ngân qua', async () => {
    await expect(requirePosOperatorStoreId()).resolves.toBe('s1')
  })

  it('nhân viên phục vụ bị chặn ở thao tác POS', async () => {
    mocks.operatorRow.value = { role: 'store_staff', store_id: 's1', is_active: true }
    await expect(requirePosOperatorStoreId()).rejects.toThrow('Chỉ chủ quán hoặc thu ngân')
  })

  it('trang chỉ dành cho chủ quán → thu ngân về /admin/pos', async () => {
    await expect(requireAdminPageOrRedirect('owner')).rejects.toThrow('REDIRECT:/admin/pos')
  })

  it('trang POS → thu ngân vào được', async () => {
    await expect(requireAdminPageOrRedirect('pos')).resolves.toEqual({ userId: 'c1', role: 'store_cashier', storeId: 's1' })
  })

  it('thu ngân đã bị vô hiệu hoá → về đăng nhập', async () => {
    mocks.operatorRow.value = { role: 'store_cashier', store_id: 's1', is_active: false }
    await expect(requireAdminPageOrRedirect('pos')).rejects.toThrow('REDIRECT:/login?error=not_operator')
  })
})

describe('quản lý (QL)', () => {
  const as = (role: string, isActive = true) => {
    mocks.operatorRow.value = { role, store_id: 's1', is_active: isActive }
  }
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.value = { id: 'm1' }
    as('store_manager')
  })

  it('requirePosOperatorStoreId và requireBackOfficeStoreId cho quản lý qua', async () => {
    await expect(requirePosOperatorStoreId()).resolves.toBe('s1')
    await expect(requireBackOfficeStoreId()).resolves.toBe('s1')
  })

  it('requireBackOfficeStoreId cho chủ quán qua', async () => {
    as('store_owner')
    await expect(requireBackOfficeStoreId()).resolves.toBe('s1')
  })

  it('requireStoreOwnerStoreId chặn quản lý và thu ngân', async () => {
    await expect(requireStoreOwnerStoreId()).rejects.toThrow('Chỉ chủ quán mới thao tác được ở đây')
    as('store_cashier')
    await expect(requireStoreOwnerStoreId()).rejects.toThrow('Chỉ chủ quán mới thao tác được ở đây')
  })

  it('requireBackOfficeStoreId chặn thu ngân, phục vụ, superadmin', async () => {
    for (const role of ['store_cashier', 'store_staff']) {
      as(role)
      await expect(requireBackOfficeStoreId()).rejects.toThrow('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây')
    }
    mocks.operatorRow.value = { role: 'mevo_superadmin', store_id: null, is_active: true }
    await expect(requireBackOfficeStoreId()).rejects.toThrow('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây')
  })

  it("trang 'owner' → quản lý về /admin/pos", async () => {
    await expect(requireAdminPageOrRedirect('owner')).rejects.toThrow('REDIRECT:/admin/pos')
  })

  it("trang 'pos' → quản lý vào được", async () => {
    await expect(requireAdminPageOrRedirect('pos')).resolves.toEqual({ userId: 'm1', role: 'store_manager', storeId: 's1' })
  })

  it("trang 'back_office' → quản lý, chủ quán vào; thu ngân về /admin/pos, phục vụ về /staff/order", async () => {
    await expect(requireAdminPageOrRedirect('back_office')).resolves.toEqual({ userId: 'm1', role: 'store_manager', storeId: 's1' })
    as('store_owner')
    await expect(requireAdminPageOrRedirect('back_office')).resolves.toEqual({ userId: 'm1', role: 'store_owner', storeId: 's1' })
    as('store_cashier')
    await expect(requireAdminPageOrRedirect('back_office')).rejects.toThrow('REDIRECT:/admin/pos')
    as('store_staff')
    await expect(requireAdminPageOrRedirect('back_office')).rejects.toThrow('REDIRECT:/staff/order')
  })

  it('khu nhân viên → quản lý vào được', async () => {
    await expect(requireStaffAreaOrRedirect()).resolves.toEqual({ userId: 'm1', role: 'store_manager', storeId: 's1' })
  })

  it('quản lý đã khoá → về đăng nhập', async () => {
    as('store_manager', false)
    await expect(requireAdminPageOrRedirect('pos')).rejects.toThrow('REDIRECT:/login?error=not_operator')
    await expect(requireBackOfficeStoreId()).rejects.toThrow('chưa được cấp quyền')
  })
})
