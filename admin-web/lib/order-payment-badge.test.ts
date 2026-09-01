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

// mig 039 — đơn thuộc phiên bàn (quán trả sau)
describe('paymentBadge — đơn phiên bàn (mig 039)', () => {
  it('đơn phiên chưa thu → nhãn "Trả sau", KHÔNG đội lốt "Tiền mặt · chưa thu"', () => {
    expect(paymentBadge('cash', false, true)).toEqual({ label: '🪑 Trả sau · chưa thu', tone: 'pending' })
  })

  it('đơn phiên đã chốt bill → "Đã nhận tiền" (received thắng hasSession)', () => {
    expect(paymentBadge('cash', true, true)).toEqual({ label: '✓ Đã nhận tiền', tone: 'received' })
  })

  it('không truyền hasSession → giữ nguyên hành vi cũ', () => {
    expect(paymentBadge('cash', false)).toEqual({ label: '💵 Tiền mặt · chưa thu', tone: 'pending' })
  })
})
