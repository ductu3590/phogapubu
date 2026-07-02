'use server'

import { parseAccountPassword, parseAccountProfile } from '@/lib/account/validation'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateAccountProfile(formData: FormData) {
  await requireStoreOwnerStoreId()
  const { fullName, phone } = parseAccountProfile(formData)
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName || null,
      phone: phone || null,
    },
  })

  if (error) throw new Error(`updateAccountProfile: ${error.message}`)
  revalidatePath('/admin/account')
}

export async function updateAccountPassword(formData: FormData) {
  await requireStoreOwnerStoreId()
  const { currentPassword, password } = parseAccountPassword(formData)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    throw new Error('Không tìm thấy email đăng nhập')
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (signInError) {
    throw new Error('Mật khẩu hiện tại không đúng')
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) throw new Error(`updateAccountPassword: ${error.message}`)
  revalidatePath('/admin/account')
}
