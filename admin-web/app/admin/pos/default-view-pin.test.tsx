import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import DefaultViewPin from './default-view-pin'

describe('DefaultViewPin', () => {
  it('đang xem floor, mặc định timeline → nút đặt mặc định', () => {
    const html = renderToStaticMarkup(<DefaultViewPin view="floor" defaultView="timeline" onPin={vi.fn()} />)
    expect(html).toContain('<button')
    expect(html).toContain('Đặt làm mặc định máy này')
  })
  it('đang xem floor, mặc định floor → nhãn, không phải button', () => {
    const html = renderToStaticMarkup(<DefaultViewPin view="floor" defaultView="floor" onPin={vi.fn()} />)
    expect(html).toContain('Mặc định máy này')
    expect(html).not.toContain('<button')
  })
  it('chỉ icon ở mọi cỡ màn: chữ luôn sr-only (không not-sr-only), title giữ nguyên', () => {
    const pinned = renderToStaticMarkup(<DefaultViewPin view="floor" defaultView="floor" onPin={vi.fn()} />)
    expect(pinned).toContain('<span class="sr-only">Mặc định máy này</span>')
    expect(pinned).toContain('title="Mặc định máy này"')
    const button = renderToStaticMarkup(<DefaultViewPin view="timeline" defaultView="floor" onPin={vi.fn()} />)
    expect(button).toContain('<span class="sr-only">Đặt làm mặc định máy này</span>')
    expect(pinned + button).not.toContain('not-sr-only')
  })
  it('đang xem list → rỗng', () => {
    expect(renderToStaticMarkup(<DefaultViewPin view="list" defaultView="timeline" onPin={vi.fn()} />)).toBe('')
  })
})
