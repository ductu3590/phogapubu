import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import OfflineBanner from './offline-banner'

const T = Date.parse('2026-11-18T12:40:00Z') // 19:40 giờ Việt Nam
const outage = (over: Record<string, unknown> = {}) =>
  ({ from: T, to: T + 900_000, review: 3, autoKitchen: 0, firstAt: T + 720_000, ...over })
const render = (p: Partial<Parameters<typeof OfflineBanner>[0]>) =>
  renderToStaticMarkup(<OfflineBanner downSince={null} outage={null} onDismiss={vi.fn()} onShowOrders={vi.fn()} {...p} />)

describe('OfflineBanner', () => {
  it('có mạng, không có khoảng mất mạng: không vẽ gì', () => {
    expect(render({})).toBe('')
  })
  it('đang mất mạng: băng đỏ có giờ bắt đầu, không có nút đóng', () => {
    const html = render({ downSince: T })
    expect(html).toContain('Mất mạng từ 19:40')
    expect(html).toContain('Các nút sẽ báo lỗi. Mất lâu thì làm theo tờ quy trình mất mạng.')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('Vừa có mạng lại')
  })
  it('đang mất mạng thì không hiện băng có mạng lại của lần trước', () => {
    expect(render({ downSince: T, outage: outage() })).not.toContain('Vừa có mạng lại')
  })
  it('có mạng lại, có lượt chờ duyệt: đếm, giờ lượt sớm nhất, nút xem', () => {
    const html = render({ outage: outage() })
    expect(html).toContain('Vừa có mạng lại')
    expect(html).toContain('Có 3 lượt món gọi lúc mất mạng (từ 19:52). Hỏi lại khách trước khi duyệt; đã nhập tay rồi thì Từ chối.')
    expect(html).toContain('Xem lượt chờ duyệt')
    expect(html).not.toContain('tự vào bếp')
  })
  it('có mạng lại, chỉ có đơn tự vào bếp: câu kiểm tra bếp, không có nút xem', () => {
    const html = render({ outage: outage({ review: 0, autoKitchen: 2 }) })
    expect(html).toContain('Có 2 đơn tự vào bếp lúc mất mạng: kiểm tra bếp đã có phiếu chưa.')
    expect(html).not.toContain('Xem lượt chờ duyệt')
  })
  it('có mạng lại nhưng không có lượt món nào trong khoảng: không vẽ gì', () => {
    expect(render({ outage: outage({ review: 0, autoKitchen: 0, firstAt: null }) })).toBe('')
  })
})
