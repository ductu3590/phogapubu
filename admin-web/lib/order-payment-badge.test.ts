import { describe, expect, it } from 'vitest'
import { paymentBadge } from './order-payment-badge'

describe('paymentBadge', () => {
  it('tiền mặt chưa xác nhận → chưa thu (pending)', () => {
    expect(paymentBadge({ paymentMethod: 'cash', paymentReceivedAt: null, zalopayTransId: null }))
      .toEqual({ label: '💵 Tiền mặt · chưa thu', tone: 'pending' })
  })

  it('chuyển khoản chưa xác nhận → chưa nhận (pending)', () => {
    expect(paymentBadge({ paymentMethod: 'bank_transfer', paymentReceivedAt: null, zalopayTransId: null }))
      .toEqual({ label: '🏦 Chuyển khoản · chưa nhận', tone: 'pending' })
  })

  it('đã xác nhận payment_received_at → đã nhận tiền (received)', () => {
    expect(paymentBadge({ paymentMethod: 'cash', paymentReceivedAt: '2026-07-20T10:00:00Z', zalopayTransId: null }).tone)
      .toBe('received')
  })

  it('ZaloPay có trans_id → đã nhận tiền', () => {
    expect(paymentBadge({ paymentMethod: 'zalopay', paymentReceivedAt: null, zalopayTransId: 'TX1' }).tone)
      .toBe('received')
  })

  it('ZaloPay chưa trả → chờ thanh toán', () => {
    expect(paymentBadge({ paymentMethod: 'zalopay', paymentReceivedAt: null, zalopayTransId: null }))
      .toEqual({ label: 'Chờ thanh toán', tone: 'pending' })
  })
})
