import { describe, expect, it } from 'vitest'
import { AGENT_KINDS, browserPrintUrl } from './print-request'

describe('print-request', () => {
  it('browserPrintUrl đúng từng kind, giữ nguyên URL hiện tại', () => {
    expect(browserPrintUrl({ kind: 'order', orderId: 'o1' })).toBe('/print/order?id=o1')
    expect(browserPrintUrl({ kind: 'preorder_job', jobId: 'j1' })).toBe('/print/order?job=j1')
    expect(browserPrintUrl({ kind: 'bill', sessionIds: ['a', 'b'] })).toBe('/print/bill?ids=a,b')
    expect(browserPrintUrl({ kind: 'day_report', date: '2026-11-05' })).toBe('/print/day-report?date=2026-11-05')
    expect(browserPrintUrl({ kind: 'shift_report', shiftId: 's1' })).toBe('/print/shift-report?id=s1')
  })

  it('reprint không đổi URL trình duyệt', () => {
    expect(browserPrintUrl({ kind: 'order', orderId: 'o1', reprint: true })).toBe('/print/order?id=o1')
  })

  it('AGENT_KINDS chưa có shift_report', () => {
    expect(AGENT_KINDS.has('shift_report')).toBe(false)
    for (const k of ['order', 'preorder_job', 'bill', 'day_report'] as const) expect(AGENT_KINDS.has(k)).toBe(true)
  })
})
