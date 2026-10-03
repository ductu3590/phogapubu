import { describe, it, expect } from 'vitest'
import { tableDot, pendingCount, tableVisualState, type SessionStatusLike } from './table-status'

const phien = (statuses: string[], status = 'open'): SessionStatusLike => ({
  status,
  orders: statuses.map((s) => ({ status: s })),
})

describe('tableDot', () => {
  it('không có phiên → xanh (bàn trống)', () => {
    expect(tableDot(undefined)).toBe('free')
  })

  it('mâm vừa ghép, chưa ai gọi món → vẫn xanh', () => {
    expect(tableDot(phien([]))).toBe('free')
  })

  it('có món đã gọi → đỏ (đang có khách ngồi)', () => {
    expect(tableDot(phien(['pending']))).toBe('busy')
  })

  it('món đã xác nhận vẫn là đỏ — đỏ nghĩa là bàn đang có khách, không phải "chưa xác nhận"', () => {
    expect(tableDot(phien(['confirmed', 'ready']))).toBe('busy')
  })

  it('phiên đã đóng → xanh, dù trước đó có đơn', () => {
    expect(tableDot(phien(['confirmed'], 'closed'))).toBe('free')
  })
})

describe('pendingCount', () => {
  it('không có phiên → 0', () => {
    expect(pendingCount(undefined)).toBe(0)
  })

  it('đếm đúng số đơn chưa xác nhận', () => {
    expect(pendingCount(phien(['pending', 'pending', 'confirmed']))).toBe(2)
  })

  it('đơn đã xác nhận / đang làm / xong đều không tính là chờ', () => {
    expect(pendingCount(phien(['confirmed', 'cooking', 'ready', 'paid']))).toBe(0)
  })

  it('phiên đã đóng thì không còn gì để xác nhận', () => {
    expect(pendingCount(phien(['pending'], 'closed'))).toBe(0)
  })
})

describe('tableVisualState (quy ước màu 2026-10-02)', () => {
  it('không có phiên → trống; có giữ chỗ trước giờ đến → đã đặt', () => {
    expect(tableVisualState(undefined)).toBe('free')
    expect(tableVisualState(undefined, { prearrivalReserved: true })).toBe('booked')
  })

  it('mâm vừa ghép, chưa gọi món vẫn là trống', () => {
    expect(tableVisualState(phien([]))).toBe('free')
  })

  it('có món đã xác nhận → đang phục vụ', () => {
    expect(tableVisualState(phien(['confirmed']))).toBe('serving')
  })

  it('còn đơn chờ xác nhận → chờ duyệt, thắng đang phục vụ', () => {
    expect(tableVisualState(phien(['confirmed', 'pending']))).toBe('pending')
  })

  it('phiên quá hạn còn tiền chưa thu → trễ, thắng mọi trạng thái', () => {
    expect(tableVisualState({ ...phien(['pending'], 'closed'), needs_review: true })).toBe('late')
  })

  it('bàn đang có khách thì không hiện "đã đặt" dù có booking kế tiếp', () => {
    expect(tableVisualState(phien(['confirmed']), { prearrivalReserved: true })).toBe('serving')
  })
})
