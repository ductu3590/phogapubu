import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/business-day', () => ({ saveBusinessDayStart: vi.fn() }))

const { default: BusinessDaySection } = await import('./business-day-section')

describe('BusinessDaySection', () => {
  const html = renderToStaticMarkup(createElement(BusinessDaySection, { initial: '05:30' }))

  it('có tiêu đề, nhãn và gợi ý', () => {
    expect(html).toContain('Ngày kinh doanh')
    expect(html).toContain('Giờ bắt đầu ngày')
    expect(html).toContain('Giao dịch trước giờ này tính vào ngày hôm trước. Đổi giờ thì báo cáo cũ cũng tính lại theo mốc mới.')
  })

  it('25 lựa chọn, đúng giá trị initial được chọn', () => {
    expect(html.match(/<option/g)).toHaveLength(25)
    expect(html.match(/<option[^>]*selected[^>]*>[^<]*</g)).toEqual([expect.stringContaining('05:30')])
  })

  it('nút Lưu tắt khi chưa đổi', () => {
    expect(html).toMatch(/<button[^>]*disabled/)
  })
})
