import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const op = { value: null as null | { role: string; store_id: string | null } }
  const supabase = {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      b.select = vi.fn(() => b)
      b.eq = vi.fn(() => b)
      b.maybeSingle = vi.fn(async () => ({ data: op.value }))
      return b
    }),
  }
  return { supabase, op }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => mocks.supabase) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { signIn } = await import('./actions')

function loginForm() {
  const fd = new FormData()
  fd.set('email', 'x@y.vn')
  fd.set('password', 'pw')
  return fd
}

describe('signIn routing theo role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.op.value = null
    mocks.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  })

  it('store_staff → /staff/order', async () => {
    mocks.op.value = { role: 'store_staff', store_id: 'store-1' }
    expect(await signIn(loginForm())).toEqual({ success: true, redirectTo: '/staff/order' })
  })

  it('store_owner → /admin', async () => {
    mocks.op.value = { role: 'store_owner', store_id: 'store-1' }
    expect(await signIn(loginForm())).toEqual({ success: true, redirectTo: '/admin' })
  })

  it('mevo_superadmin → /mevo', async () => {
    mocks.op.value = { role: 'mevo_superadmin', store_id: null }
    expect(await signIn(loginForm())).toEqual({ success: true, redirectTo: '/mevo' })
  })

  it('không có operator row → báo lỗi và signOut', async () => {
    mocks.op.value = null
    const res = await signIn(loginForm())
    expect(res.error).toContain('chưa được cấp quyền')
    expect(mocks.supabase.auth.signOut).toHaveBeenCalled()
  })

  it('store_staff nhưng thiếu store_id → bị từ chối', async () => {
    mocks.op.value = { role: 'store_staff', store_id: null }
    const res = await signIn(loginForm())
    expect(res.error).toContain('chưa được cấp quyền')
  })
})
