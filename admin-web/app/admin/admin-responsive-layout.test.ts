import { describe, expect, it } from 'vitest'
import {
  adminDesktopSidebarClass,
  adminMainClass,
  adminShellClass,
} from './admin-responsive-layout'

describe('admin responsive shell', () => {
  it('ẩn sidebar desktop dưới md để nội dung nhận toàn bộ chiều rộng điện thoại', () => {
    expect(adminDesktopSidebarClass).toContain('hidden')
    expect(adminDesktopSidebarClass).toContain('md:flex')
    expect(adminDesktopSidebarClass).toContain('md:w-60')
  })

  it('giữ main co được trong flex và dùng chiều cao màn hình động trên mobile', () => {
    expect(adminShellClass).toContain('min-h-dvh')
    expect(adminShellClass).toContain('md:h-screen')
    expect(adminMainClass).toContain('min-w-0')
    expect(adminMainClass).toContain('w-full')
  })
})
