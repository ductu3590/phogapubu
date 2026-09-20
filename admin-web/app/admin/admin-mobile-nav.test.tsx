import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AdminMobileNav from './admin-mobile-nav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/reservations',
  redirect: vi.fn(),
}))

describe('AdminMobileNav', () => {
  it('có thanh điều hướng mobile và nút mở menu, không chiếm chiều rộng nội dung như sidebar desktop', () => {
    const html = renderToStaticMarkup(createElement(AdminMobileNav, {
      storeName: 'Bia lẩu Bảo Lương',
      reservationsEnabled: true,
      userEmail: 'baoluong@mevo.vn',
    }))

    expect(html).toContain('Bia lẩu Bảo Lương')
    expect(html).toContain('aria-label="Mở menu"')
    expect(html).toContain('md:hidden')
    expect(html).not.toContain('w-60')
  })
})
