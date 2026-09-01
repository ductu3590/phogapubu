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
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { requireSuperadmin } = await import('./operator')

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
