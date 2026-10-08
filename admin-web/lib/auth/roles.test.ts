import { describe, expect, it } from 'vitest'
import { adminPathAllowed, canEnterAdmin, canEnterStaffArea, homeForRole, isPosRole, parseOperatorRow, ROLE_LABEL } from './roles'

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
  it('admin: chủ quán + thu ngân; khu nhân viên: thêm cả thu ngân (in hoá đơn nằm ở /staff/tables/print)', () => {
    expect(canEnterAdmin('store_cashier')).toBe(true)
    expect(canEnterAdmin('store_staff')).toBe(false)
    expect(canEnterAdmin(null)).toBe(false)
    expect(canEnterStaffArea('store_cashier')).toBe(true)
    expect(canEnterStaffArea('mevo_superadmin')).toBe(false)
    expect(isPosRole('store_cashier')).toBe(true)
    expect(isPosRole('store_staff')).toBe(false)
  })
})

describe('trang admin thu ngân được mở', () => {
  it.each([
    ['/admin/pos', true], ['/admin/pos/print-order', true], ['/admin/dashboard', true],
    ['/admin/reservations', true], ['/admin/menu', true], ['/admin/account', true],
    ['/admin', false], ['/admin/settings', false], ['/admin/tables', false], ['/admin/staff', false],
    ['/admin/vouchers', false], ['/admin/spin', false], ['/admin/orders', false], ['/admin/kitchen', false],
    ['/admin/posx', false], ['/admin/menu-hack', false],
  ])('%s → %s', (path, ok) => {
    expect(adminPathAllowed('store_cashier', path)).toBe(ok)
  })
  it('chủ quán mở được mọi trang admin', () => {
    expect(adminPathAllowed('store_owner', '/admin/settings')).toBe(true)
  })
  it('nhãn tiếng Việt', () => {
    expect(ROLE_LABEL.store_cashier).toBe('Thu ngân')
    expect(ROLE_LABEL.store_staff).toBe('Nhân viên phục vụ')
  })
})
