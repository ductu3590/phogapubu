'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { findAuthUserByEmail, listAllAuthUsers } from '@/lib/supabase/auth-users'
import { revalidatePath } from 'next/cache'

// Hai vai trò chủ quán tự tạo được (PA-2): nhân viên phục vụ (đặt hộ) và thu ngân (POS, thu tiền).
export type StoreTeamRole = 'store_staff' | 'store_cashier'
const TEAM_ROLES: StoreTeamRole[] = ['store_staff', 'store_cashier']
// Giá trị lạ từ form → nhân viên phục vụ (quyền thấp nhất). KHÔNG BAO GIỜ thành store_owner.
function parseTeamRole(v: unknown): StoreTeamRole {
  return v === 'store_cashier' ? 'store_cashier' : 'store_staff'
}

// Chủ quán tạo tài khoản nhân viên phục vụ / thu ngân cho ĐÚNG quán mình.
// Mô phỏng assignStoreOwner: tạo Supabase Auth user nếu email chưa có + sinh mật khẩu tạm
// (chỉ trả về 1 lần), rồi gắn mevo_operators role store_staff.
//
// store_id LẤY TỪ guard chủ quán (server-side), KHÔNG tin client — nhân viên/anon gọi thẳng
// action này sẽ bị requireStoreOwnerStoreId chặn trước mọi thao tác.
export async function createStoreStaff(formData: FormData): Promise<{ email: string; tempPassword: string | null }> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const email = (formData.get('email') as string).trim().toLowerCase()
  const role = parseTeamRole(formData.get('role'))
  if (!email) throw new Error('Thiếu email nhân viên')

  const existing = await findAuthUserByEmail(admin, email)

  let userId: string
  let tempPassword: string | null = null
  if (existing) {
    userId = existing.id
    // Không được CHIẾM quyền một tài khoản đang là operator của quán/role khác (PK là user_id →
    // upsert sẽ ghi đè). Chỉ chấp nhận nếu chưa là operator, hoặc đã là phục vụ/thu ngân của chính quán này.
    const { data: existingOp } = await admin
      .from('mevo_operators')
      .select('store_id, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (existingOp && !(TEAM_ROLES.includes(existingOp.role as StoreTeamRole) && existingOp.store_id === storeId)) {
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
    .upsert({ user_id: userId, store_id: storeId, role, is_active: true })
  if (opError) throw new Error(`createStoreStaff(operator): ${opError.message}`)

  revalidatePath('/admin/staff')
  return { email, tempPassword }
}

// Bật/tắt nhân viên = đổi is_active (KHÔNG xoá row → bật lại được, giữ nguyên tài khoản).
// Nhân viên tắt mất quyền ngay cả ở tầng DB (helper RLS + staff_create_order đọc is_active — mig 029).
// Scope theo store_id + role phục vụ/thu ngân nên chủ quán không đụng được operator quán/role khác.
export async function setStaffActive(userId: string, isActive: boolean): Promise<void> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('mevo_operators')
    .update({ is_active: isActive })
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .in('role', TEAM_ROLES)
  if (error) throw new Error(`setStaffActive: ${error.message}`)
  revalidatePath('/admin/staff')
}

// Danh sách nhân viên của quán (dùng bởi trang /admin/staff). Ghép email từ Auth.
export async function listStoreStaff(): Promise<Array<{ userId: string; email: string; isActive: boolean; role: StoreTeamRole }>> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { data: ops, error } = await admin
    .from('mevo_operators')
    .select('user_id, is_active, role')
    .eq('store_id', storeId)
    .in('role', TEAM_ROLES)
  if (error) throw new Error(`listStoreStaff: ${error.message}`)

  const authUsers = await listAllAuthUsers(admin)
  const emailById = new Map(authUsers.map((u) => [u.id, u.email ?? '(không rõ email)']))

  return (ops ?? []).map((o) => ({
    userId: o.user_id as string,
    email: emailById.get(o.user_id as string) ?? '(không rõ email)',
    isActive: o.is_active !== false,
    role: parseTeamRole(o.role),
  }))
}

// Đổi vai trò Nhân viên phục vụ ↔ Thu ngân. Chỉ đụng người phục vụ/thu ngân của ĐÚNG quán — không bao giờ
// đổi được chủ quán hay người quán khác. Trang web có hiệu lực ở lần tải kế tiếp của người đó; RPC thì ngay.
export async function setStaffRole(userId: string, role: StoreTeamRole): Promise<void> {
  const storeId = await requireStoreOwnerStoreId()
  const next = parseTeamRole(role)
  const { error } = await createAdminClient()
    .from('mevo_operators')
    .update({ role: next })
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .in('role', TEAM_ROLES)
  if (error) throw new Error(`setStaffRole: ${error.message}`)
  revalidatePath('/admin/staff')
}
