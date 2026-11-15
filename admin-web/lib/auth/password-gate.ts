// Bắt buộc đổi mật khẩu sau lần đăng nhập đầu (YG 2026-11-12) — hàm thuần, test được.
//
// Cờ nằm ở `app_metadata.must_change_password` của user Supabase Auth: người dùng KHÔNG tự sửa được app_metadata
// (user_metadata thì sửa được qua auth.updateUser). Chỉ máy chủ (service role) bật / xoá cờ:
//   - bật: tạo tài khoản bằng mật khẩu tạm, superadmin / chủ quán đặt lại mật khẩu cho người khác;
//   - xoá: người dùng tự đặt mật khẩu mới ở trang CHANGE_PASSWORD_PATH.
// Đọc cờ từ `auth.getUser()` (lấy user mới nhất từ máy chủ Auth), KHÔNG đọc từ JWT — JWT cũ còn mang cờ cũ tới lúc làm mới.

import { homeForRole, type OperatorRole } from './roles'

export const CHANGE_PASSWORD_PATH = '/change-password'
export const MUST_CHANGE_PASSWORD_ERROR = 'Anh/chị cần đổi mật khẩu trước khi tiếp tục. Tải lại trang để đổi.'
export const MIN_PASSWORD_LENGTH = 8

/** Chỉ đúng `true` mới tính — thiếu cờ / false / chuỗi lạ = không bắt đổi (tài khoản cũ giữ nguyên hành vi). */
export function mustChangePassword(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== 'object') return false
  return (appMetadata as Record<string, unknown>).must_change_password === true
}

// Khu cần đăng nhập vận hành. /print/agent/* KHÔNG tính: phần mềm in mở bằng token, không có phiên người dùng.
const GATED_PREFIXES = ['/admin', '/staff', '/mevo', '/print'] as const

function isGatedPath(pathname: string): boolean {
  if (pathname === '/print/agent' || pathname.startsWith('/print/agent/')) return false
  return GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Cổng trang (proxy): người còn cờ mở trang vận hành hoặc /login → đưa tới trang đổi mật khẩu.
 * Trả `null` = không can thiệp. Trang đổi mật khẩu tự đưa người đã hết cờ về trang theo vai.
 */
export function passwordGateRedirect(pathname: string, mustChange: boolean): string | null {
  if (!mustChange) return null
  if (pathname === '/login' || isGatedPath(pathname)) return CHANGE_PASSWORD_PATH
  return null
}

/** Đích sau khi đăng nhập: còn cờ thì đổi mật khẩu trước, không thì trang thường theo vai. */
export function landingAfterLogin(role: OperatorRole, mustChange: boolean): string {
  return mustChange ? CHANGE_PASSWORD_PATH : homeForRole(role)
}

/**
 * Kiểm ô mật khẩu mới + nhập lại. Luật giống đặt lại mật khẩu nhân viên (≥ 8 ký tự, không dấu cách đầu/cuối).
 * "Không trùng mật khẩu cũ" do máy chủ Auth kiểm khi updateUser (mã lỗi `same_password`) — xem `passwordUpdateError`.
 */
export function parseNewPassword(
  formData: FormData,
): { ok: true; password: string } | { ok: false; error: string } {
  const raw = formData.get('password')
  const rawConfirm = formData.get('password_confirm')
  const password = typeof raw === 'string' ? raw : ''
  const confirm = typeof rawConfirm === 'string' ? rawConfirm : ''
  if (!password || !confirm) return { ok: false, error: 'Nhập mật khẩu mới ở cả hai ô' }
  if (password !== confirm) return { ok: false, error: 'Hai ô mật khẩu không khớp nhau' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên` }
  }
  if (password !== password.trim()) return { ok: false, error: 'Mật khẩu không được có dấu cách ở đầu hoặc cuối' }
  return { ok: true, password }
}

/** Đổi lỗi của supabase.auth.updateUser sang câu tiếng Việt cho người dùng. */
export function passwordUpdateError(error: { code?: string | null; message?: string | null }): string {
  if (error.code === 'same_password') return 'Mật khẩu mới phải khác mật khẩu đang dùng'
  if (error.code === 'weak_password') return 'Mật khẩu quá yếu, hãy chọn mật khẩu khó đoán hơn'
  if (error.code === 'reauthentication_needed') return 'Phiên đăng nhập đã cũ, hãy đăng xuất rồi đăng nhập lại'
  return 'Không đổi được mật khẩu, thử lại sau'
}
