import { describe, expect, it } from 'vitest'
import { findActiveHref } from '@/components/ui/app-shell'
import { adminMoreItems, adminNavGroups, adminRailItems } from './admin-nav'

const hrefs = (reservations: boolean, kitchen = true) => adminNavGroups(reservations, kitchen).flatMap((group) => group.items.map((item) => item.href))

describe('menu khu chủ quán (rail icon Stitch)', () => {
  it('rail giữ mục hằng ngày, POS đứng đầu; KHÔNG còn Đặt bàn trên rail', () => {
    expect(adminRailItems().map((item) => item.href)).toEqual([
      '/admin/pos', '/admin/kitchen', '/admin/menu', '/admin/orders', '/admin/dashboard',
    ])
  })

  it('quán thu ngân xác nhận rồi in phiếu (Bảo Lương) → ẩn Bếp', () => {
    expect(adminRailItems(false).map((item) => item.href)).not.toContain('/admin/kitchen')
  })

  it('Đặt bàn nằm trong ô Thêm, chỉ khi quán bật đặt bàn', () => {
    expect(adminMoreItems(true).map((item) => item.href)[0]).toBe('/admin/reservations')
    expect(adminMoreItems(false).map((item) => item.href)).not.toContain('/admin/reservations')
    expect(adminMoreItems(false).map((item) => item.href)).toEqual([
      '/admin/settings', '/admin/tables', '/admin/staff', '/admin/vouchers', '/admin/spin', '/admin/account',
    ])
  })

  it('không mất trang nào so với sidebar cũ (quán bật đặt bàn + dùng màn bếp)', () => {
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
