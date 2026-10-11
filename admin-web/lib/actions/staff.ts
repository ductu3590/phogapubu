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

export type StaffMember = {
  userId: string
  email: string
  isActive: boolean
  role: StoreTeamRole
  lastSignInText: string
  createdText: string
}

// Format ở server theo giờ VN: để client tự format thì SSR và hydrate lệch múi giờ → cảnh báo hydration.
function formatVn(iso: string | null, empty: string, withTime: boolean): string {
  if (!iso) return empty
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso))
}

// Danh sách nhân viên của quán (dùng bởi trang /admin/staff). Ghép email + lần đăng nhập cuối từ Auth.
export async function listStoreStaff(): Promise<StaffMember[]> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()
  const { data: ops, error } = await admin
    .from('mevo_operators')
    .select('user_id, is_active, role')
    .eq('store_id', storeId)
    .in('role', TEAM_ROLES)
  if (error) throw new Error(`listStoreStaff: ${error.message}`)

  const authUsers = await listAllAuthUsers(admin)
  const authById = new Map(authUsers.map((u) => [u.id, u]))

  return (ops ?? []).map((o) => {
    const auth = authById.get(o.user_id as string)
    return {
      userId: o.user_id as string,
      email: auth?.email ?? '(không rõ email)',
      isActive: o.is_active !== false,
      role: parseTeamRole(o.role),
      lastSignInText: formatVn(auth?.lastSignInAt ?? null, 'Chưa đăng nhập', true),
      createdText: formatVn(auth?.createdAt ?? null, '—', false),
    }
  })
}

const MIN_PASSWORD_LENGTH = 8

// Chủ quán đặt lại mật khẩu cho nhân viên/thu ngân CỦA QUÁN MÌNH (không hỏi mật khẩu cũ).
// Chặn: (1) chỉ chủ quán gọi được; (2) userId đích phải là phục vụ/thu ngân của đúng store_id này —
// không đụng được chủ quán hay người quán khác; (3) hai ô khớp + đủ dài.
// TRẢ {ok,error} thay vì ném: Next prod giấu nội dung lỗi ném. Mật khẩu không bao giờ log/trả ngược.
export async function resetStaffPassword(
  userId: string,
  formData: FormData
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const storeId = await requireStoreOwnerStoreId()
  const admin = createAdminClient()

  const password = (formData.get('password') as string | null) ?? ''
  const confirm = (formData.get('password_confirm') as string | null) ?? ''
  if (!password || !confirm) return { ok: false, error: 'Nhập mật khẩu mới ở cả hai ô' }
  if (password !== confirm) return { ok: false, error: 'Hai ô mật khẩu không khớp nhau' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên` }
  }
  if (password !== password.trim()) {
    return { ok: false, error: 'Mật khẩu không được có dấu cách ở đầu hoặc cuối' }
  }

  const { data: target, error: targetError } = await admin
    .from('mevo_operators')
    .select('user_id')
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .in('role', TEAM_ROLES)
    .maybeSingle()
  if (targetError) return { ok: false, error: 'Không kiểm tra được tài khoản, thử lại sau' }
  if (!target) return { ok: false, error: 'Tài khoản này không phải nhân viên của quán anh' }

  const { data: updated, error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return { ok: false, error: 'Không đổi được mật khẩu, thử lại sau' }

  return { ok: true, email: updated.user?.email ?? '' }
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
