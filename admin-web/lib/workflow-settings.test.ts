import { describe, expect, it } from 'vitest'
import {
  POSTPAY_POS_PRESET,
  PREPAY_PRESET,
  applyWorkflowPreset,
  getWorkflowPresetKey,
  getWorkflowSettingsChanges,
  normalizeWorkflowSettings,
  workflowSettingsEqual,
  type StoreWorkflowSettings,
} from './workflow-settings'

const PREPAY_EXPECTED: StoreWorkflowSettings = {
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

const POSTPAY_POS_EXPECTED: StoreWorkflowSettings = {
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
  it('mẫu Trả trước giữ đầy đủ cấu hình trả trước hiện tại', () => {
    expect(applyWorkflowPreset('prepay')).toEqual(PREPAY_EXPECTED)
    expect(PREPAY_PRESET).toEqual(PREPAY_EXPECTED)
  })

  it('mẫu Trả sau, POS duyệt có đầy đủ cấu hình POS kiểm soát', () => {
    expect(applyWorkflowPreset('postpay_pos')).toEqual(POSTPAY_POS_EXPECTED)
    expect(POSTPAY_POS_PRESET).toEqual(POSTPAY_POS_EXPECTED)
  })

  it('mỗi lần áp preset trả về các mảng độc lập', () => {
    const first = applyWorkflowPreset('prepay')
    const second = applyWorkflowPreset('prepay')

    first.paymentMethods.push('cash')
    first.servingHours.push({ open: '10:00', close: '22:00' })

    expect(second.paymentMethods).toEqual(['zalo_checkout'])
    expect(second.servingHours).toEqual([])
    expect(PREPAY_PRESET.paymentMethods).toEqual(['zalo_checkout'])
    expect(PREPAY_PRESET.servingHours).toEqual([])
  })

  it('hai hằng preset không chia sẻ mảng lồng', () => {
    expect(PREPAY_PRESET.paymentMethods).not.toBe(POSTPAY_POS_PRESET.paymentMethods)
    expect(PREPAY_PRESET.servingHours).not.toBe(POSTPAY_POS_PRESET.servingHours)
  })
})

describe('normalizeWorkflowSettings', () => {
  it('giữ preorder hiệu lực khi đặt bàn đang bật', () => {
    const value = normalizeWorkflowSettings(applyWorkflowPreset('postpay_pos'))

    expect(value.reservationPreorderEnabled).toBe(true)
    expect(value.effectiveReservationPreorderEnabled).toBe(true)
  })

  it('chuẩn hóa tổ hợp không hợp lệ trước khi persist mà không mutate draft', () => {
    const draft = {
      ...applyWorkflowPreset('postpay_pos'),
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
      ...applyWorkflowPreset('postpay_pos'),
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
    expect(getWorkflowPresetKey(PREPAY_EXPECTED)).toBe('prepay')
    expect(getWorkflowPresetKey(POSTPAY_POS_EXPECTED)).toBe('postpay_pos')
    expect(
      getWorkflowPresetKey({
        ...PREPAY_EXPECTED,
        servingHours: [{ open: '08:00', close: '22:00' }],
      }),
    ).toBe('custom')
  })

  it('liệt kê đúng thay đổi để preview và phát hiện draft chưa lưu', () => {
    const draft: StoreWorkflowSettings = {
      ...PREPAY_EXPECTED,
      takeawayEnabled: false,
      bookingHorizonDays: 14,
    }

    expect(getWorkflowSettingsChanges(PREPAY_EXPECTED, draft)).toEqual([
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
    expect(workflowSettingsEqual(PREPAY_EXPECTED, draft)).toBe(false)
    expect(workflowSettingsEqual(PREPAY_EXPECTED, { ...PREPAY_EXPECTED })).toBe(true)
  })

  it('coi thứ tự phương thức và giờ phục vụ là một phần của snapshot', () => {
    const baseline: StoreWorkflowSettings = {
      ...PREPAY_EXPECTED,
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
