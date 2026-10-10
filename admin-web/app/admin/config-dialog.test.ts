import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONFIG_TABS, visibleConfigTabs } from './config-dialog'
import { adminPathAllowed } from '@/lib/auth/roles'

// Mỗi tab của hộp thoại cấu hình phải có trang thật + route chặn trong slot @modal — thiếu route chặn
// thì bấm tab sẽ rời POS sang trang đầy đủ (mất POS đang chạy phía sau).
describe('hộp thoại cấu hình (ST-3)', () => {
  it('mọi tab có trang thật và route chặn @modal/(.)<trang>', () => {
    for (const tab of CONFIG_TABS) {
      const segment = tab.href.replace('/admin/', '')
      expect(existsSync(join(__dirname, segment, 'page.tsx')), `thiếu trang ${tab.href}`).toBe(true)
      expect(existsSync(join(__dirname, '@modal', '(config)', `(.)${segment}`, 'page.tsx')), `thiếu route chặn cho ${tab.href}`).toBe(true)
    }
  })

  it('POS, Bếp KHÔNG mở thành hộp thoại (Đặt bàn thì có, từ 2026-10-04)', () => {
    for (const segment of ['pos', 'kitchen']) {
      expect(existsSync(join(__dirname, '@modal', '(config)', `(.)${segment}`))).toBe(false)
    }
  })
})

describe('tab theo vai trò (PA-2)', () => {
  it('thu ngân chỉ thấy Đặt bàn · Thực đơn · Báo cáo · Tài khoản', () => {
    expect(visibleConfigTabs({ reservationsEnabled: true, role: 'store_cashier' }).map((t) => t.href))
      .toEqual(['/admin/reservations', '/admin/menu', '/admin/dashboard', '/admin/account'])
  })
  it('mọi tab thu ngân thấy đều là trang thu ngân được mở', () => {
    expect(visibleConfigTabs({ reservationsEnabled: true, role: 'store_cashier' }).every((t) => adminPathAllowed('store_cashier', t.href))).toBe(true)
  })
  it('chủ quán vẫn đủ 10 tab như cũ (9 nếu tắt đặt bàn)', () => {
    expect(visibleConfigTabs({ reservationsEnabled: true, role: 'store_owner' })).toHaveLength(10)
    expect(visibleConfigTabs({ reservationsEnabled: false, role: 'store_owner' })).toHaveLength(9)
  })
})
