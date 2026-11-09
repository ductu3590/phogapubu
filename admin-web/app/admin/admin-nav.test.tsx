import { describe, expect, it } from 'vitest'
import { findActiveHref } from '@/components/ui/app-shell'
import { adminPathAllowed, type OperatorRole } from '@/lib/auth/roles'
import { adminBottomItems, adminNavGroups, adminRailItems } from './admin-nav'
import { CONFIG_TABS, settingsTabs } from './config-dialog'

const hrefs = (items: { href: string }[]) => items.map((i) => i.href)
const all = (reservations: boolean, kitchen = true, role: OperatorRole = 'store_owner') =>
  adminNavGroups(reservations, kitchen, role).flatMap((g) => hrefs(g.items))

describe('rail chủ quán — thanh icon dọc, không còn ô Thêm (2026-10-13)', () => {
  it('POS đứng đầu, mục hằng ngày trên rail; Nhân viên · Ưu đãi · Bảo mật nằm trong ⚙ Cài đặt', () => {
    expect(hrefs(adminRailItems(true, true))).toEqual([
      '/admin/pos', '/admin/kitchen', '/admin/reservations', '/admin/menu', '/admin/tables', '/admin/bills', '/admin/reports',
      '/admin/cashbook', '/admin/inventory',
    ])
    expect(adminRailItems(true, true).find((i) => i.href === '/admin/cashbook')?.label).toBe('Thu chi')
    expect(adminRailItems(true, true).find((i) => i.href === '/admin/bills')?.label).toBe('Hoá đơn')
    expect(adminRailItems(true, true).find((i) => i.href === '/admin/reports')?.label).toBe('Báo cáo')
    expect(adminRailItems(true, true).find((i) => i.href === '/admin/inventory')?.label).toBe('Kho')
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
      '/admin/bills', '/admin/reports', '/admin/cashbook', '/admin/inventory', '/admin/staff', '/admin/vouchers', '/admin/account', '/admin/settings',
    ]))
  })

  it('mục cấu hình nào trên rail cũng mở được thành hộp thoại (có trong CONFIG_TABS)', () => {
    const config = new Set<string>(CONFIG_TABS.map((t) => t.href))
    for (const h of all(true)) {
      if (h === '/admin/pos' || h === '/admin/kitchen') continue
      expect(config.has(h), h).toBe(true)
    }
  })

  it('Báo cáo bán hàng mở thành hộp thoại, nhãn Hoá đơn tách khỏi Báo cáo', () => {
    expect(CONFIG_TABS.find((t) => t.href === '/admin/reports')?.label).toBe('Báo cáo')
    expect(CONFIG_TABS.find((t) => t.href === '/admin/bills')?.label).toBe('Hoá đơn')
    expect(findActiveHref('/admin/reports', adminNavGroups(false))).toBe('/admin/reports')
    expect(findActiveHref('/admin/bills', adminNavGroups(false))).toBe('/admin/bills')
  })

  it('trang con vẫn sáng đúng mục cha', () => {
    expect(findActiveHref('/admin/pos/print-order', adminNavGroups(false))).toBe('/admin/pos')
    expect(findActiveHref('/admin/reservations', adminNavGroups(true))).toBe('/admin/reservations')
    expect(findActiveHref('/admin/settings', adminNavGroups(false))).toBe('/admin/settings')
  })
})

describe('thu ngân (PA-2)', () => {
  it('rail: POS · Món · Hoá đơn · Báo cáo · Thu chi (phiếu của mình) · Kho (chỉ xem tồn); ⚙ Cài đặt = tài khoản của chính mình', () => {
    expect(hrefs(adminRailItems(true, true, 'store_cashier'))).toEqual(['/admin/pos', '/admin/menu', '/admin/bills', '/admin/reports', '/admin/cashbook', '/admin/inventory'])
    expect(adminRailItems(true, true, 'store_cashier').map((i) => i.label)).toEqual(['POS', 'Món', 'Hoá đơn', 'Báo cáo', 'Thu chi', 'Kho'])
    expect(adminBottomItems('store_cashier')).toMatchObject([{ href: '/admin/account', label: 'Cài đặt' }])
  })

  it('mọi mục của thu ngân đều là trang thu ngân được mở', () => {
    expect(all(true, true, 'store_cashier').every((h) => adminPathAllowed('store_cashier', h))).toBe(true)
  })
})

describe('quản lý (QL)', () => {
  it('rail: POS · Đặt bàn · Món · Hoá đơn · Báo cáo · Thu chi · Kho; không có Bếp, Bàn QR', () => {
    expect(hrefs(adminRailItems(true, true, 'store_manager'))).toEqual(['/admin/pos', '/admin/reservations', '/admin/menu', '/admin/bills', '/admin/reports', '/admin/cashbook', '/admin/inventory'])
    expect(hrefs(adminRailItems(true, false, 'store_manager'))).toEqual(['/admin/pos', '/admin/menu', '/admin/bills', '/admin/reports', '/admin/cashbook', '/admin/inventory'])
    expect(hrefs(adminRailItems(false, true, 'store_manager'))).toEqual(['/admin/pos', '/admin/reservations', '/admin/menu', '/admin/bills', '/admin/reports', '/admin/cashbook', '/admin/inventory'])
    expect(adminRailItems(true, true, 'store_manager').slice(-4).map((i) => i.label)).toEqual(['Hoá đơn', 'Báo cáo', 'Thu chi', 'Kho'])
    expect(adminBottomItems('store_manager')).toMatchObject([{ href: '/admin/account', label: 'Cài đặt' }])
  })

  it('mọi mục của quản lý đều là trang quản lý được mở', () => {
    expect(all(true, true, 'store_manager').every((h) => adminPathAllowed('store_manager', h))).toBe(true)
  })

  it('nút ⚙ của quản lý sáng ở Bảo mật, không trỏ Cài đặt quán', () => {
    expect(findActiveHref('/admin/account', adminNavGroups(true, true, 'store_manager'))).toBe('/admin/account')
    expect(all(true, true, 'store_manager')).not.toContain('/admin/settings')
  })
})
