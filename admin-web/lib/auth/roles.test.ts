import { describe, expect, it } from 'vitest'
import {
  adminPathAllowed, CASHIER_ADMIN_PATHS, canEnterAdmin, canEnterStaffArea, homeForRole, isBackOfficeRole, isPosRole,
  MANAGER_ADMIN_PATHS, parseOperatorRow, ROLE_LABEL,
} from './roles'

describe('đọc dòng mevo_operators', () => {
  it('đủ 4 vai trò, đúng ràng buộc store_id', () => {
    expect(parseOperatorRow({ role: 'mevo_superadmin', store_id: null, is_active: true })).toEqual({ role: 'mevo_superadmin', storeId: null })
    expect(parseOperatorRow({ role: 'store_owner', store_id: 's1', is_active: true })).toEqual({ role: 'store_owner', storeId: 's1' })
    expect(parseOperatorRow({ role: 'store_staff', store_id: 's1', is_active: true })).toEqual({ role: 'store_staff', storeId: 's1' })
    expect(parseOperatorRow({ role: 'store_cashier', store_id: 's1', is_active: true })).toEqual({ role: 'store_cashier', storeId: 's1' })
  })
  it('đã vô hiệu hoá / thiếu quán / vai trò lạ → null', () => {
    expect(parseOperatorRow({ role: 'store_cashier', store_id: 's1', is_active: false })).toBeNull()
    expect(parseOperatorRow({ role: 'store_cashier', store_id: null, is_active: true })).toBeNull()
    expect(parseOperatorRow({ role: 'mevo_superadmin', store_id: 's1', is_active: true })).toBeNull()
    expect(parseOperatorRow({ role: 'hacker', store_id: 's1', is_active: true })).toBeNull()
    expect(parseOperatorRow(null)).toBeNull()
  })
  it('is_active null coi như đang bật (giữ hành vi cũ)', () => {
    expect(parseOperatorRow({ role: 'store_owner', store_id: 's1', is_active: null })).toEqual({ role: 'store_owner', storeId: 's1' })
  })
})

describe('khu được vào', () => {
  it('thu ngân về thẳng POS', () => {
    expect(homeForRole('store_cashier')).toBe('/admin/pos')
    expect(homeForRole('store_owner')).toBe('/admin')
    expect(homeForRole('store_staff')).toBe('/staff/order')
    expect(homeForRole('mevo_superadmin')).toBe('/mevo')
  })
  it('admin: chủ quán + thu ngân; khu nhân viên: thêm cả thu ngân (in hoá đơn nằm ở /print/bill)', () => {
    expect(canEnterAdmin('store_cashier')).toBe(true)
    expect(canEnterAdmin('store_staff')).toBe(false)
    expect(canEnterAdmin(null)).toBe(false)
    expect(canEnterStaffArea('store_cashier')).toBe(true)
    expect(canEnterStaffArea('mevo_superadmin')).toBe(false)
    expect(isPosRole('store_cashier')).toBe(true)
    expect(isPosRole('store_staff')).toBe(false)
  })
})

