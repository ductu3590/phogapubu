'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { homeForRole, parseOperatorRow } from '@/lib/auth/roles'
import { mustChangePassword, parseNewPassword, passwordUpdateError } from '@/lib/auth/password-gate'

export type ChangeInitialPasswordResult = { ok: true; redirectTo: string } | { ok: false; error: string }

const PASSWORD_CHANGED_RELOGIN_ERROR =
  'Đã đổi mật khẩu. Bấm Đăng xuất rồi đăng nhập lại bằng mật khẩu mới để tiếp tục.'

// Đổi mật khẩu bắt buộc lần đầu (YG 2026-11-12). Chỉ dành cho người CÒN cờ app_metadata.must_change_password —
// người đã hết cờ đổi mật khẩu ở trang Tài khoản (phải nhập mật khẩu hiện tại). Không gọi requireOperator: guard đó
// chặn đúng người còn cờ. TRẢ {ok,error}, không ném (Next prod giấu nội dung lỗi ném).
export async function changeInitialPassword(formData: FormData): Promise<ChangeInitialPasswordResult> {
  const input = parseNewPassword(formData)
  if (!input.ok) return input

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Phiên đăng nhập đã hết, hãy đăng nhập lại' }

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle()
  const operator = parseOperatorRow(op)
  if (!operator) return { ok: false, error: 'Tài khoản chưa được cấp quyền vận hành' }

  const home = homeForRole(operator.role)
  if (!mustChangePassword(user.app_metadata)) {
    return { ok: false, error: 'Tài khoản đã đổi mật khẩu rồi. Muốn đổi tiếp thì vào mục Tài khoản.' }
  }

  // Đổi bằng phiên của chính người dùng: máy chủ Auth tự từ chối mật khẩu trùng mật khẩu đang dùng (same_password).
  const { error } = await supabase.auth.updateUser({ password: input.password })
  if (error) return { ok: false, error: passwordUpdateError(error) }

  // Gỡ cờ bằng service role (người dùng không tự sửa được app_metadata). Admin API GỘP khoá app_metadata, không xoá
  // provider / providers.
  const { error: flagError } = await createAdminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { must_change_password: false },
  })
  if (flagError) {
    return { ok: false, error: 'Đã đổi mật khẩu nhưng chưa mở khoá được tài khoản. Báo MEVO để được hỗ trợ.' }
  }

  // Làm mới phiên NGAY: DB (mig 137) đọc cờ từ JWT, mà JWT đang cầm vẫn mang cờ cũ tới lần làm mới kế tiếp (≤ 1 giờ).
  // Không làm mới thì người vừa đổi xong vào POS sẽ thấy trống / bị từ chối. Cookie phiên mới ghi qua setAll của
  // client server (server action được ghi cookie); trình duyệt tải cứng sau đó nên client trình duyệt đọc phiên mới.
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    return { ok: false, error: PASSWORD_CHANGED_RELOGIN_ERROR }
  }

  return { ok: true, redirectTo: home }
}
