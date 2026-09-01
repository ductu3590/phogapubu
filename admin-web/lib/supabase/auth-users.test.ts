import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findAuthUserByEmail, listAllAuthUsers } from './auth-users'

// Giả lập listUsers() có phân trang thật của Supabase: trả đúng lát cắt theo page/perPage.
function makeAdmin(total: number) {
  const users = Array.from({ length: total }, (_, i) => ({
    id: `u${i}`,
    email: `user${i}@quan.vn`,
    last_sign_in_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }))
  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
    data: { users: users.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }))
  return { admin: { auth: { admin: { listUsers } } } as never, listUsers, users }
}

describe('listAllAuthUsers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lấy hết user khi vượt quá một trang', async () => {
    // 2500 user = 3 trang (1000/1000/500) — bản cũ gọi listUsers() trần chỉ thấy 50 user đầu.
    const { admin, listUsers } = makeAdmin(2500)
    const all = await listAllAuthUsers(admin)
    expect(all).toHaveLength(2500)
    expect(listUsers).toHaveBeenCalledTimes(3)
    expect(all[2499].email).toBe('user2499@quan.vn')
  })

  it('dừng ngay sau trang đầu khi ít user', async () => {
    const { admin, listUsers } = makeAdmin(3)
    const all = await listAllAuthUsers(admin)
    expect(all).toHaveLength(3)
    expect(listUsers).toHaveBeenCalledTimes(1)
  })

  it('báo lỗi thay vì trả danh sách thiếu', async () => {
    const admin = {
      auth: { admin: { listUsers: vi.fn(async () => ({ data: null, error: { message: 'boom' } })) } },
    } as never
    await expect(listAllAuthUsers(admin)).rejects.toThrow('boom')
  })
})

describe('findAuthUserByEmail', () => {
  it('tìm được email nằm ở trang thứ hai, không phân biệt hoa thường', async () => {
    const { admin } = makeAdmin(1500)
    const found = await findAuthUserByEmail(admin, '  USER1400@quan.vn ')
    expect(found?.id).toBe('u1400')
  })

  it('không có thì trả null', async () => {
    const { admin } = makeAdmin(10)
    expect(await findAuthUserByEmail(admin, 'khongco@quan.vn')).toBeNull()
  })
})
