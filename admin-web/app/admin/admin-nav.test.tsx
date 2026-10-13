import { describe, expect, it } from 'vitest'
import { findActiveHref } from '@/components/ui/app-shell'
import { adminPathAllowed } from '@/lib/auth/roles'
import { adminBottomItems, adminNavGroups, adminRailItems } from './admin-nav'
import { CONFIG_TABS, settingsTabs } from './config-dialog'

const hrefs = (items: { href: string }[]) => items.map((i) => i.href)
const all = (reservations: boolean, kitchen = true, role: 'store_owner' | 'store_cashier' = 'store_owner') =>
  adminNavGroups(reservations, kitchen, role).flatMap((g) => hrefs(g.items))

describe('rail chủ quán — thanh icon dọc, không còn ô Thêm (2026-10-13)', () => {
  it('POS đứng đầu, mục hằng ngày trên rail; Nhân viên · Ưu đãi · Bảo mật nằm trong ⚙ Cài đặt', () => {
    expect(hrefs(adminRailItems(true, true))).toEqual([
      '/admin/pos', '/admin/kitchen', '/admin/reservations', '/admin/menu', '/admin/tables', '/admin/bills',
    ])
    expect(adminRailItems(true, true).find((i) => i.href === '/admin/bills')?.label).toBe('Báo cáo')
    expect(hrefs(adminBottomItems())).toEqual(['/admin/settings'])
  })

  it('đang ở Nhân viên / Ưu đãi / Bảo mật thì sáng nút ⚙ Cài đặt', () => {
    for (const p of ['/admin/staff', '/admin/vouchers', '/admin/account', '/admin/settings']) {
      expect(findActiveHref(p, adminNavGroups(true)), p).toBe('/admin/settings')
    }
  })

  it('nhãn chỉ 1–2 chữ cho vừa rail 76px', () => {
    for (const item of [...adminRailItems(true, true), ...adminBottomItems()]) {
      expect(item.label.replace(' & ', '&').split(' ').length, item.label).toBeLessThanOrEqual(2)
    }
  })

  it('quán thu ngân xác nhận rồi in phiếu (Bảo Lương) → ẩn Bếp; tắt đặt bàn → ẩn Đặt bàn', () => {
    expect(hrefs(adminRailItems(false, true))).not.toContain('/admin/kitchen')
    expect(hrefs(adminRailItems(true, false))).not.toContain('/admin/reservations')
  })

  it('không mất trang nào: rail + tab trong ⚙ Cài đặt phủ đủ mọi trang (quán bật đặt bàn + dùng màn bếp)', () => {
    expect(new Set([...all(true), ...settingsTabs('store_owner').map((t) => t.href)])).toEqual(new Set([
      '/admin/pos', '/admin/kitchen', '/admin/reservations', '/admin/menu', '/admin/tables',
      '/admin/bills', '/admin/staff', '/admin/vouchers', '/admin/account', '/admin/settings',
    ]))
  })

  it('mục cấu hình nào trên rail cũng mở được thành hộp thoại (có trong CONFIG_TABS)', () => {
    const config = new Set<string>(CONFIG_TABS.map((t) => t.href))
    for (const h of all(true)) {
      if (h === '/admin/pos' || h === '/admin/kitchen') continue
      expect(config.has(h), h).toBe(true)
    }
  })

  it('trang con vẫn sáng đúng mục cha', () => {
    expect(findActiveHref('/admin/pos/print-order', adminNavGroups(false))).toBe('/admin/pos')
    expect(findActiveHref('/admin/reservations', adminNavGroups(true))).toBe('/admin/reservations')
    expect(findActiveHref('/admin/settings', adminNavGroups(false))).toBe('/admin/settings')
  })
})

describe('thu ngân (PA-2)', () => {
  it('rail: POS · Món · Báo cáo; ⚙ Cài đặt = tài khoản của chính mình', () => {
    expect(hrefs(adminRailItems(true, true, 'store_cashier'))).toEqual(['/admin/pos', '/admin/menu', '/admin/bills'])
    expect(adminRailItems(true, true, 'store_cashier').map((i) => i.label)).toEqual(['POS', 'Món', 'Báo cáo'])
    expect(adminBottomItems('store_cashier')).toMatchObject([{ href: '/admin/account', label: 'Cài đặt' }])
  })

  it('mọi mục của thu ngân đều là trang thu ngân được mở', () => {
    expect(all(true, true, 'store_cashier').every((h) => adminPathAllowed('store_cashier', h))).toBe(true)
  })
})
