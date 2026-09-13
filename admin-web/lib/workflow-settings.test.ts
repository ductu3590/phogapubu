import { describe, expect, it } from 'vitest'
import {
  BAO_LUONG_PRESET,
  PUBU_PRESET,
  applyWorkflowPreset,
  getWorkflowPresetKey,
  getWorkflowSettingsChanges,
  normalizeWorkflowSettings,
  workflowSettingsEqual,
  type StoreWorkflowSettings,
} from './workflow-settings'

const PUBU_EXPECTED: StoreWorkflowSettings = {
  paymentTiming: 'prepay',
  paymentMethods: ['zalo_checkout'],
  isAcceptingOrders: true,
  servingHours: [],
  tableOrderingEnabled: true,
  takeawayEnabled: true,
  shippingEnabled: true,
  reservationsEnabled: false,
  reservationPreorderEnabled: false,
  minimumAdvanceMinutes: 30,
  bookingHorizonDays: 7,
  slotIntervalMinutes: 15,
  defaultTableCapacity: 6,
  planningHoldMinutes: 180,
  kitchenReleasePolicy: 'automatic',
  staffOrderReleasePolicy: 'automatic',
  openOrderingOnArrival: true,
  tableSessionIdleTimeoutMinutes: 360,
  reservationPreorderEditCutoffMinutes: 30,
}

const BAO_LUONG_EXPECTED: StoreWorkflowSettings = {
  paymentTiming: 'postpay',
  paymentMethods: ['cash'],
  isAcceptingOrders: true,
  servingHours: [],
  tableOrderingEnabled: true,
  takeawayEnabled: false,
  shippingEnabled: false,
  reservationsEnabled: true,
  reservationPreorderEnabled: true,
  minimumAdvanceMinutes: 30,
  bookingHorizonDays: 7,
  slotIntervalMinutes: 15,
  defaultTableCapacity: 6,
  planningHoldMinutes: 180,
  kitchenReleasePolicy: 'pos_confirmation',
  staffOrderReleasePolicy: 'pos_confirmation',
  openOrderingOnArrival: true,
  tableSessionIdleTimeoutMinutes: 360,
  reservationPreorderEditCutoffMinutes: 30,
}

describe('workflow presets', () => {
  it('Pubu giữ đầy đủ cấu hình trả trước hiện tại', () => {
    expect(applyWorkflowPreset('pubu')).toEqual(PUBU_EXPECTED)
    expect(PUBU_PRESET).toEqual(PUBU_EXPECTED)
  })

  it('Bảo Lương có đầy đủ cấu hình POS kiểm soát', () => {
    expect(applyWorkflowPreset('bao_luong')).toEqual(BAO_LUONG_EXPECTED)
    expect(BAO_LUONG_PRESET).toEqual(BAO_LUONG_EXPECTED)
  })

  it('mỗi lần áp preset trả về các mảng độc lập', () => {
    const first = applyWorkflowPreset('pubu')
    const second = applyWorkflowPreset('pubu')

    first.paymentMethods.push('cash')
    first.servingHours.push({ open: '10:00', close: '22:00' })

    expect(second.paymentMethods).toEqual(['zalo_checkout'])
    expect(second.servingHours).toEqual([])
    expect(PUBU_PRESET.paymentMethods).toEqual(['zalo_checkout'])
    expect(PUBU_PRESET.servingHours).toEqual([])
  })

  it('hai hằng preset không chia sẻ mảng lồng', () => {
    expect(PUBU_PRESET.paymentMethods).not.toBe(BAO_LUONG_PRESET.paymentMethods)
    expect(PUBU_PRESET.servingHours).not.toBe(BAO_LUONG_PRESET.servingHours)
  })
})

describe('normalizeWorkflowSettings', () => {
  it('giữ preorder hiệu lực khi đặt bàn đang bật', () => {
    const value = normalizeWorkflowSettings(applyWorkflowPreset('bao_luong'))

    expect(value.reservationPreorderEnabled).toBe(true)
    expect(value.effectiveReservationPreorderEnabled).toBe(true)
  })

  it('chuẩn hóa tổ hợp không hợp lệ trước khi persist mà không mutate draft', () => {
    const draft = {
      ...applyWorkflowPreset('bao_luong'),
      reservationsEnabled: false,
    }

    const value = normalizeWorkflowSettings(draft)

    expect(value.reservationsEnabled).toBe(false)
    expect(value.reservationPreorderEnabled).toBe(false)
    expect(value.effectiveReservationPreorderEnabled).toBe(false)
    expect(draft.reservationPreorderEnabled).toBe(true)
  })

  it('clone sâu paymentMethods và servingHours khỏi draft', () => {
    const draft: StoreWorkflowSettings = {
      ...applyWorkflowPreset('bao_luong'),
      servingHours: [{ open: '10:00', close: '22:00' }],
    }

    const value = normalizeWorkflowSettings(draft)

    value.paymentMethods.push('zalo_checkout')
    value.servingHours[0].open = '11:00'

    expect(draft.paymentMethods).toEqual(['cash'])
    expect(draft.servingHours).toEqual([{ open: '10:00', close: '22:00' }])
  })
})

describe('workflow form state', () => {
  it('nhận diện preset theo toàn bộ snapshot, kể cả mảng lồng', () => {
    expect(getWorkflowPresetKey(PUBU_EXPECTED)).toBe('pubu')
    expect(getWorkflowPresetKey(BAO_LUONG_EXPECTED)).toBe('bao_luong')
    expect(
      getWorkflowPresetKey({
        ...PUBU_EXPECTED,
        servingHours: [{ open: '08:00', close: '22:00' }],
      }),
    ).toBe('custom')
  })

  it('liệt kê đúng thay đổi để preview và phát hiện draft chưa lưu', () => {
    const draft: StoreWorkflowSettings = {
      ...PUBU_EXPECTED,
      takeawayEnabled: false,
      bookingHorizonDays: 14,
    }

    expect(getWorkflowSettingsChanges(PUBU_EXPECTED, draft)).toEqual([
      {
        key: 'takeawayEnabled',
        label: 'Mang về',
        before: true,
        after: false,
      },
      {
        key: 'bookingHorizonDays',
        label: 'Khoảng ngày được đặt bàn',
        before: 7,
        after: 14,
      },
    ])
    expect(workflowSettingsEqual(PUBU_EXPECTED, draft)).toBe(false)
    expect(workflowSettingsEqual(PUBU_EXPECTED, { ...PUBU_EXPECTED })).toBe(true)
  })

  it('coi thứ tự phương thức và giờ phục vụ là một phần của snapshot', () => {
    const baseline: StoreWorkflowSettings = {
      ...PUBU_EXPECTED,
      paymentMethods: ['zalo_checkout', 'cash'],
      servingHours: [
        { open: '08:00', close: '11:00' },
        { open: '17:00', close: '22:00' },
      ],
    }
    const reordered: StoreWorkflowSettings = {
      ...baseline,
      paymentMethods: ['cash', 'zalo_checkout'],
    }

    expect(workflowSettingsEqual(baseline, reordered)).toBe(false)
    expect(getWorkflowSettingsChanges(baseline, reordered)).toEqual([
      {
        key: 'paymentMethods',
        label: 'Phương thức thanh toán',
        before: ['zalo_checkout', 'cash'],
        after: ['cash', 'zalo_checkout'],
      },
    ])
  })
})
