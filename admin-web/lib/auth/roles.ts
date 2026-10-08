// Luật vai trò vận hành (PA-2, 2026-10-08) — MỘT chỗ cho middleware, đăng nhập, guard server và nav.
// Thuần (không gọi mạng) để test được. RLS / RPC trong DB mới là khoá thật; đây là cổng UX.

export type OperatorRole = 'mevo_superadmin' | 'store_owner' | 'store_staff' | 'store_cashier'

export const ROLE_LABEL: Record<OperatorRole, string> = {
  mevo_superadmin: 'MEVO superadmin',
  store_owner: 'Chủ quán',
  store_staff: 'Nhân viên phục vụ',
  store_cashier: 'Thu ngân',
}

const STORE_ROLES = new Set<OperatorRole>(['store_owner', 'store_staff', 'store_cashier'])

export function parseOperatorRow(
  op: { role?: string | null; store_id?: string | null; is_active?: boolean | null } | null | undefined,
): { role: OperatorRole; storeId: string | null } | null {
  if (!op || op.is_active === false) return null
  if (op.role === 'mevo_superadmin') return op.store_id === null || op.store_id === undefined ? { role: 'mevo_superadmin', storeId: null } : null
  if (STORE_ROLES.has(op.role as OperatorRole) && op.store_id) return { role: op.role as OperatorRole, storeId: op.store_id }
  return null
}

export function homeForRole(role: OperatorRole): string {
  return { mevo_superadmin: '/mevo', store_owner: '/admin', store_staff: '/staff/order', store_cashier: '/admin/pos' }[role]
}

export function canEnterAdmin(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_cashier'
}

// Thu ngân vào được khu /staff vì trang in hoá đơn 80mm nằm ở /staff/tables/print (POS + Báo cáo mở nó).
export function canEnterStaffArea(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_staff' || role === 'store_cashier'
}

export function isPosRole(role: OperatorRole | null): boolean {
  return role === 'store_owner' || role === 'store_cashier'
}

/** Trang /admin thu ngân được mở (kể cả trang con). Thực đơn: chỉ có công tắc Tạm hết. */
export const CASHIER_ADMIN_PATHS = ['/admin/pos', '/admin/dashboard', '/admin/reservations', '/admin/menu', '/admin/account'] as const

export function adminPathAllowed(role: OperatorRole, pathname: string): boolean {
  if (role === 'store_owner') return true
  if (role !== 'store_cashier') return false
  return CASHIER_ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
