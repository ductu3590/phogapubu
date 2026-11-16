import { beforeEach, describe, expect, it, vi } from 'vitest'

// requireSuperadmin giờ là cửa duy nhất của toàn khu /mevo — mọi action ở đó gọi nó,
// nên nó phải fail closed với đúng ba ca: không đăng nhập, sai role, tài khoản đã khoá.
const mocks = vi.hoisted(() => {
  const user = { value: null as null | { id: string; app_metadata?: Record<string, unknown> } }
  const operatorRow = { value: null as null | { role: string; store_id: string | null; is_active: boolean } }

  // sub trong access token của cookie (getSession, không xác thực). null = không có phiên trong cookie.
  const tokenSub = { value: null as null | string }
  const operatorQueries: string[] = []
  const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: user.value } })),
      getSession: vi.fn(async () => ({
        data: { session: tokenSub.value ? { access_token: `${b64url({})}.${b64url({ sub: tokenSub.value })}.x` } : null },
      })),
    },
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      let userId = ''
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn((_c: string, v: string) => { userId = v; return builder })
      // Chỉ trả bản ghi quyền khi hỏi đúng id người dùng thật (như RLS operator_read_self)
      builder.maybeSingle = vi.fn(async () => {
        operatorQueries.push(userId)
        return { data: userId === user.value?.id ? operatorRow.value : null }
      })
      return builder
    }),
  }
  return { supabase, user, operatorRow, tokenSub, operatorQueries }
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

// Bắt đổi mật khẩu lần đầu (YG 2026-11-12): proxy bỏ qua request next-action / RSC nên guard dùng chung phải tự chặn.
describe('còn cờ must_change_password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.value = { id: 'u1', app_metadata: { must_change_password: true } }
  })

  it('server action của mọi vai bị từ chối bằng câu dễ hiểu', async () => {
    mocks.operatorRow.value = { role: 'store_owner', store_id: 'store-1', is_active: true }
    await expect(requireStoreOwnerStoreId()).rejects.toThrow('cần đổi mật khẩu')
    await expect(requirePosOperatorStoreId()).rejects.toThrow('cần đổi mật khẩu')
    await expect(requireBackOfficeStoreId()).rejects.toThrow('cần đổi mật khẩu')
    mocks.operatorRow.value = { role: 'mevo_superadmin', store_id: null, is_active: true }
    await expect(requireSuperadmin()).rejects.toThrow('cần đổi mật khẩu')
  })

  it('trang /admin, /staff bị đưa tới trang đổi mật khẩu', async () => {
    mocks.operatorRow.value = { role: 'store_owner', store_id: 'store-1', is_active: true }
    await expect(requireAdminPageOrRedirect('pos')).rejects.toThrow('REDIRECT:/change-password')
    mocks.operatorRow.value = { role: 'store_staff', store_id: 'store-1', is_active: true }
    await expect(requireStaffAreaOrRedirect()).rejects.toThrow('REDIRECT:/change-password')
  })

  it('cờ false / thiếu → đi qua như cũ', async () => {
    mocks.operatorRow.value = { role: 'store_owner', store_id: 'store-1', is_active: true }
    mocks.user.value = { id: 'u1', app_metadata: { must_change_password: false } }
    await expect(requireStoreOwnerStoreId()).resolves.toBe('store-1')
    mocks.user.value = { id: 'u1' }
    await expect(requireStoreOwnerStoreId()).resolves.toBe('store-1')
  })
})

describe('loadOperator — kiểm phiên và đọc quyền chạy song song (2026-11-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operatorQueries.length = 0
    mocks.user.value = { id: 'u1' }
    mocks.operatorRow.value = { role: 'store_owner', store_id: 'store-1', is_active: true }
  })

  it('token trong cookie đúng người → một lần hỏi quyền, chạy cùng lúc với getUser', async () => {
    mocks.tokenSub.value = 'u1'
    await expect(requireStoreOwnerStoreId()).resolves.toBe('store-1')
    expect(mocks.operatorQueries).toEqual(['u1'])
    expect(mocks.supabase.auth.getUser).toHaveBeenCalledTimes(1)
  })

  it('token mang id KHÁC người getUser xác thực → bỏ kết quả đoán, hỏi lại theo id thật', async () => {
    mocks.tokenSub.value = 'ke-gia-mao'
    await expect(requireStoreOwnerStoreId()).resolves.toBe('store-1')
    expect(mocks.operatorQueries).toEqual(['ke-gia-mao', 'u1'])
  })

  it('token có id nhưng getUser báo chưa đăng nhập → chặn, dù bản ghi đoán có quyền', async () => {
    mocks.tokenSub.value = 'u1'
    mocks.user.value = null
    await expect(requireStoreOwnerStoreId()).rejects.toThrow('chưa được cấp quyền')
  })

  it('không có phiên trong cookie → hỏi tuần tự như cũ', async () => {
    mocks.tokenSub.value = null
    await expect(requireStoreOwnerStoreId()).resolves.toBe('store-1')
    expect(mocks.operatorQueries).toEqual(['u1'])
  })
})
