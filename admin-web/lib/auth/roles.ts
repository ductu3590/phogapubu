// Luật vai trò vận hành (PA-2, 2026-10-08) — MỘT chỗ cho middleware, đăng nhập, guard server và nav.
// Thuần (không gọi mạng) để test được. RLS / RPC trong DB mới là khoá thật; đây là cổng UX.

// store_manager (Quản lý, mig 116): mọi việc của thu ngân + hậu cần (kho, thu chi, công nợ, báo cáo tài chính),
// KHÔNG cấu hình quán.
export type OperatorRole = 'mevo_superadmin' | 'store_owner' | 'store_staff' | 'store_cashier' | 'store_manager'

export const ROLE_LABEL: Record<OperatorRole, string> = {
  mevo_superadmin: 'MEVO superadmin',
  store_owner: 'Chủ quán',
  store_staff: 'Nhân viên phục vụ',
  store_cashier: 'Thu ngân',
  store_manager: 'Quản lý',
}

const STORE_ROLES = new Set<OperatorRole>(['store_owner', 'store_staff', 'store_cashier', 'store_manager'])

export function parseOperatorRow(
  op: { role?: string | null; store_id?: string | null; is_active?: boolean | null } | null | undefined,
): { role: OperatorRole; storeId: string | null } | null {
  if (!op || op.is_active === false) return null
  if (op.role === 'mevo_superadmin') return op.store_id === null || op.store_id === undefined ? { role: 'mevo_superadmin', storeId: null } : null
  if (STORE_ROLES.has(op.role as OperatorRole) && op.store_id) return { role: op.role as OperatorRole, storeId: op.store_id }
  return null
}

export function homeForRole(role: OperatorRole): string {
  return { mevo_superadmin: '/mevo', store_owner: '/admin', store_staff: '/staff/order', store_cashier: '/admin/pos', store_manager: '/admin/pos' }[role]
}

export function canEnterAdmin(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_cashier' || role === 'store_manager'
}

// Thu ngân vào được khu /staff vì trang in hoá đơn 80mm nằm ở /print/bill (POS + Báo cáo mở nó).
// Quản lý vào để gọi món hộ ở /staff (staff_create_order nhận store_manager từ mig 116).
export function canEnterStaffArea(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_staff' || role === 'store_cashier' || role === 'store_manager'
}

export function isPosRole(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_cashier' || role === 'store_manager'
}

// Hậu cần (kho, sổ thu chi, huỷ trả nợ, báo cáo tài chính): khớp hàm SQL is_store_back_office (mig 116).
// Superadmin KHÔNG tính.
export function isBackOfficeRole(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_manager'
}

/**
 * Trang /admin thu ngân được mở (kể cả trang con). Thực đơn: chỉ có công tắc Tạm hết.
 * Báo cáo / Công nợ / Kho / Thu chi (hợp đồng chung YG 2026-11-09): thu ngân vào được, từng trang tự ẩn phần
 * ghi theo vai (kho chỉ xem tồn, thu chi chỉ phiếu của mình…). Trang nào thu ngân được XEM thì dùng guard trang
 * `requireAdminPageOrRedirect('pos')` và ẩn nút ghi theo vai; `'back_office'` chỉ dành cho trang mà CHỈ chủ quán +
 * quản lý được mở.
 */
export const CASHIER_ADMIN_PATHS = [
  '/admin/pos', '/admin/bills', '/admin/reservations', '/admin/menu', '/admin/account',
  '/admin/reports', '/admin/debts', '/admin/inventory', '/admin/cashbook',
] as const

/**
 * Trang /admin quản lý được mở = mọi trang thu ngân + 4 trang hậu cần. Hiện trùng với danh sách thu ngân vì thu ngân
 * cũng vào 4 trang đó (chỉ xem); tách tên để hai vai đổi riêng được. Không có Cài đặt / Nhân viên / Bàn & QR /
 * Ưu đãi / Bếp.
 */
export const MANAGER_ADMIN_PATHS: readonly string[] = Object.freeze([
  ...new Set<string>([...CASHIER_ADMIN_PATHS, '/admin/inventory', '/admin/cashbook', '/admin/debts', '/admin/reports']),
])

const pathIn = (paths: readonly string[], pathname: string) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))

export function adminPathAllowed(role: OperatorRole, pathname: string): boolean {
  if (role === 'store_owner') return true
  if (role === 'store_manager') return pathIn(MANAGER_ADMIN_PATHS, pathname)
  if (role === 'store_cashier') return pathIn(CASHIER_ADMIN_PATHS, pathname)
  return false
}
