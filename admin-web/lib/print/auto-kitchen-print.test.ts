import { describe, expect, it } from 'vitest'
import {
  autoKitchenPrintCandidates,
  autoPrintBanner,
  createAutoPrintTracker,
  isAutoKitchenOrder,
  type AutoPrintConfig,
  type AutoPrintOrder,
} from './auto-kitchen-print'

const cfg: AutoPrintConfig = { mode: 'agent', kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic', paymentTiming: 'postpay' }
const now = Date.parse('2026-12-01T12:00:00Z')
const ord = (p: Partial<AutoPrintOrder>): AutoPrintOrder => ({ status: 'pending', orderSource: 'customer_zalo',
  createdAt: '2026-12-01T11:55:00Z', paymentReceivedAt: null, paymentMethod: 'cash', confirmedAt: null, ...p })
const ago = (min: number) => new Date(now - min * 60_000).toISOString()

describe('isAutoKitchenOrder', () => {
  it('trả sau, đơn khách pending automatic: in', () => expect(isAutoKitchenOrder(ord({}), cfg, now)).toBe(true))
  it('mode browser: không in', () => expect(isAutoKitchenOrder(ord({}), { ...cfg, mode: 'browser' }, now)).toBe(false))
  it('đơn pos và reservation_preorder: không in', () => {
    expect(isAutoKitchenOrder(ord({ orderSource: 'pos' }), cfg, now)).toBe(false)
    expect(isAutoKitchenOrder(ord({ orderSource: 'reservation_preorder' }), cfg, now)).toBe(false)
  })
  it('khách pos_confirmation + nhân viên automatic: đơn staff in, đơn khách không', () => {
    const c = { ...cfg, kitchenReleasePolicy: 'pos_confirmation' as const }
    expect(isAutoKitchenOrder(ord({ orderSource: 'staff' }), c, now)).toBe(true)
    expect(isAutoKitchenOrder(ord({}), c, now)).toBe(false)
  })
  it('nhân viên pos_confirmation + khách automatic: đơn khách in, đơn staff không', () => {
    const c = { ...cfg, staffOrderReleasePolicy: 'pos_confirmation' as const }
    expect(isAutoKitchenOrder(ord({}), c, now)).toBe(true)
    expect(isAutoKitchenOrder(ord({ orderSource: 'staff' }), c, now)).toBe(false)
  })
  it('đã có confirmedAt: không in', () => expect(isAutoKitchenOrder(ord({ confirmedAt: ago(1) }), cfg, now)).toBe(false))
  it('cooking và ready vẫn in; paid và cancelled không', () => {
    expect(isAutoKitchenOrder(ord({ status: 'cooking' }), cfg, now)).toBe(true)
    expect(isAutoKitchenOrder(ord({ status: 'ready' }), cfg, now)).toBe(true)
    expect(isAutoKitchenOrder(ord({ status: 'paid' }), cfg, now)).toBe(false)
    expect(isAutoKitchenOrder(ord({ status: 'cancelled' }), cfg, now)).toBe(false)
  })
  it('trả trước, khách chưa trả tiền: không in; có paymentReceivedAt: in', () => {
    const c = { ...cfg, paymentTiming: 'prepay' as const }
    expect(isAutoKitchenOrder(ord({}), c, now)).toBe(false)
    expect(isAutoKitchenOrder(ord({ paymentReceivedAt: ago(1) }), c, now)).toBe(true)
  })
  it('29 phút in, 31 phút không', () => {
    expect(isAutoKitchenOrder(ord({ createdAt: ago(29) }), cfg, now)).toBe(true)
    expect(isAutoKitchenOrder(ord({ createdAt: ago(31) }), cfg, now)).toBe(false)
  })
  it('trả trước: tạo 40 phút trước nhưng trả tiền 5 phút trước: in', () => {
    const c = { ...cfg, paymentTiming: 'prepay' as const }
    expect(isAutoKitchenOrder(ord({ createdAt: ago(40), paymentReceivedAt: ago(5) }), c, now)).toBe(true)
  })
  it('createdAt ở tương lai: in', () => {
    expect(isAutoKitchenOrder(ord({ createdAt: new Date(now + 5 * 60_000).toISOString() }), cfg, now)).toBe(true)
  })
})

describe('autoKitchenPrintCandidates', () => {
  it('bỏ phiên closed, đơn không có confirmed_at vẫn xét được, kèm tableLabel', () => {
    const row = (id: string) => ({ id, status: 'pending', order_source: 'customer_zalo', created_at: ago(2), payment_received_at: null }) as never
    const out = autoKitchenPrintCandidates([
      { status: 'open', table_number: 'Bàn 5', orders: [row('a')] },
      { status: 'closed', table_number: 'Bàn 6', orders: [row('b')] },
    ], cfg, now)
    expect(out).toEqual([{ orderId: 'a', tableLabel: 'Bàn 5' }])
  })
})

describe('autoKitchenPrintCandidates — đồng hồ POS lệch', () => {
  it('đồng hồ POS nhanh 40 phút: đơn vừa tạo vẫn được gửi lên (luật 30 phút do server quyết)', () => {
    const rows = [{ id: 'a', status: 'pending', order_source: 'staff', created_at: ago(5), payment_received_at: null }] as never
    const out = autoKitchenPrintCandidates([{ status: 'open', table_number: 'Bàn 5', orders: rows }], cfg, now + 40 * 60_000)
    expect(out).toEqual([{ orderId: 'a', tableLabel: 'Bàn 5' }])
  })
})

describe('autoPrintBanner', () => {
  it('browser / null / cả hai pos_confirmation: null', () => {
    expect(autoPrintBanner(null)).toBeNull()
    expect(autoPrintBanner({ ...cfg, mode: 'browser' })).toBeNull()
    expect(autoPrintBanner({ ...cfg, kitchenReleasePolicy: 'pos_confirmation', staffOrderReleasePolicy: 'pos_confirmation' })).toBeNull()
  })
  it('trả sau: info; trả trước: warning', () => {
    expect(autoPrintBanner(cfg)).toEqual({ tone: 'info', title: 'Đơn tự vào bếp — giữ POS mở để in' })
    expect(autoPrintBanner({ ...cfg, paymentTiming: 'prepay' })?.tone).toBe('warning')
  })
})

describe('createAutoPrintTracker', () => {
  it('id đã done không due lại; đang chạy không due', () => {
    const t = createAutoPrintTracker()
    expect(t.due(['a', 'b'], 0)).toEqual(['a', 'b'])
    t.start(['a', 'b'])
    expect(t.due(['a', 'b'], 1)).toEqual([])
    expect(t.finish('a', 'done', 2)).toBe('done')
    expect(t.due(['a', 'b'], 3)).toEqual([])
  })
  it('lỗi vĩnh viễn (fatal): bỏ cuộc ngay lần đầu, không due nữa', () => {
    const t = createAutoPrintTracker()
    t.start(['a'])
    expect(t.finish('a', 'fatal', 0)).toBe('gave_up')
    expect(t.due(['a'], 10_000_000)).toEqual([])
  })
  it('lỗi lần 1 chờ 30 giây mới due lại; lỗi lần 3 trả gave_up và không due nữa', () => {
    const t = createAutoPrintTracker()
    t.start(['a'])
    expect(t.finish('a', 'failed', 0)).toBe('retry')
    expect(t.due(['a'], 29_999)).toEqual([])
    expect(t.due(['a'], 30_000)).toEqual(['a'])
    t.start(['a'])
    expect(t.finish('a', 'failed', 30_000)).toBe('retry')
    t.start(['a'])
    expect(t.finish('a', 'failed', 60_000)).toBe('gave_up')
    expect(t.due(['a'], 10_000_000)).toEqual([])
  })
})
