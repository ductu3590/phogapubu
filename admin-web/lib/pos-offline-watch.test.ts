import { describe, expect, it } from 'vitest'
import {
  INITIAL_OFFLINE_STATE as S0, OUTAGE_MERGE_GAP_MS, dismissOutage, msUntilNotice, nextOfflineState, offlineSince, outageOrders, staleOrderLabel,
} from './pos-offline-watch'

const T = Date.parse('2026-11-18T12:40:00Z') // 19:40 giờ Việt Nam
const sec = (n: number) => T + n * 1000

describe('nextOfflineState', () => {
  it('đang có mạng: không đổi, trả đúng object cũ', () => {
    expect(nextOfflineState(S0, true, T)).toBe(S0)
  })
  it('mất mạng: ghi mốc lần đầu, các lần sau giữ nguyên mốc', () => {
    const a = nextOfflineState(S0, false, T)
    expect(a).toEqual({ downSince: T, lastOutage: null })
    expect(nextOfflineState(a, false, sec(30))).toBe(a)
  })
  it('rớt dưới 60 giây rồi có lại: coi như chưa có gì (kể cả lúc vừa mở trang)', () => {
    const a = nextOfflineState(S0, false, T)
    expect(nextOfflineState(a, true, sec(59))).toEqual(S0)
  })
  it('mất từ 60 giây rồi có lại: ghi khoảng mất mạng', () => {
    const a = nextOfflineState(S0, false, T)
    expect(nextOfflineState(a, true, sec(60))).toEqual({ downSince: null, lastOutage: { from: T, to: sec(60) } })
  })
  it('chập chờn: lần mất sau nối vào khoảng trước, giữ mốc đầu', () => {
    let s = nextOfflineState(S0, false, T)
    s = nextOfflineState(s, true, sec(70))
    s = nextOfflineState(s, false, sec(80))
    s = nextOfflineState(s, true, sec(200))
    expect(s).toEqual({ downSince: null, lastOutage: { from: T, to: sec(200) } })
  })
  it('hai lần mất cách nhau quá 10 phút: lần sau thay lần trước, không nối', () => {
    let s = nextOfflineState(S0, false, T)
    s = nextOfflineState(s, true, sec(70))
    const t2 = sec(70) + OUTAGE_MERGE_GAP_MS + 1000 // lần 2 bắt đầu sau lần 1 kết thúc 11 phút
    s = nextOfflineState(s, false, t2)
    s = nextOfflineState(s, true, t2 + 90_000)
    expect(s).toEqual({ downSince: null, lastOutage: { from: t2, to: t2 + 90_000 } })
  })
  it('đã có khoảng cũ, rớt ngắn dưới 60 giây: khoảng cũ giữ nguyên', () => {
    let s = nextOfflineState(S0, false, T)
    s = nextOfflineState(s, true, sec(70))
    s = nextOfflineState(nextOfflineState(s, false, sec(80)), true, sec(90))
    expect(s.lastOutage).toEqual({ from: T, to: sec(70) })
  })
  it('dismissOutage xoá khoảng, không đụng mốc đang mất', () => {
    expect(dismissOutage({ downSince: sec(5), lastOutage: { from: T, to: sec(1) } })).toEqual({ downSince: sec(5), lastOutage: null })
  })
})

describe('offlineSince', () => {
  const down = { downSince: T, lastOutage: null }
  it('chưa đủ 60 giây: null', () => expect(offlineSince(down, sec(59))).toBeNull())
  it('đủ 60 giây: trả mốc bắt đầu', () => expect(offlineSince(down, sec(60))).toBe(T))
  it('máy ngủ 5 phút rồi thức: vẫn trả mốc (tính theo thời gian, không đếm nhịp)', () => expect(offlineSince(down, sec(300))).toBe(T))
  it('đang có mạng: null', () => expect(offlineSince(S0, sec(300))).toBeNull())
})

describe('msUntilNotice', () => {
  it('đang có mạng: null', () => expect(msUntilNotice(null, T)).toBeNull())
  it('ngay lúc rớt: 60 giây + 50 ms đệm', () => expect(msUntilNotice(T, T)).toBe(60_050))
  it('còn 1 ms nữa tới ngưỡng: 51 ms', () => expect(msUntilNotice(T, T + 59_999)).toBe(51))
  it('đã tới / quá ngưỡng: null', () => {
    expect(msUntilNotice(T, T + 60_000)).toBeNull()
    expect(msUntilNotice(T, T + 90_000)).toBeNull()
  })
})

describe('outageOrders', () => {
  const outage = { from: T, to: sec(600) }
  const o = (id: string, at: number, over: Record<string, unknown> = {}) =>
    ({ id, status: 'pending', created_at: new Date(at).toISOString(), order_source: 'customer_zalo', needs_pos_confirmation: true, ...over })
  const open = (...orders: ReturnType<typeof o>[]) => [{ status: 'open', orders }]

  it('đếm lượt chờ duyệt tạo trong khoảng, firstAt là lượt sớm nhất', () => {
    expect(outageOrders(open(o('a', sec(300)), o('b', sec(120))), outage)).toEqual({ review: 2, autoKitchen: 0, firstAt: sec(120) })
  })
  it('nới cả hai mép 2 phút', () => {
    const r = outageOrders(open(
      o('sat-truoc', sec(-120)), o('qua-som', sec(-121)),
      o('sat-sau', sec(720)), o('qua-muon', sec(721)),
    ), outage)
    expect(r).toEqual({ review: 2, autoKitchen: 0, firstAt: sec(-120) })
  })
  it('không đếm món ghi tay, món đặt trước, đơn đã duyệt, phiên không mở', () => {
    const r = outageOrders([
      ...open(
        o('pos', sec(10), { order_source: 'pos', needs_pos_confirmation: false }),
        o('dat-truoc', sec(10), { order_source: 'reservation_preorder', needs_pos_confirmation: false }),
        o('da-duyet', sec(10), { status: 'confirmed', needs_pos_confirmation: false }),
      ),
      { status: 'expired', orders: [o('phien-het-han', sec(10))] },
    ], outage)
    expect(r).toEqual({ review: 0, autoKitchen: 0, firstAt: null })
  })
  it('đơn tự vào bếp (pending nhưng không cần duyệt) đếm riêng', () => {
    const r = outageOrders(open(o('tu-vao-bep', sec(10), { order_source: 'staff', needs_pos_confirmation: false })), outage)
    expect(r).toEqual({ review: 0, autoKitchen: 1, firstAt: null })
  })
  it('firstAt chỉ tính lượt chờ duyệt: đơn tự vào bếp sớm hơn không kéo mốc', () => {
    const r = outageOrders(open(
      o('tu-vao-bep', sec(10), { order_source: 'staff', needs_pos_confirmation: false }),
      o('cho-duyet', sec(50)),
    ), outage)
    expect(r).toEqual({ review: 1, autoKitchen: 1, firstAt: sec(50) })
  })
})

describe('staleOrderLabel', () => {
  it('chờ dưới 10 phút: null', () => expect(staleOrderLabel(T, sec(599))).toBeNull())
  it('chờ từ 10 phút: nhãn có giờ gọi và thời gian chờ', () => {
    expect(staleOrderLabel(T, sec(600))).toBe('Gọi lúc 19:40 · đã chờ 10 phút')
    expect(staleOrderLabel(T, sec(75 * 60))).toBe('Gọi lúc 19:40 · đã chờ 1 giờ 15 phút')
  })
})
