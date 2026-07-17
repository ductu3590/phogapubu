import { describe, it, expect } from 'vitest'
import { hasRealMoney } from './revenue'

describe('hasRealMoney', () => {
  it('ZaloPay có trans_id → đã có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'zalopay', status: 'confirmed',
      zalopay_trans_id: 'ZP123', payment_received_at: null,
    })).toBe(true)
  })

  it('ZaloPay chưa có trans_id → chưa có tiền', () => {
    expect(hasRealMoney({
      payment_method: 'zalopay', status: 'pending',
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

  it('ZaloPay có trans_id nhưng cancelled → KHÔNG tính', () => {
    expect(hasRealMoney({
      payment_method: 'zalopay', status: 'cancelled',
      zalopay_trans_id: 'ZP123', payment_received_at: null,
    })).toBe(false)
  })
})
