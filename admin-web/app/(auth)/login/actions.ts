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
    .select('role, store_id')
    .eq('user_id', data.user.id)
    .maybeSingle()

  const isValidSuperadmin = op?.role === 'mevo_superadmin' && op.store_id === null
  const isValidStoreOwner = op?.role === 'store_owner' && !!op.store_id

  if (!isValidSuperadmin && !isValidStoreOwner) {
    await supabase.auth.signOut()
    return { error: 'Tài khoản chưa được cấp quyền vận hành. Liên hệ MEVO để được cấp quyền.' }
  }

  // Không gọi redirect() trong Server Action được invoke từ Client Component —
  // React 19 sẽ treat NEXT_REDIRECT throw như unhandled error.
  // Trả về success + đích đến, để client tự navigate.
  return { success: true, redirectTo: isValidSuperadmin ? '/mevo' : '/admin' }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
