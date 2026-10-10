import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isPosRole, parseOperatorRow } from './roles'

export type Operator =
  | { userId: string; role: 'mevo_superadmin'; storeId: null }
  | { userId: string; role: 'store_owner'; storeId: string }
  | { userId: string; role: 'store_staff'; storeId: string }
  | { userId: string; role: 'store_cashier'; storeId: string }

// cache(): MỘT lần hỏi phiên + quyền cho mỗi request. Layout, page, vỏ hộp thoại cấu hình và các
// hàm con đều gọi requireOperator… — trước đây mỗi lần là 2 chặng mạng tới Supabase (getUser + bảng
// mevo_operators), cộng dồn thành ~1 giây mỗi lần mở trang cấu hình (2026-10-04).
const loadOperator = cache(async function loadOperator(): Promise<
  { user: { id: string }; op: { role: string; store_id: string | null } } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('role, store_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle()
  // Nhân viên đã bị vô hiệu hoá (is_active=false) coi như không có quyền vận hành.
  if (!op || op.is_active === false) return null

  return { user: { id: user.id }, op }
})

function toOperator(userId: string, op: { role: string; store_id: string | null }): Operator | null {
  // Luật vai trò ở MỘT chỗ (lib/auth/roles.ts). is_active đã lọc ở loadOperator.
  const parsed = parseOperatorRow({ ...op, is_active: true })
  if (!parsed) return null
  return { userId, role: parsed.role, storeId: parsed.storeId } as Operator
}

// Dùng trong Server Component (page.tsx/layout.tsx) — redirect thay vì throw.
export async function requireOperatorOrRedirect(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) redirect('/login?error=not_operator')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) redirect('/login?error=not_operator')
  return operator
}

// Dùng trong Server Action — throw (action không redirect được khi gọi từ Client Component).
export async function requireOperator(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  return operator
}

// Dùng trong action/page CHỈ dành cho /admin — fail closed nếu không phải store_owner.
export async function requireStoreOwnerStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner') throw new Error('Chỉ chủ quán mới thao tác được ở đây')
  return operator.storeId
}

// Thao tác POS / đặt bàn / báo cáo / bật tắt Tạm hết (PA-2): chủ quán HOẶC thu ngân.
// Chỉ để báo lỗi đẹp — RPC kiểm lại bằng is_store_pos_operator.
export async function requirePosOperatorStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (!isPosRole(operator.role)) throw new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây')
  return operator.storeId as string
}

// Trang /admin: 'owner' = chỉ chủ quán (thu ngân bị đưa về POS), 'pos' = chủ quán + thu ngân.
export async function requireAdminPageOrRedirect(
  area: 'owner' | 'pos',
): Promise<{ userId: string; role: 'store_owner' | 'store_cashier'; storeId: string }> {
  const operator = await requireOperatorOrRedirect()
  if (operator.role === 'mevo_superadmin') redirect('/mevo')
  if (operator.role === 'store_staff') redirect('/staff/order')
  if (operator.role === 'store_cashier' && area === 'owner') redirect('/admin/pos')
  return operator as { userId: string; role: 'store_owner' | 'store_cashier'; storeId: string }
}

// Dùng trong layout khu /staff — cho phép store_staff, store_owner (vào để hỗ trợ/test) và store_cashier
// (trang in hoá đơn 80mm nằm ở /staff/tables/print — POS + Báo cáo mở nó).
// Superadmin bị đẩy về /mevo; không operator → /login. Trả về operator (đã loại superadmin, luôn có storeId).
export async function requireStaffAreaOrRedirect(): Promise<
  { userId: string; role: 'store_owner' | 'store_staff' | 'store_cashier'; storeId: string }
> {
  const operator = await requireOperatorOrRedirect()
  if (operator.role === 'mevo_superadmin') redirect('/mevo')
  return operator
}

// Dùng trong action/page CHỈ dành cho /mevo — fail closed nếu không phải superadmin MEVO.
export async function requireSuperadmin(): Promise<Extract<Operator, { role: 'mevo_superadmin' }>> {
  const operator = await requireOperator()
  if (operator.role !== 'mevo_superadmin') throw new Error('Chỉ MEVO superadmin mới thao tác được ở đây')
  return operator
}
