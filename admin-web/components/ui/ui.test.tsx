import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { findActiveHref, isNavItemActive } from './app-shell'
import { Badge, TableStateLegend } from './badge'
import { Button } from './button'
import { getButtonClasses } from './button-classes'
import { ErrorState, EmptyState } from './feedback'
import { STATUS_TONE_CLASSES, TABLE_STATE, TABLE_STATE_ORDER } from './status'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

describe('bảng trạng thái bàn', () => {
  it('đúng nghĩa đã chốt 2026-10-02', () => {
    expect(TABLE_STATE.serving).toEqual({ label: 'Đang phục vụ', tone: 'success' })
    expect(TABLE_STATE.booked).toEqual({ label: 'Đã đặt', tone: 'accent' })
    expect(TABLE_STATE.pending).toEqual({ label: 'Chờ duyệt', tone: 'warning' })
    expect(TABLE_STATE.late).toEqual({ label: 'Trễ / xung đột', tone: 'critical' })
    expect(TABLE_STATE.free).toEqual({ label: 'Trống', tone: 'neutral' })
  })

  it('mỗi trạng thái một tông riêng, chú giải đủ cả năm', () => {
    const tones = TABLE_STATE_ORDER.map((state) => TABLE_STATE[state].tone)
    expect(new Set(tones).size).toBe(TABLE_STATE_ORDER.length)
    expect(TABLE_STATE_ORDER).toHaveLength(Object.keys(TABLE_STATE).length)
  })

  it('trạng thái không dùng token của nút; cam chỉ ở tông "đã đặt" (Pha 4, theo Stitch)', () => {
    for (const [tone, classes] of Object.entries(STATUS_TONE_CLASSES)) {
      const all = Object.values(classes).join(' ')
      expect(all).not.toMatch(/primary|brand/)
      if (tone !== 'accent') expect(all).not.toMatch(/orange/)
    }
    expect(TABLE_STATE.booked.tone).toBe('accent')
  })

  it('chú giải in nhãn chữ, không chỉ có màu', () => {
    const html = renderToStaticMarkup(createElement(TableStateLegend))
    for (const state of TABLE_STATE_ORDER) expect(html).toContain(TABLE_STATE[state].label)
  })
})

describe('menu điều hướng', () => {
  const groups = [
    { items: [{ href: '/admin', label: 'Điều hành', exact: true }, { href: '/admin/menu', label: 'Thực đơn' }] },
    { items: [{ href: '/admin/menu/categories', label: 'Danh mục' }] },
  ]

  it('chọn mục khớp dài nhất', () => {
    expect(findActiveHref('/admin/menu/categories/12', groups)).toBe('/admin/menu/categories')
    expect(findActiveHref('/admin/menu', groups)).toBe('/admin/menu')
    expect(findActiveHref('/admin', groups)).toBe('/admin')
  })

  it('mục exact không sáng ở trang con, và không nhầm tiền tố', () => {
    expect(isNavItemActive('/admin/menu', { href: '/admin', exact: true })).toBe(false)
    expect(isNavItemActive('/admin/menus', { href: '/admin/menu' })).toBe(false)
    expect(findActiveHref('/staff', groups)).toBeNull()
  })
})

describe('Button', () => {
  it('mặc định là nút viền', () => {
    expect(getButtonClasses()).toContain('border-border-strong')
    expect(getButtonClasses('primary')).toContain('bg-primary')
  })

  it('cỡ touch cao 48px cho POS', () => {
    expect(getButtonClasses('outline', 'touch')).toContain('min-h-12')
  })

  it('đang gửi: aria-busy, không disabled để giữ focus, chữ vẫn giữ chỗ', () => {
    const html = renderToStaticMarkup(<Button isLoading>Lưu</Button>)
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('disabled=""')
    expect(html).toContain('invisible')
    expect(html).toContain('Lưu')
  })
})

describe('trạng thái hiển thị', () => {
  it('badge mang đúng tông', () => {
    const html = renderToStaticMarkup(<Badge tone="warning">Chưa thu</Badge>)
    expect(html).toContain('bg-warning-bg')
    expect(html).toContain('Chưa thu')
  })

  it('rỗng là một dòng chữ; lỗi tải có role alert và nút Thử lại', () => {
    expect(renderToStaticMarkup(<EmptyState>Chưa có yêu cầu chờ xử lý.</EmptyState>)).toContain('<p')
    const error = renderToStaticMarkup(createElement(ErrorState, { title: 'Không tải được', onRetry: () => undefined }))
    expect(error).toContain('role="alert"')
    expect(error).toContain('Thử lại')
  })
})

describe('AppShell (thay khung /admin cũ)', () => {
  it('sidebar desktop ẩn dưới lg, có thanh trên + nút mở menu cho màn hẹp, main co được trong flex', async () => {
    const { AppShell } = await import('./app-shell')
    const html = renderToStaticMarkup(
      <AppShell brand={{ title: 'Bia lẩu Bảo Lương', subtitle: 'MEVO · Chủ quán' }} groups={[{ items: [{ href: '/admin', label: 'Điều hành' }] }]}>
        <p>Nội dung</p>
      </AppShell>,
    )
    expect(html).toContain('hidden w-68')
    expect(html).toContain('lg:flex')
    expect(html).toContain('aria-label="Mở menu"')
    expect(html).toContain('lg:hidden')
    expect(html).toContain('h-dvh')
    expect(html).toMatch(/<main[^>]*min-w-0/)
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('Bia lẩu Bảo Lương')
  })
})
