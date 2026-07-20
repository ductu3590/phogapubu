import { describe, expect, it } from 'vitest'
import { orderInKitchen, shouldAnnounceOrder } from './kitchen-announce'

describe('orderInKitchen', () => {
  it('đơn staff tiền mặt pending → vào bếp', () => {
    expect(orderInKitchen('pending', 'cash')).toBe(true)
  })

  it('đơn staff chuyển khoản pending → vào bếp (fix SA-3)', () => {
    expect(orderInKitchen('pending', 'bank_transfer')).toBe(true)
  })

  it('đơn ZaloPay pending (chưa trả tiền) → CHƯA vào bếp', () => {
    expect(orderInKitchen('pending', 'zalopay')).toBe(false)
  })

  it('mọi đơn confirmed → vào bếp (ví đã trả / chuyển khoản qua Zalo)', () => {
    expect(orderInKitchen('confirmed', 'zalopay')).toBe(true)
    expect(orderInKitchen('confirmed', 'bank_transfer')).toBe(true)
  })
})

describe('shouldAnnounceOrder', () => {
  it('báo lần đầu đơn chuyển khoản vào bếp', () => {
    expect(shouldAnnounceOrder('pending', 'bank_transfer', false)).toBe(true)
  })

  it('không báo lại nếu đã báo', () => {
    expect(shouldAnnounceOrder('pending', 'bank_transfer', true)).toBe(false)
  })
})
