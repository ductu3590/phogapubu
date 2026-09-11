import { describe, expect, it } from 'vitest'
import { applyWorkflowPreset, normalizeWorkflowSettings } from './workflow-settings'

describe('workflow presets', () => {
  it('Pubu giữ trả trước và tự xuống bếp', () => {
    const value = applyWorkflowPreset('pubu')

    expect(value).toMatchObject({
      paymentTiming: 'prepay',
      tableOrderingEnabled: true,
      takeawayEnabled: true,
      shippingEnabled: true,
      reservationsEnabled: false,
      kitchenReleasePolicy: 'automatic',
      staffOrderReleasePolicy: 'automatic',
    })
  })

  it('Bảo Lương tắt mang về/ship và chờ POS', () => {
    const value = applyWorkflowPreset('bao_luong')

    expect(value).toMatchObject({
      paymentTiming: 'postpay',
      tableOrderingEnabled: true,
      takeawayEnabled: false,
      shippingEnabled: false,
      reservationsEnabled: true,
      reservationPreorderEnabled: true,
      kitchenReleasePolicy: 'pos_confirmation',
      staffOrderReleasePolicy: 'pos_confirmation',
      tableSessionIdleTimeoutMinutes: 360,
      reservationPreorderEditCutoffMinutes: 30,
    })
  })

  it('tắt đặt bàn thì tắt hiệu lực preorder nhưng giữ giá trị nhập', () => {
    const value = normalizeWorkflowSettings({
      ...applyWorkflowPreset('bao_luong'),
      reservationsEnabled: false,
    })

    expect(value.effectiveReservationPreorderEnabled).toBe(false)
    expect(value.reservationPreorderEnabled).toBe(true)
  })
})
