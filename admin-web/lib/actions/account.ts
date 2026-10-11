'use server'

import { parseAccountPassword, parseAccountProfile } from '@/lib/account/validation'
import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type AccountResult = { ok: true } | { ok: false; error: string }

// Lỗi người dùng (nhập sai, mật khẩu cũ sai) TRẢ {ok,error} thay vì ném: Next prod giấu nội dung lỗi ném,
// người dùng chỉ thấy câu chung chung. Guard quyền (requireOperator) vẫn ném — đó là lỗi hệ thống, không phải nhập sai.
function userError(e: unknown, fallback: string): AccountResult {
  return { ok: false, error: e instanceof Error ? e.message : fallback }
}

// Chủ quán + thu ngân (PA-2) tự sửa tài khoản CỦA MÌNH — mọi lệnh dưới đây chỉ chạm user đang đăng nhập.
export async function updateAccountProfile(formData: FormData): Promise<AccountResult> {
  await requireOperator()
  let input
  try {
    input = parseAccountProfile(formData)
  } catch (e) {
    return userError(e, 'Thông tin không hợp lệ')
  }
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: input.fullName || null,
      phone: input.phone || null,
    },
  })

  if (error) return { ok: false, error: 'Không lưu được thông tin, thử lại sau' }
  revalidatePath('/admin/account')
  return { ok: true }
}

export async function updateAccountPassword(formData: FormData): Promise<AccountResult> {
  await requireOperator()
  let input
  try {
    input = parseAccountPassword(formData)
  } catch (e) {
    return userError(e, 'Mật khẩu không hợp lệ')
  }
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return { ok: false, error: 'Không tìm thấy email đăng nhập' }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: input.currentPassword,
  })
  if (signInError) return { ok: false, error: 'Mật khẩu hiện tại không đúng' }

  const { error } = await supabase.auth.updateUser({ password: input.password })
  if (error) return { ok: false, error: 'Không đổi được mật khẩu, thử lại sau' }
  revalidatePath('/admin/account')
  return { ok: true }
}
