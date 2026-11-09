import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PUBU_PRESET } from '@/lib/workflow-settings'
import WorkflowSettingsForm from './workflow-settings-form'

describe('WorkflowSettingsForm', () => {
  it('render cùng năm nhóm nghiệp vụ và ba lựa chọn preset', () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowSettingsForm, {
        initial: PUBU_PRESET,
        context: 'owner',
        onSave: vi.fn(async () => undefined),
      }),
    )

    for (const heading of [
      'Kênh nhận đơn',
      'Duyệt đơn và bếp',
      'Đặt bàn',
      'Phiên bàn/mâm',
      'Món đặt trước',
    ]) {
      expect(html).toContain(heading)
    }
    expect(html).toContain('Trả trước như Pubu')
    expect(html).toContain('POS kiểm soát như Bảo Lương')
    expect(html).toContain('Tùy chỉnh')
  })

  it('khóa trường đặt bàn phụ thuộc nhưng vẫn render giá trị đã lưu', () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowSettingsForm, {
        initial: PUBU_PRESET,
        context: 'mevo',
        onSave: vi.fn(async () => undefined),
      }),
    )

    expect(html).toMatch(
      /<input(?=[^>]*name="reservationPreorderEnabled")(?=[^>]*disabled="")[^>]*>/,
    )
    expect(html).toMatch(
      /<input(?=[^>]*name="minimumAdvanceMinutes")(?=[^>]*value="30")(?=[^>]*disabled="")[^>]*>/,
    )
    expect(html).toContain('Bạn đang cấu hình thay mặt quán')
  })

  it('không có printMode: ô policy không bị khoá, không có lời giải thích', () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowSettingsForm, { initial: PUBU_PRESET, context: 'owner', onSave: vi.fn(async () => undefined) }),
    )
    expect(html).not.toContain('Đang dùng phần mềm in')
  })

  it('quán automatic: hai ô policy không bị khoá', () => {
    const html = renderToStaticMarkup(createElement(WorkflowSettingsForm, {
      initial: { ...PUBU_PRESET, kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic' },
      context: 'owner', onSave: vi.fn(async () => undefined) }))
    expect((html.match(/<option value="automatic" selected/g) ?? []).length).toBe(2)
    expect(html).not.toContain('Đang dùng phần mềm in')
  })
})
