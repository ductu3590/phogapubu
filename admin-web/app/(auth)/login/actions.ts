'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: 'Email hoặc mật khẩu không đúng' }
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
