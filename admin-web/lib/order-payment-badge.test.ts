import { describe, expect, it } from 'vitest'
import { paymentBadge } from './order-payment-badge'

describe('paymentBadge', () => {
  it('tiền mặt chưa thu → pending', () => {
    expect(paymentBadge('cash', false)).toEqual({ label: '💵 Tiền mặt · chưa thu', tone: 'pending' })
  })

  it('chuyển khoản chưa nhận → pending', () => {
    expect(paymentBadge('bank_transfer', false)).toEqual({ label: '🏦 Chuyển khoản · chưa nhận', tone: 'pending' })
  })

  it('đã nhận tiền (received=true) → received, bất kể phương thức', () => {
    expect(paymentBadge('cash', true)).toEqual({ label: '✓ Đã nhận tiền', tone: 'received' })
    expect(paymentBadge('bank_transfer', true).tone).toBe('received')
    expect(paymentBadge('zalo_checkout', true).tone).toBe('received')
  })

  it('ZaloPay chưa trả → chờ thanh toán', () => {
    expect(paymentBadge('zalo_checkout', false)).toEqual({ label: 'Chờ thanh toán', tone: 'pending' })
  })
})
