import { describe, expect, it } from 'vitest'
import { deliveryIsStale, deliveryStatusLabel } from './reservation-delivery-status'

describe('reservation delivery status', () => {
  it('hàng đợi/đang gửi cũ hơn 120 giây cần kiểm tra, không hứa tự retry', () => {
    expect(deliveryIsStale('queued', '2026-01-01T00:00:00Z', Date.parse('2026-01-01T00:02:00Z'))).toBe(true)
    expect(deliveryStatusLabel('failed', false)).toBe('Gửi thất bại')
    expect(deliveryStatusLabel('processing', true)).toBe('Cần kiểm tra')
  })
})
