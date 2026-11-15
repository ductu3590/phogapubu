import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PREPAY_PRESET, type StoreWorkflowSettings } from '@/lib/workflow-settings'
import WorkflowSettingsForm from './workflow-settings-form'

const onSave = () => vi.fn(async () => ({ ok: true as const }))
const render = (context: 'owner' | 'mevo', initial: StoreWorkflowSettings = PREPAY_PRESET) =>
  renderToStaticMarkup(createElement(WorkflowSettingsForm, { initial, context, onSave: onSave() }))

// Vị trí thẻ <input name="..."> so với <fieldset disabled> — trong fieldset disabled = chủ quán chỉ xem
function inLockedFieldset(html: string, name: string): boolean {
  const input = html.indexOf(`name="${name}"`)
  const open = html.indexOf('<fieldset disabled=""')
  const close = html.indexOf('</fieldset>')
  expect(input).toBeGreaterThan(-1)
  return open > -1 && input > open && input < close
}

describe('WorkflowSettingsForm', () => {
  it('render đủ các nhóm nghiệp vụ', () => {
    const html = render('mevo')
    for (const heading of [
      'Nhận đơn và giờ phục vụ',
      'Kênh nhận đơn',
      'Duyệt đơn và bếp',
      'Đặt bàn',
      'Phiên bàn/mâm',
      'Món đặt trước',
    ]) {
      expect(html).toContain(heading)
    }
  })

  it('không nhắc tên quán nào ở cả /admin lẫn /mevo', () => {
    for (const context of ['owner', 'mevo'] as const) {
      const html = render(context)
      expect(html).not.toMatch(/Pubu|Bảo Lương/i)
    }
  })

  it('/mevo: có ba mẫu điền nhanh đặt tên theo mô hình', () => {
    const html = render('mevo')
    expect(html).toContain('Tự động vào bếp, có Mang về và Ship')
    expect(html).toContain('Trả sau, POS duyệt')
    expect(html).toContain('Tùy chỉnh')
    expect(html).toContain('Bạn đang cấu hình thay mặt quán')
  })

  it('/mevo: superadmin sửa được mọi mục (không có fieldset khoá)', () => {
    const html = render('mevo')
    expect(html).not.toContain('<fieldset disabled=""')
    expect(inLockedFieldset(html, 'tableOrderingEnabled')).toBe(false)
    expect(html).not.toContain('Các mục dưới đây chỉ MEVO sửa được')
  })

  it('/admin: chủ quán không thấy mẫu điền nhanh', () => {
    const html = render('owner')
    expect(html).not.toContain('Tự động vào bếp, có Mang về và Ship')
    expect(html).not.toContain('Trả sau, POS duyệt')
    expect(html).not.toContain('aria-pressed')
  })

  it('/admin: chủ quán chỉ xem các mục khoá, vẫn sửa Đang nhận đơn + Giờ phục vụ', () => {
    const html = render('owner', { ...PREPAY_PRESET, servingHours: [{ open: '16:00', close: '23:00' }] })
    expect(html).toContain('Các mục dưới đây chỉ MEVO sửa được')
    for (const locked of [
      'tableOrderingEnabled', 'takeawayEnabled', 'shippingEnabled', 'reservationsEnabled',
      'paymentMethodZalo', 'paymentMethodCash', 'openOrderingOnArrival', 'tableSessionIdleTimeoutMinutes',
      'minimumAdvanceMinutes', 'reservationPreorderEditCutoffMinutes',
    ]) {
      expect(inLockedFieldset(html, locked), locked).toBe(true)
    }
    expect(inLockedFieldset(html, 'isAcceptingOrders')).toBe(false)
    // ô giờ không có name: kiểm theo aria-label nằm trước fieldset khoá
    expect(html.indexOf('Giờ mở ca 1')).toBeLessThan(html.indexOf('<fieldset disabled=""'))
    // select thời điểm thanh toán / xuống bếp cũng nằm trong fieldset khoá
    expect(html.indexOf('Thời điểm thanh toán')).toBeGreaterThan(html.indexOf('<fieldset disabled=""'))
    expect(html.indexOf('Đơn khách xuống bếp')).toBeGreaterThan(html.indexOf('<fieldset disabled=""'))
  })

  it('khóa trường đặt bàn phụ thuộc nhưng vẫn render giá trị đã lưu', () => {
    const html = render('mevo')
    expect(html).toMatch(
      /<input(?=[^>]*name="reservationPreorderEnabled")(?=[^>]*disabled="")[^>]*>/,
    )
    expect(html).toMatch(
      /<input(?=[^>]*name="minimumAdvanceMinutes")(?=[^>]*value="30")(?=[^>]*disabled="")[^>]*>/,
    )
  })

  it('quán automatic: hai ô policy giữ giá trị', () => {
    const html = render('mevo', { ...PREPAY_PRESET, kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic' })
    expect((html.match(/<option value="automatic" selected/g) ?? []).length).toBe(2)
    expect(html).not.toContain('Đang dùng phần mềm in')
  })
})
