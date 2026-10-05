import { describe, expect, it } from 'vitest'
import { storeInitials, storeStatus, workflowSummary } from './store-card'

describe('thẻ quán /mevo', () => {
  it('chữ viết tắt = từ đầu + từ cuối', () => {
    expect(storeInitials('Bia lẩu Bảo Lương')).toBe('BL')
    expect(storeInitials('Phở Gà PUBU')).toBe('PP')
    expect(storeInitials('Pubu')).toBe('P')
    expect(storeInitials('  ')).toBe('?')
  })

  it('mô hình vận hành viết bằng lời', () => {
    expect(workflowSummary({ paymentTiming: 'postpay', kitchenPolicy: 'pos_confirmation', reservationsEnabled: true }))
      .toBe('Trả sau · Thu ngân duyệt + in phiếu · Có đặt bàn')
    expect(workflowSummary({ paymentTiming: 'prepay', kitchenPolicy: 'automatic', reservationsEnabled: false }))
      .toBe('Trả trước · Màn hình bếp')
  })

  it('quán tạm dừng luôn báo đỏ, không theo trạng thái onboarding', () => {
    expect(storeStatus({ isActive: false, onboardingStatus: 'live' })).toEqual({ label: 'Tạm dừng', tone: 'critical' })
    expect(storeStatus({ isActive: true, onboardingStatus: null }).label).toBe('Chưa có hồ sơ app')
    expect(storeStatus({ isActive: true, onboardingStatus: 'live' }).tone).toBe('success')
  })
})
