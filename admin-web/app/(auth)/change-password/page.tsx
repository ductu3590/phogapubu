import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { homeForRole, parseOperatorRow } from '@/lib/auth/roles'
import { mustChangePassword } from '@/lib/auth/password-gate'
import ChangePasswordForm from './change-password-form'

// Màn bắt buộc đổi mật khẩu sau lần đăng nhập đầu (YG 2026-11-12). Nằm NGOÀI /admin, /staff, /mevo để guard của các
// khu đó (đẩy người còn cờ về đây) không tạo vòng lặp. Hết cờ → về trang thường theo vai.
export default async function ChangePasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle()
  const operator = parseOperatorRow(op)
  if (!operator) redirect('/login?error=not_operator')
  if (!mustChangePassword(user.app_metadata)) redirect(homeForRole(operator.role))

  return <ChangePasswordForm email={user.email ?? ''} />
}
