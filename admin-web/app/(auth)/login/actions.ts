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

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id, is_active')
    .eq('user_id', data.user.id)
    .maybeSingle()

  // Nhân viên bị vô hiệu hoá (is_active=false) không đăng nhập được.
  const active = op?.is_active !== false
  const isValidSuperadmin = active && op?.role === 'mevo_superadmin' && op.store_id === null
  const isValidStoreOwner = active && op?.role === 'store_owner' && !!op.store_id
  const isValidStoreStaff = active && op?.role === 'store_staff' && !!op.store_id

  if (!isValidSuperadmin && !isValidStoreOwner && !isValidStoreStaff) {
    await supabase.auth.signOut()
    return { error: 'Tài khoản chưa được cấp quyền vận hành. Liên hệ MEVO để được cấp quyền.' }
  }

  // Không gọi redirect() trong Server Action được invoke từ Client Component —
  // React 19 sẽ treat NEXT_REDIRECT throw như unhandled error.
  // Trả về success + đích đến, để client tự navigate.
  const redirectTo = isValidSuperadmin ? '/mevo' : isValidStoreStaff ? '/staff/order' : '/admin'
  return { success: true, redirectTo }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
