import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const user = { value: null as null | { id: string; app_metadata?: Record<string, unknown> } }
  const op = { value: null as null | { role: string; store_id: string | null; is_active: boolean } }
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: user.value } })),
      updateUser: vi.fn(async () => ({ data: {}, error: null as null | { code?: string } })),
    },
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      b.select = vi.fn(() => b)
      b.eq = vi.fn(() => b)
      b.maybeSingle = vi.fn(async () => ({ data: op.value }))
      return b
    }),
  }
  const updateUserById = vi.fn(async () => ({ data: {}, error: null as null | { message: string } }))
  return { supabase, user, op, updateUserById }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.supabase),
  createAdminClient: vi.fn(() => ({ auth: { admin: { updateUserById: mocks.updateUserById } } })),
}))

const { changeInitialPassword } = await import('./actions')

function form(password: string, confirm = password) {
  const fd = new FormData()
  fd.set('password', password)
  fd.set('password_confirm', confirm)
  return fd
}

describe('changeInitialPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.value = { id: 'u1', app_metadata: { provider: 'email', must_change_password: true } }
    mocks.op.value = { role: 'store_staff', store_id: 's1', is_active: true }
    mocks.supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null })
    mocks.updateUserById.mockResolvedValue({ data: {}, error: null })
  })

  it('đổi xong → gỡ cờ bằng service role và về trang theo vai', async () => {
    expect(await changeInitialPassword(form('MatKhauMoi1'))).toEqual({ ok: true, redirectTo: '/staff/order' })
    expect(mocks.supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'MatKhauMoi1' })
    expect(mocks.updateUserById).toHaveBeenCalledWith('u1', { app_metadata: { must_change_password: false } })
  })

  it('chủ quán về /admin', async () => {
    mocks.op.value = { role: 'store_owner', store_id: 's1', is_active: true }
    expect(await changeInitialPassword(form('MatKhauMoi1'))).toEqual({ ok: true, redirectTo: '/admin' })
  })

  it('trùng mật khẩu cũ → báo lỗi, KHÔNG gỡ cờ', async () => {
    mocks.supabase.auth.updateUser.mockResolvedValue({ data: {}, error: { code: 'same_password' } })
    expect(await changeInitialPassword(form('MatKhauCu12'))).toEqual({
      ok: false, error: 'Mật khẩu mới phải khác mật khẩu đang dùng',
    })
    expect(mocks.updateUserById).not.toHaveBeenCalled()
  })

  it('ô nhập sai → không gọi máy chủ Auth', async () => {
    expect(await changeInitialPassword(form('abcdefgh', 'abcdefgx'))).toEqual({
      ok: false, error: 'Hai ô mật khẩu không khớp nhau',
    })
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('không còn cờ → không cho đổi ở đây (phải qua trang Tài khoản, có hỏi mật khẩu hiện tại)', async () => {
    mocks.user.value = { id: 'u1', app_metadata: { must_change_password: false } }
    const res = await changeInitialPassword(form('MatKhauMoi1'))
    expect(res.ok).toBe(false)
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('chưa đăng nhập / không phải người vận hành → báo lỗi', async () => {
    mocks.user.value = null
    expect((await changeInitialPassword(form('MatKhauMoi1'))).ok).toBe(false)
    mocks.user.value = { id: 'u1', app_metadata: { must_change_password: true } }
    mocks.op.value = { role: 'store_staff', store_id: 's1', is_active: false }
    expect((await changeInitialPassword(form('MatKhauMoi1'))).ok).toBe(false)
    expect(mocks.supabase.auth.updateUser).not.toHaveBeenCalled()
  })
})
