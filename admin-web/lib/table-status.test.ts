import { describe, it, expect } from 'vitest'
import { tableDot, pendingCount, type SessionStatusLike } from './table-status'

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
