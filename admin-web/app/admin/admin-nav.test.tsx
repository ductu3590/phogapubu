import { describe, expect, it } from 'vitest'
import { findActiveHref } from '@/components/ui/app-shell'
import { adminMoreItems, adminNavGroups, adminRailItems } from './admin-nav'

const hrefs = (enabled: boolean) => adminNavGroups(enabled).flatMap((group) => group.items.map((item) => item.href))

describe('menu khu chủ quán (rail icon Stitch)', () => {
  it('chỉ hiện Đặt bàn trên rail khi quán bật capability đặt bàn', () => {
    expect(adminRailItems(true).map((item) => item.label)).toContain('Đặt bàn')
    expect(hrefs(false)).not.toContain('/admin/reservations')
  })

  it('rail giữ mục hằng ngày, POS đứng đầu; mục cấu hình nằm trong Thêm', () => {
    expect(adminRailItems(false).map((item) => item.href)).toEqual([
      '/admin/pos', '/admin/kitchen', '/admin/menu', '/admin/orders', '/admin/dashboard',
    ])
    expect(adminMoreItems().map((item) => item.href)).toEqual([
      '/admin/settings', '/admin/tables', '/admin/staff', '/admin/vouchers', '/admin/spin', '/admin/account',
    ])
  })

  it('không mất trang nào so với sidebar cũ', () => {
    expect(new Set(hrefs(true))).toEqual(new Set([
      '/admin/dashboard', '/admin/pos', '/admin/orders', '/admin/kitchen', '/admin/reservations',
      '/admin/menu', '/admin/vouchers', '/admin/spin',
      '/admin/settings', '/admin/tables', '/admin/staff', '/admin/account',
    ]))
  })

  it('trang con vẫn sáng đúng mục cha', () => {
    expect(findActiveHref('/admin/pos/print-order', adminNavGroups(false))).toBe('/admin/pos')
    expect(findActiveHref('/admin/reservations', adminNavGroups(true))).toBe('/admin/reservations')
  })
})
