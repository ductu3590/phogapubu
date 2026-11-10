import { describe, expect, it, vi } from 'vitest'
import { NETWORK_ERROR, runAction } from './run-action'

describe('runAction', () => {
  it('trả nguyên kết quả của action', async () => {
    await expect(runAction(async () => ({ ok: true as const, id: 'x' }), { isOnline: () => true })).resolves.toEqual({ ok: true, id: 'x' })
  })

  it('action ném (fetch lỗi khi mất mạng) → lỗi kết nối, không ném', async () => {
    await expect(runAction(async () => { throw new TypeError('Failed to fetch') }, { isOnline: () => true }))
      .resolves.toEqual({ ok: false, error: NETWORK_ERROR })
  })

  it('đang offline → báo lỗi ngay, không gọi action', async () => {
    const call = vi.fn(async () => ({ ok: true }))
    await expect(runAction(call, { isOnline: () => false })).resolves.toEqual({ ok: false, error: NETWORK_ERROR })
    expect(call).not.toHaveBeenCalled()
  })

  it('action treo → hết hạn chờ thì trả lỗi kết nối', async () => {
    vi.useFakeTimers()
    try {
      const p = runAction(() => new Promise<never>(() => {}), { timeoutMs: 1000, isOnline: () => true })
      await vi.advanceTimersByTimeAsync(1000)
      await expect(p).resolves.toEqual({ ok: false, error: NETWORK_ERROR })
    } finally {
      vi.useRealTimers()
    }
  })
})
