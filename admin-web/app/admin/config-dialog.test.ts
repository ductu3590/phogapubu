import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONFIG_TABS, settingsTabs } from './config-dialog'
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

describe('tab trong ⚙ Cài đặt (2026-10-13)', () => {
  it('chủ quán: Cài đặt chung · Nhân viên · Ưu đãi & Vòng quay · Bảo mật', () => {
    expect(settingsTabs('store_owner').map((t) => t.href))
      .toEqual(['/admin/settings', '/admin/staff', '/admin/vouchers', '/admin/account'])
  })
  it('thu ngân chỉ có Bảo mật (một tab → không hiện hàng tab), và mở được trang đó', () => {
    const tabs = settingsTabs('store_cashier')
    expect(tabs.map((t) => t.href)).toEqual(['/admin/account'])
    expect(tabs.every((t) => adminPathAllowed('store_cashier', t.href))).toBe(true)
  })
})
