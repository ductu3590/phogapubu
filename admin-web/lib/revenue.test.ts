import { describe, it, expect } from 'vitest'
import { hasRealMoney } from './revenue'

describe('hasRealMoney', () => {
  it('ZaloPay đã callback (payment_received_at) → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'zalo_checkout', status: 'confirmed',
      zalopay_trans_id: 'ZP123', payment_received_at: '2026-07-21T10:00:00Z',
    })).toBe(true)
  })

  it('ZaloPay chỉ có trans_id, CHƯA payment_received_at → chưa có tiền (bug §1.1: notify ≠ đã trả)', () => {
    expect(hasRealMoney({
      payment_method: 'zalo_checkout', status: 'confirmed',
      zalopay_trans_id: 'BANK:x', payment_received_at: null,
    })).toBe(false)
  })

  it('ZaloPay chưa có gì → chưa có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'zalo_checkout', status: 'pending',
      zalopay_trans_id: null, payment_received_at: null,
    })).toBe(false)
  })

  it('bank_transfer đã xác nhận → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'bank_transfer', status: 'ready',
      zalopay_trans_id: null, payment_received_at: '2026-07-15T10:00:00Z',
    })).toBe(true)
  })

  it('bank_transfer chưa xác nhận → chưa có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'bank_transfer', status: 'ready',
      zalopay_trans_id: null, payment_received_at: null,
    })).toBe(false)
  })

  it('cash legacy status=paid → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'cash', status: 'paid',
      zalopay_trans_id: null, payment_received_at: null,
    })).toBe(true)
  })

  it('cash đã xác nhận kiểu mới → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'cash', status: 'cooking',
      zalopay_trans_id: null, payment_received_at: '2026-07-15T10:00:00Z',
    })).toBe(true)
  })

  it('đơn cancelled dù đã xác nhận → KHÔNG tính', () => {
    expect(hasRealMoney({
      payment_method: 'bank_transfer', status: 'cancelled',
      zalopay_trans_id: null, payment_received_at: '2026-07-15T10:00:00Z',
    })).toBe(false)
  })
})