describe('trang admin theo vai (QL)', () => {
  // Hợp đồng chung YG (2026-11-09): thu ngân cũng vào /admin/reports, /admin/debts, /admin/inventory, /admin/cashbook
  // (trang tự ẩn phần ghi theo vai). Bốn trang này do module BC/NO/KHO/CA dựng sau, ở đây chỉ mở đường.
  const PATHS: Array<[string, { owner: boolean; manager: boolean; cashier: boolean }]> = [
    ['/admin/pos', { owner: true, manager: true, cashier: true }],
    ['/admin/pos/print-order', { owner: true, manager: true, cashier: true }],
    ['/admin/bills', { owner: true, manager: true, cashier: true }],
    ['/admin/reservations', { owner: true, manager: true, cashier: true }],
    ['/admin/menu', { owner: true, manager: true, cashier: true }],
    ['/admin/account', { owner: true, manager: true, cashier: true }],
    ['/admin/reports', { owner: true, manager: true, cashier: true }],
    ['/admin/debts', { owner: true, manager: true, cashier: true }],
    ['/admin/inventory', { owner: true, manager: true, cashier: true }],
    ['/admin/inventory/receipts', { owner: true, manager: true, cashier: true }],
    ['/admin/cashbook', { owner: true, manager: true, cashier: true }],
    ['/admin/settings', { owner: true, manager: false, cashier: false }],
    ['/admin/staff', { owner: true, manager: false, cashier: false }],
    ['/admin/tables', { owner: true, manager: false, cashier: false }],
    ['/admin/vouchers', { owner: true, manager: false, cashier: false }],
    ['/admin/spin', { owner: true, manager: false, cashier: false }],
    ['/admin/orders', { owner: true, manager: false, cashier: false }],
    ['/admin/dashboard', { owner: true, manager: false, cashier: false }],
    ['/admin/kitchen', { owner: true, manager: false, cashier: false }],
    ['/admin', { owner: true, manager: false, cashier: false }],
    ['/admin/posx', { owner: true, manager: false, cashier: false }],
    ['/admin/inventoryx', { owner: true, manager: false, cashier: false }],
    ['/admin/menu-hack', { owner: true, manager: false, cashier: false }],
  ]
  it.each(PATHS)('%s', (path, ok) => {
    expect(adminPathAllowed('store_owner', path)).toBe(ok.owner)
    expect(adminPathAllowed('store_manager', path)).toBe(ok.manager)
    expect(adminPathAllowed('store_cashier', path)).toBe(ok.cashier)
    expect(adminPathAllowed('store_staff', path)).toBe(false)
    expect(adminPathAllowed('mevo_superadmin', path)).toBe(false)
  })
  it('MANAGER_ADMIN_PATHS chứa trọn CASHIER_ADMIN_PATHS và 4 trang hậu cần', () => {
    for (const p of CASHIER_ADMIN_PATHS) expect(MANAGER_ADMIN_PATHS).toContain(p)
    for (const p of ['/admin/inventory', '/admin/cashbook', '/admin/debts', '/admin/reports']) {
      expect(MANAGER_ADMIN_PATHS).toContain(p)
    }
    expect(new Set(MANAGER_ADMIN_PATHS).size).toBe(MANAGER_ADMIN_PATHS.length)
  })
  it('nhãn tiếng Việt', () => {
    expect(ROLE_LABEL.store_cashier).toBe('Thu ngân')
    expect(ROLE_LABEL.store_staff).toBe('Nhân viên phục vụ')
  })
})

describe('quản lý (QL)', () => {
  it('quản lý: đọc dòng, về POS, vào admin + khu nhân viên, là vai POS và back office', () => {
    expect(parseOperatorRow({ role: 'store_manager', store_id: 's1', is_active: true })).toEqual({ role: 'store_manager', storeId: 's1' })
    expect(parseOperatorRow({ role: 'store_manager', store_id: null, is_active: true })).toBeNull()
    expect(parseOperatorRow({ role: 'store_manager', store_id: 's1', is_active: false })).toBeNull()
    expect(homeForRole('store_manager')).toBe('/admin/pos')
    expect(canEnterAdmin('store_manager')).toBe(true)
    expect(canEnterStaffArea('store_manager')).toBe(true)
    expect(isPosRole('store_manager')).toBe(true)
    expect(isBackOfficeRole('store_manager')).toBe(true)
    expect(ROLE_LABEL.store_manager).toBe('Quản lý')
  })
  it('isBackOfficeRole: chỉ chủ quán và quản lý', () => {
    expect((['store_owner', 'store_manager', 'store_cashier', 'store_staff', 'mevo_superadmin', null] as const).map((r) => isBackOfficeRole(r)))
      .toEqual([true, true, false, false, false, false])
  })
})
