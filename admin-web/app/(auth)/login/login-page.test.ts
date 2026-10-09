import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-10-09: đăng nhập xong mà chuyển MỀM (router.push) sang /admin → /admin/dashboard thì Next khớp route
// chặn @modal/(.)dashboard → hiện hộp thoại Báo cáo KHÔNG có trang nền, không đóng / không đổi tab được, F5 mới
// hết. Sau đăng nhập phải TẢI CỨNG trang đích.
describe('trang đăng nhập', () => {
  const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
  it('tải cứng trang đích sau khi đăng nhập', () => {
    expect(src).toMatch(/window\.location\.assign\(/)
  })
  it('không chuyển mềm bằng router.push', () => {
    expect(src).not.toMatch(/router\.push\(/)
  })
})
