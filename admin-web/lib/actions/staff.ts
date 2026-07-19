'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { revalidatePath } from 'next/cache'

// Chủ quán tạo tài khoản nhân viên (role store_staff) cho ĐÚNG quán mình.
// Mô phỏng assignStoreOwner: tạo Supabase Auth user nếu email chưa có + sinh mật khẩu tạm
// (chỉ trả về 1 lần), rồi gắn mevo_operators role store_staff.
//
// store_id LẤY TỪ guard chủ quán (server-side), KHÔNG tin client — nhân viên/anon gọi thẳng
// action này sẽ bị requireStoreOwnerStoreId chặn trước mọi thao tác.
export async function createStoreStaff(formData: FormData): Promise<{ email: string; tempPassword: string | null }> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const email = (formData.get('email') as string).trim().toLowerCase()
  if (!email) throw new Error('Thiếu email nhân viên')

  const { data: existingList, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) throw new Error(`createStoreStaff(list): ${listErr.message}`)
  const existing = existingList.users.find((u) => u.email?.toLowerCase() === email)

  let userId: string
  let tempPassword: string | null = null
  if (existing) {
    userId = existing.id
    // Không được CHIẾM quyền một tài khoản đang là operator của quán/role khác (PK là user_id →
    // upsert sẽ ghi đè). Chỉ chấp nhận nếu chưa là operator, hoặc đã là staff của chính quán này.
    const { data: existingOp } = await admin
      .from('mevo_operators')
      .select('store_id, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (existingOp && !(existingOp.role === 'store_staff' && existingOp.store_id === storeId)) {
      throw new Error('Email này đã gắn với một tài khoản khác trong hệ thống, không thể thêm làm nhân viên.')
    }
  } else {
    tempPassword = crypto.randomUUID().slice(0, 12)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createErr || !created.user) throw new Error(`createStoreStaff(create): ${createErr?.message}`)
    userId = created.user.id
  }

  // is_active: true để việc thêm lại một nhân viên đã tắt cũng đồng thời BẬT lại quyền.
  const { error: opError } = await admin
    .from('mevo_operators')
    .upsert({ user_id: userId, store_id: storeId, role: 'store_staff', is_active: true })
  if (opError) throw new Error(`createStoreStaff(operator): ${opError.message}`)

  revalidatePath('/admin/staff')
  return { email, tempPassword }
}

// Bật/tắt nhân viên = đổi is_active (KHÔNG xoá row → bật lại được, giữ nguyên tài khoản).
// Nhân viên tắt mất quyền ngay cả ở tầng DB (helper RLS + staff_create_order đọc is_active — mig 029).
// Scope theo store_id + role store_staff nên chủ quán không đụng được operator quán/role khác.
export async function setStaffActive(userId: string, isActive: boolean): Promise<void> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('mevo_operators')
    .update({ is_active: isActive })
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .eq('role', 'store_staff')
  if (error) throw new Error(`setStaffActive: ${error.message}`)
  revalidatePath('/admin/staff')
}

// Danh sách nhân viên của quán (dùng bởi trang /admin/staff). Ghép email từ Auth.
export async function listStoreStaff(): Promise<Array<{ userId: string; email: string; isActive: boolean }>> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { data: ops, error } = await admin
    .from('mevo_operators')
    .select('user_id, is_active')
    .eq('store_id', storeId)
    .eq('role', 'store_staff')
  if (error) throw new Error(`listStoreStaff: ${error.message}`)

  const { data: userList, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) throw new Error(`listStoreStaff(users): ${listErr.message}`)
  const emailById = new Map(userList.users.map((u) => [u.id, u.email ?? '(không rõ email)']))

  return (ops ?? []).map((o) => ({
    userId: o.user_id as string,
    email: emailById.get(o.user_id as string) ?? '(không rõ email)',
    isActive: o.is_active !== false,
  }))
}
