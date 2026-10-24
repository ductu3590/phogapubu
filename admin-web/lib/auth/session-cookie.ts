// Có cookie phiên đăng nhập Supabase hay không (tên dạng `sb-<ref>-auth-token`, có thể chia mảnh `.0`, `.1`).
// Chỉ nhìn tên cookie, KHÔNG gọi mạng — dùng ở proxy cho trang chủ "/" để chủ quán/nhân viên đã đăng nhập
// vào mevo.vn thì được chuyển thẳng về khu làm việc như trước khi có landing.
export function hasSupabaseSessionCookie(cookies: ReadonlyArray<{ name: string }>): boolean {
  return cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
}
