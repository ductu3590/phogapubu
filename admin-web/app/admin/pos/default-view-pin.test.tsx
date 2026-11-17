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
  it('dưới 2xl chữ chỉ ẩn bằng mắt (sr-only), vẫn nằm trong cây trợ năng; title giữ nguyên', () => {
    const pinned = renderToStaticMarkup(<DefaultViewPin view="floor" defaultView="floor" onPin={vi.fn()} />)
    expect(pinned).toContain('<span class="sr-only 2xl:not-sr-only">Mặc định máy này</span>')
    expect(pinned).toContain('title="Mặc định máy này"')
    const button = renderToStaticMarkup(<DefaultViewPin view="timeline" defaultView="floor" onPin={vi.fn()} />)
    expect(button).toContain('<span class="sr-only 2xl:not-sr-only">Đặt làm mặc định máy này</span>')
    expect(button).not.toContain('hidden 2xl:inline')
  })
  it('đang xem list → rỗng', () => {
    expect(renderToStaticMarkup(<DefaultViewPin view="list" defaultView="timeline" onPin={vi.fn()} />)).toBe('')
  })
})
