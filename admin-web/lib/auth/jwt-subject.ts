// Đọc `sub` (id người dùng) trong access token Supabase mà KHÔNG xác thực chữ ký — chỉ để đoán trước id, chạy song
// song truy vấn quyền (mevo_operators) với supabase.auth.getUser() (chuyến mạng xác thực thật). Kết quả đoán chỉ được
// dùng khi trùng id getUser trả về (lib/auth/operator.ts); KHÔNG BAO GIỜ dùng nó để cấp quyền một mình.
export function jwtSubject(token: string | null | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const sub = (JSON.parse(json) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub ? sub : null
  } catch {
    return null
  }
}
