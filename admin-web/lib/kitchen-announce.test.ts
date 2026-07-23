import { describe, expect, it } from 'vitest'
import { orderInKitchen, shouldAnnounceOrder, type KitchenPredicateFields } from './kitchen-announce'

const o = (p: Partial<KitchenPredicateFields> = {}): KitchenPredicateFields => ({
  status: 'pending',
  orderSource: 'customer_zalo',
  paymentReceivedAt: null,
  paymentMethod: 'zalo_checkout',
  ...p,
})

describe('orderInKitchen (§7 — vào bếp theo order_source)', () => {
  it('đơn staff pending → vào bếp ngay (chưa cần tiền)', () => {
    expect(orderInKitchen(o({ orderSource: 'staff' }))).toBe(true)
  })

  it('khách tự đặt zalo_checkout CHƯA trả tiền → CHƯA vào bếp (chống đơn ma)', () => {
    expect(orderInKitchen(o())).toBe(false)
  })

  it('khách tự đặt ĐÃ có payment_received_at (bếp/owner/ví xác nhận) → vào bếp', () => {
    expect(orderInKitchen(o({ paymentReceivedAt: '2026-07-22T00:00:00Z' }))).toBe(true)
  })

  it('khách tự đặt tiền mặt → vào bếp ngay (giữ hành vi cũ)', () => {
    expect(orderInKitchen(o({ paymentMethod: 'cash' }))).toBe(true)
  })

  it('đơn confirmed (ví đã trả) → vào bếp', () => {
    expect(orderInKitchen(o({ status: 'confirmed', paymentReceivedAt: '2026-07-22T00:00:00Z' }))).toBe(true)
  })

  it('cooking/ready/paid/cancelled → không ở cột chờ làm', () => {
    for (const status of ['cooking', 'ready', 'paid', 'cancelled']) {
      expect(orderInKitchen(o({ status, orderSource: 'staff' }))).toBe(false)
    }
  })
})

describe('shouldAnnounceOrder', () => {
  it('báo lần đầu đơn staff vào bếp', () => {
    expect(shouldAnnounceOrder(o({ orderSource: 'staff' }), false)).toBe(true)
  })
  it('không báo lại nếu đã báo', () => {
    expect(shouldAnnounceOrder(o({ orderSource: 'staff' }), true)).toBe(false)
  })
})
