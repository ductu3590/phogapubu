import { describe, expect, it } from 'vitest'
import { findActiveHref } from '@/components/ui/app-shell'
import { adminNavGroups } from './admin-nav'

const hrefs = (enabled: boolean) => adminNavGroups(enabled).flatMap((group) => group.items.map((item) => item.href))

describe('adminNavGroups', () => {
  it('chỉ hiện Đặt bàn trong vận hành khi quán bật capability đặt bàn', () => {
    expect(hrefs(true)).toContain('/admin/reservations')
    expect(hrefs(false)).not.toContain('/admin/reservations')
    const vanHanh = adminNavGroups(true).find((group) => group.label === 'Vận hành')
    expect(vanHanh?.items.map((item) => item.label)).toContain('Đặt bàn')
  })

  it('giữ đủ các mục cũ của sidebar chủ quán', () => {
    expect(hrefs(false)).toEqual([
      '/admin/dashboard', '/admin/pos', '/admin/orders', '/admin/kitchen',
      '/admin/menu', '/admin/vouchers', '/admin/spin',
      '/admin/settings', '/admin/tables', '/admin/staff', '/admin/account',
    ])
  })

  it('trang con vẫn sáng đúng mục cha', () => {
    expect(findActiveHref('/admin/pos/print-order', adminNavGroups(false))).toBe('/admin/pos')
    expect(findActiveHref('/admin/reservations', adminNavGroups(true))).toBe('/admin/reservations')
  })
})
