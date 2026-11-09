import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/cash-shift', () => ({ saveRequireCashShift: vi.fn() }))

const { default: CashShiftSetting } = await import('./cash-shift-setting')

describe('CashShiftSetting', () => {
  it('có tiêu đề, nhãn công tắc và gợi ý', () => {
    const html = renderToStaticMarkup(createElement(CashShiftSetting, { initial: false }))
    expect(html).toContain('Ca thu ngân')
    expect(html).toContain('Bắt buộc mở ca trước khi thu tiền')
    expect(html).toContain('Bật thì thu ngân phải mở ca mới thu được tiền. Cuối ca đếm két và in phiếu bàn giao.')
    expect(html).toContain('role="switch"')
    expect(html).not.toMatch(/role="switch"[^>]*checked/)
  })
  it('giá trị đầu true → công tắc bật', () => {
    const html = renderToStaticMarkup(createElement(CashShiftSetting, { initial: true }))
    expect(html).toMatch(/<input[^>]*checked[^>]*role="switch"|<input[^>]*role="switch"[^>]*checked/)
  })
})
