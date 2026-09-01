import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperadmin = vi.fn()
  const revalidatePath = vi.fn()
  const listAllAuthUsers = vi.fn()

  const operators = { value: [] as unknown[] }
  const stores = { value: [] as unknown[] }
  const targetRow = { value: null as unknown }
  const updateUserById = vi.fn()

  const admin = {
    auth: { admin: { updateUserById } },
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      const rows = () => (table === 'stores' ? stores.value : operators.value)
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn(() => builder)
      builder.order = vi.fn(async () => ({ data: rows(), error: null }))
      builder.maybeSingle = vi.fn(async () => ({ data: targetRow.value, error: null }))
      // `await admin.from(...).select(...)` (không .order/.maybeSingle) ra thẳng data
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: rows(), error: null })
      return builder
    }),
  }

  return { requireSuperadmin, revalidatePath, listAllAuthUsers, admin, operators, stores, targetRow, updateUserById }
})

vi.mock('@/lib/auth/operator', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))
vi.mock('@/lib/supabase/auth-users', () => ({ listAllAuthUsers: mocks.listAllAuthUsers }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { listOperatorAccounts, resetOperatorPassword } = await import('./mevo-accounts')

function passwordForm(password: string, confirm = password) {
  const fd = new FormData()
  fd.set('password', password)
  fd.set('password_confirm', confirm)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSuperadmin.mockResolvedValue({ userId: 'me', role: 'mevo_superadmin', storeId: null })
  mocks.operators.value = []
  mocks.stores.value = []
  mocks.targetRow.value = { user_id: 'owner-1' }
  mocks.listAllAuthUsers.mockResolvedValue([])
  mocks.updateUserById.mockResolvedValue({ data: { user: { email: 'chuquan@quan.vn' } }, error: null })
})

describe('resetOperatorPassword', () => {
  it('đổi được mật khẩu cho tài khoản vận hành', async () => {
    const res = await resetOperatorPassword('owner-1', passwordForm('matkhaumoi123'))
    expect(mocks.updateUserById).toHaveBeenCalledWith('owner-1', { password: 'matkhaumoi123' })
    expect(res).toEqual({ email: 'chuquan@quan.vn' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/mevo/accounts')
  })

  it('chặn khi hai ô không khớp', async () => {
    await expect(resetOperatorPassword('owner-1', passwordForm('matkhau123', 'matkhau124'))).rejects.toThrow('không khớp')
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('chặn mật khẩu ngắn dưới 8 ký tự', async () => {
    await expect(resetOperatorPassword('owner-1', passwordForm('1234567'))).rejects.toThrow('8 ký tự')
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('chặn mật khẩu có dấu cách đầu/cuối (lỗi copy-paste)', async () => {
    await expect(resetOperatorPassword('owner-1', passwordForm('matkhau123 '))).rejects.toThrow('dấu cách')
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('chặn userId không nằm trong mevo_operators', async () => {
    // Ca quan trọng nhất: gửi thẳng userId lạ vào action để chiếm một tài khoản Auth bất kỳ.
    mocks.targetRow.value = null
    await expect(resetOperatorPassword('nguoi-la', passwordForm('matkhaumoi123'))).rejects.toThrow(
      'không phải tài khoản vận hành'
    )
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('chặn người không phải superadmin trước khi đụng vào gì', async () => {
    mocks.requireSuperadmin.mockRejectedValue(new Error('Chỉ MEVO superadmin mới thao tác được ở đây'))
    await expect(resetOperatorPassword('owner-1', passwordForm('matkhaumoi123'))).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })
})

describe('listOperatorAccounts', () => {
  beforeEach(() => {
    mocks.stores.value = [
      { id: 'store-1', name: 'Phở Gà Pubu' },
      { id: 'store-2', name: 'Quán chưa có ai' },
    ]
    mocks.operators.value = [
      { user_id: 'staff-1', store_id: 'store-1', role: 'store_staff', is_active: false },
      { user_id: 'owner-1', store_id: 'store-1', role: 'store_owner', is_active: true },
      { user_id: 'me', store_id: null, role: 'mevo_superadmin', is_active: true },
    ]
    mocks.listAllAuthUsers.mockResolvedValue([
      { id: 'owner-1', email: 'chuquan@quan.vn', lastSignInAt: '2026-08-30T02:15:00Z', createdAt: null },
      { id: 'staff-1', email: 'nhanvien@quan.vn', lastSignInAt: null, createdAt: null },
      { id: 'me', email: 'admin@mevo.vn', lastSignInAt: null, createdAt: null },
    ])
  })

  it('nhóm theo quán, chủ quán đứng trước nhân viên, MEVO xếp cuối', async () => {
    const groups = await listOperatorAccounts()
    expect(groups.map((g) => g.storeName)).toEqual(['Phở Gà Pubu', 'Quán chưa có ai', 'MEVO (nội bộ)'])
    expect(groups[0].accounts.map((a) => a.email)).toEqual(['chuquan@quan.vn', 'nhanvien@quan.vn'])
    expect(groups[1].accounts).toEqual([]) // quán chưa gán ai vẫn hiện — tín hiệu onboarding còn dở
  })

  it('ghép đúng email, trạng thái khoá, và đánh dấu tài khoản của chính mình', async () => {
    const groups = await listOperatorAccounts()
    const [owner, staff] = groups[0].accounts
    expect(owner).toMatchObject({ role: 'store_owner', isActive: true, isSelf: false })
    expect(staff).toMatchObject({ role: 'store_staff', isActive: false, isSelf: false })
    expect(groups[2].accounts[0]).toMatchObject({ email: 'admin@mevo.vn', isSelf: true })
  })

  it('hiện giờ đăng nhập cuối theo giờ Việt Nam, chưa đăng nhập thì nói rõ', async () => {
    const groups = await listOperatorAccounts()
    // 02:15 UTC = 09:15 giờ VN
    expect(groups[0].accounts[0].lastSignInText).toContain('09:15')
    expect(groups[0].accounts[1].lastSignInText).toBe('Chưa đăng nhập lần nào')
  })

  it('chặn người không phải superadmin', async () => {
    mocks.requireSuperadmin.mockRejectedValue(new Error('Chỉ MEVO superadmin mới thao tác được ở đây'))
    await expect(listOperatorAccounts()).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })
})
