import type { createAdminClient } from './server'

export type AuthUserLite = {
  id: string
  email: string | null
  lastSignInAt: string | null
  createdAt: string | null
}

// `admin.auth.admin.listUsers()` của Supabase CÓ PHÂN TRANG — mặc định 50 user/trang.
// Gọi trần như trước đây thì qua mốc 50 tài khoản là im lặng sai: chỗ ghép email hiện
// "(không rõ email)", chỗ kiểm tra email tồn tại lại tưởng chưa có rồi tạo tài khoản trùng.
// Hàm này lặp hết trang nên mọi nơi cần "toàn bộ user Auth" phải đi qua đây.
export async function listAllAuthUsers(
  admin: ReturnType<typeof createAdminClient>
): Promise<AuthUserLite[]> {
  const perPage = 1000
  const maxPages = 100 // chặn vòng lặp vô hạn nếu API đổi hành vi phân trang
  const all: AuthUserLite[] = []

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listAllAuthUsers: ${error.message}`)

    const users = data?.users ?? []
    for (const u of users) {
      all.push({
        id: u.id,
        email: u.email ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
      })
    }
    if (users.length < perPage) break
  }

  return all
}

// Tra 1 email cụ thể trong toàn bộ user Auth (so sánh không phân biệt hoa thường).
export async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<AuthUserLite | null> {
  const needle = email.trim().toLowerCase()
  const users = await listAllAuthUsers(admin)
  return users.find((u) => u.email?.toLowerCase() === needle) ?? null
}
