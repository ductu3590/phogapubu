import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AdminNav from './admin-nav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/dashboard',
}))

describe('AdminNav', () => {
  it('chỉ hiện Đặt bàn trong vận hành khi quán bật capability đặt bàn', () => {
    const enabled = renderToStaticMarkup(
      createElement(AdminNav, { reservationsEnabled: true } as never),
    )
    const disabled = renderToStaticMarkup(
      createElement(AdminNav, { reservationsEnabled: false } as never),
    )

    expect(enabled).toContain('Đặt bàn')
    expect(enabled).toContain('href="/admin/reservations"')
    expect(disabled).not.toContain('Đặt bàn')
  })
})
