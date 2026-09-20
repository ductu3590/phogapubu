import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AdminDesktopSidebar, { desktopSidebarWidthClass } from './admin-desktop-sidebar'

describe('AdminDesktopSidebar', () => {
  it('bắt đầu mở sidebar desktop và có nút thu gọn rõ ràng', () => {
    const html = renderToStaticMarkup(
      createElement(AdminDesktopSidebar, null, createElement('nav', null, 'Điều hướng')),
    )

    expect(html).toContain('data-collapsed="false"')
    expect(html).toContain('aria-label="Thu gọn sidebar"')
    expect(html).toContain('Điều hướng')
  })

  it('đổi đúng chiều rộng container khi thu gọn để main nhận lại bề ngang', () => {
    expect(desktopSidebarWidthClass(false)).toContain('md:w-60')
    expect(desktopSidebarWidthClass(true)).toContain('md:w-0')
  })
})
