'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error || !data.user) {
    return { error: 'Email hoặc mật khẩu không đúng' }
  }

  // Operator allowlist (Plan 2 — 2a): mật khẩu đúng nhưng không trong mevo_operators
  // → đăng xuất ngay và báo lỗi inline (không để lọt session, không redirect lòng vòng).
  const { data: op } = await supabase
    .from('mevo_operators')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (!op) {
    await supabase.auth.signOut()
    return { error: 'Tài khoản chưa được cấp quyền vận hành. Liên hệ MEVO để được cấp quyền.' }
  }

  // Không gọi redirect() trong Server Action được invoke từ Client Component —
  // vì React 19 sẽ treat NEXT_REDIRECT throw như unhandled error.
  // Trả về success và để client tự navigate.
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
