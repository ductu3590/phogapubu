import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isBackOfficeRole, isPosRole, parseOperatorRow } from './roles'
import { CHANGE_PASSWORD_PATH, MUST_CHANGE_PASSWORD_ERROR, mustChangePassword } from './password-gate'

export type Operator =
  | { userId: string; role: 'mevo_superadmin'; storeId: null }
  | { userId: string; role: 'store_owner'; storeId: string }
  | { userId: string; role: 'store_staff'; storeId: string }
  | { userId: string; role: 'store_cashier'; storeId: string }
  | { userId: string; role: 'store_manager'; storeId: string }

// Người mở được trang /admin (đã loại phục vụ + superadmin, luôn có storeId).
export type AdminPageOperator = { userId: string; role: 'store_owner' | 'store_cashier' | 'store_manager'; storeId: string }

// cache(): MỘT lần hỏi phiên + quyền cho mỗi request. Layout, page, vỏ hộp thoại cấu hình và các
// hàm con đều gọi requireOperator… — trước đây mỗi lần là 2 chặng mạng tới Supabase (getUser + bảng
// mevo_operators), cộng dồn thành ~1 giây mỗi lần mở trang cấu hình (2026-10-04).
// mustChangePassword: cờ app_metadata (lib/auth/password-gate.ts) đọc từ getUser (bản mới nhất ở máy chủ Auth).
const loadOperator = cache(async function loadOperator(): Promise<
  { user: { id: string }; op: { role: string; store_id: string | null }; mustChangePassword: boolean } | null
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

  return { user: { id: user.id }, op, mustChangePassword: mustChangePassword(user.app_metadata) }
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
  // Còn cờ bắt đổi mật khẩu → mọi trang vận hành (layout /admin, /staff, /mevo, trang in) dừng ở đây. Proxy bỏ qua
  // request RSC (điều hướng mềm) nên chặn ở proxy là chưa đủ.
  if (loaded.mustChangePassword) redirect(CHANGE_PASSWORD_PATH)
  return operator
}

// Dùng trong Server Action — throw (action không redirect được khi gọi từ Client Component).
export async function requireOperator(): Promise<Operator> {
  const loaded = await loadOperator()
  if (!loaded) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  const operator = toOperator(loaded.user.id, loaded.op)
  if (!operator) throw new Error('Tài khoản chưa được cấp quyền vận hành')
  // Server action: proxy KHÔNG chặn request next-action (quyết định 2026-10-04) → từ chối ở đây. Mọi requireXxx
  // (chủ quán / POS / hậu cần / superadmin) đi qua hàm này.
  if (loaded.mustChangePassword) throw new Error(MUST_CHANGE_PASSWORD_ERROR)
  return operator
}

// Dùng trong action/page CHỈ dành cho /admin — fail closed nếu không phải store_owner.
export async function requireStoreOwnerStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner') throw new Error('Chỉ chủ quán mới thao tác được ở đây')
  return operator.storeId
}

// Thao tác POS / đặt bàn / báo cáo / bật tắt Tạm hết (PA-2): chủ quán, thu ngân HOẶC quản lý (mig 116).
// Giữ nguyên chữ thông báo lỗi cũ (UI + test đang so chuỗi).
// Chỉ để báo lỗi đẹp — RPC kiểm lại bằng is_store_pos_operator.
export async function requirePosOperatorStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (!isPosRole(operator.role)) throw new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây')
  return operator.storeId as string
}

// Hậu cần (kho, sổ thu chi, huỷ trả nợ, báo cáo tài chính): chủ quán HOẶC quản lý. Module KHO/CA/NO/BC bọc
// try/catch rồi trả { ok: false, error }. RPC kiểm lại bằng is_store_back_office.
export async function requireBackOfficeStoreId(): Promise<string> {
  const operator = await requireOperator()
  if (!isBackOfficeRole(operator.role)) throw new Error('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây')
  return operator.storeId as string
}

// Trang /admin:
//   'owner'       = chỉ chủ quán (thu ngân, quản lý bị đưa về POS);
//   'back_office' = chủ quán + quản lý (thu ngân về POS);
//   'pos'         = chủ quán + thu ngân + quản lý.
// Trang thu ngân được XEM (Kho, Thu chi, Công nợ, Báo cáo) dùng 'pos' rồi ẩn nút ghi theo vai; 'back_office' chỉ cho
// trang mà CHỈ chủ quán + quản lý được mở.
export async function requireAdminPageOrRedirect(
  area: 'owner' | 'pos' | 'back_office',
): Promise<AdminPageOperator> {
  const operator = await requireOperatorOrRedirect()
  if (operator.role === 'mevo_superadmin') redirect('/mevo')
  if (operator.role === 'store_staff') redirect('/staff/order')
  if (area === 'owner' && operator.role !== 'store_owner') redirect('/admin/pos')
  if (area === 'back_office' && !isBackOfficeRole(operator.role)) redirect('/admin/pos')
  return operator as AdminPageOperator
}

// Dùng trong layout khu /staff — cho phép store_staff, store_owner (vào để hỗ trợ/test), store_cashier
// (trang in hoá đơn 80mm nằm ở /print/bill — POS + Báo cáo mở nó) và store_manager (gọi món hộ).
// Superadmin bị đẩy về /mevo; không operator → /login. Trả về operator (đã loại superadmin, luôn có storeId).
export async function requireStaffAreaOrRedirect(): Promise<
  { userId: string; role: 'store_owner' | 'store_staff' | 'store_cashier' | 'store_manager'; storeId: string }
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
