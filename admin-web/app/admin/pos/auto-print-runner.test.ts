import { describe, expect, it, vi } from 'vitest'
import { createAutoPrintRunner } from './auto-print-runner'
import type { AutoPrintConfig } from '@/lib/print/auto-kitchen-print'
import type { OpenTableSession } from '@/lib/actions/table-session'

const cfg: AutoPrintConfig = { mode: 'agent', kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'automatic', paymentTiming: 'postpay' }
const NOW = Date.parse('2026-12-01T12:00:00Z')
const order = (id: string) => ({ id, status: 'pending', order_source: 'staff', created_at: new Date(NOW - 60_000).toISOString(), payment_received_at: null, confirmed_at: null })
const sessions = (...ids: string[]) =>
  [{ status: 'open', table_number: 'Bàn 5', orders: ids.map(order) }] as unknown as OpenTableSession[]

function make(opts: {
  ids: string[]
  enqueue: (ids: string[]) => Promise<{ ok: true; results: { orderId: string; status: 'queued' | 'already' | 'skipped' | 'error'; error?: string }[] } | { ok: false; error: string }>
  onGiveUp?: (m: string) => void
  alive?: () => boolean
}) {
  const onGiveUp = opts.onGiveUp ?? vi.fn()
  const runner = createAutoPrintRunner({
    getState: () => ({ cfg, sessions: sessions(...opts.ids) }),
    enqueue: opts.enqueue,
    onGiveUp,
    isAlive: opts.alive ?? (() => true),
    now: () => NOW,
  })
  return { runner, onGiveUp }
}
const ok = (ids: string[]) => ({ ok: true as const, results: ids.map((orderId) => ({ orderId, status: 'queued' as const })) })

describe('createAutoPrintRunner', () => {
  it('đơn đã done không gửi lại; đang chạy không gửi chồng', async () => {
    const enqueue = vi.fn(async (ids: string[]) => ok(ids))
    const { runner } = make({ ids: ['a'], enqueue })
    await Promise.all([runner.evaluate(), runner.evaluate()])
    await runner.evaluate()
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('enqueue ném: không kẹt, evaluate sau vẫn chạy được (sau thời gian chờ thử lại)', async () => {
    let now = NOW
    const enqueue = vi.fn()
      .mockRejectedValueOnce(new Error('mạng'))
      .mockImplementation(async (ids: string[]) => ok(ids))
    const runner = createAutoPrintRunner({
      getState: () => ({ cfg, sessions: sessions('a') }),
      enqueue, onGiveUp: vi.fn(), isAlive: () => true, now: () => now,
    })
    await runner.evaluate()
    expect(enqueue).toHaveBeenCalledTimes(1)
    now += 31_000
    await runner.evaluate()
    expect(enqueue).toHaveBeenCalledTimes(2)
  })

  it('onGiveUp ném: không kẹt cờ đang chạy, đơn khác vẫn được kết thúc', async () => {
    let now = NOW
    const enqueue = vi.fn(async (ids: string[]) => ({
      ok: true as const,
      results: ids.map((orderId) => ({ orderId, status: orderId === 'bad' ? ('error' as const) : ('queued' as const), error: 'hỏng' })),
    }))
    const onGiveUp = vi.fn(() => { throw new Error('banner lỗi') })
    const runner = createAutoPrintRunner({
      getState: () => ({ cfg, sessions: sessions('bad', 'good') }),
      enqueue, onGiveUp, isAlive: () => true, now: () => now,
    })
    for (let i = 0; i < 3; i++) {
      await runner.evaluate()
      now += 31_000
    }
    expect(onGiveUp).toHaveBeenCalledTimes(1)
    // 'good' đã done, 'bad' đã bỏ cuộc: không còn gì để gửi, và runner không kẹt
    await runner.evaluate()
    expect(enqueue).toHaveBeenCalledTimes(3)
    expect(enqueue.mock.calls[2][0]).toEqual(['bad'])
  })

  it('đã unmount: không chạy lô kế và không gọi enqueue', async () => {
    const enqueue = vi.fn(async (ids: string[]) => ok(ids))
    const { runner } = make({ ids: ['a'], enqueue, alive: () => false })
    await runner.evaluate()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
