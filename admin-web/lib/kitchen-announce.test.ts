import { describe, expect, it } from 'vitest'
import { orderInKitchen, shouldAnnounceOrder, type KitchenPredicateFields } from './kitchen-announce'

// Mặc định 'postpay' để 6 ca cũ (viết khi hệ thống chưa có payment_timing và mọi đơn cash
// đều vào bếp) giữ nguyên ý nghĩa — đúng cái backfill mig 039 làm cho quán đang bật cash.
const o = (p: Partial<KitchenPredicateFields> = {}): KitchenPredicateFields => ({
  status: 'pending',
  orderSource: 'customer_zalo',
  paymentReceivedAt: null,
  paymentMethod: 'zalo_checkout',
  storePaymentTiming: 'postpay',
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

// mig 039 — lỗ hổng PB3: trước đây luật chỉ nhìn payment_method nên quán TRẢ TRƯỚC bật tiền
// mặt (để nhân viên thu hộ) vẫn bị đơn QR tiền mặt của khách lọt vào bếp không cần tiền.
describe('orderInKitchen — trục payment_timing (mig 039, vá PB3)', () => {
  it('quán TRẢ TRƯỚC: khách tự đặt tiền mặt, chưa có tiền → KHÔNG vào bếp', () => {
    expect(orderInKitchen(o({ storePaymentTiming: 'prepay', paymentMethod: 'cash' }))).toBe(false)
  })

  it('quán TRẢ TRƯỚC: đã có tiền thật → vẫn vào bếp (hành vi Pubu không đổi)', () => {
    expect(
      orderInKitchen(o({ storePaymentTiming: 'prepay', paymentReceivedAt: '2026-08-31T00:00:00Z' })),
    ).toBe(true)
  })

  it('quán TRẢ TRƯỚC: đơn nhân viên đặt hộ → vẫn vào bếp ngay (nhân viên đứng cạnh khách)', () => {
    expect(
      orderInKitchen(o({ storePaymentTiming: 'prepay', orderSource: 'staff', paymentMethod: 'cash' })),
    ).toBe(true)
  })

  it('quán TRẢ SAU: đơn phiên bàn chưa thu tiền → vào bếp ngay', () => {
    expect(orderInKitchen(o({ storePaymentTiming: 'postpay', paymentMethod: 'cash' }))).toBe(true)
  })

  it('quán TRẢ SAU: đơn zalo_checkout chưa trả (mang về) → vẫn KHÔNG vào bếp', () => {
    expect(orderInKitchen(o({ storePaymentTiming: 'postpay', paymentMethod: 'zalo_checkout' }))).toBe(false)
  })
})

describe('shouldAnnounceOrder', () => {
  it('báo lần đầu đơn staff vào bếp', () => {
    expect(shouldAnnounceOrder(o({ orderSource: 'staff' }), false)).toBe(true)
  })
  it('không báo lại nếu đã báo', () => {
    expect(shouldAnnounceOrder(o({ orderSource: 'staff' }), true)).toBe(false)
  })
  it('quán trả trước: đơn cash chưa thu tiền KHÔNG kêu loa', () => {
    expect(
      shouldAnnounceOrder(o({ storePaymentTiming: 'prepay', paymentMethod: 'cash' }), false),
    ).toBe(false)
  })
})
