import { describe, expect, it, vi } from 'vitest'
import { checkPhoneProxy, summarizeZcaRelay, type ZcaDeliveryRow } from './mevo-infra-health'

const res = (ok: boolean, status: number, body: unknown) => ({ ok, status, json: async () => body })

describe('checkPhoneProxy', () => {
  it('chưa đặt URL → chưa kiểm được, không gọi mạng', async () => {
    const fetchImpl = vi.fn()
    await expect(checkPhoneProxy('  ', fetchImpl)).resolves.toMatchObject({ state: 'unknown' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('gọi đúng <URL>/health (bỏ dấu / thừa) và nhận {ok:true} → đang sống', async () => {
    const fetchImpl = vi.fn(async () => res(true, 200, { ok: true }))
    await expect(checkPhoneProxy('https://vn.example/mevo/phone/', fetchImpl)).resolves.toMatchObject({ state: 'ok' })
    expect(fetchImpl).toHaveBeenCalledWith('https://vn.example/mevo/phone/health', expect.anything())
  })

  it('HTTP lỗi hoặc thân không phải {ok:true} → đang hỏng', async () => {
    await expect(checkPhoneProxy('https://vn.example/p', async () => res(false, 502, null))).resolves.toMatchObject({ state: 'down' })
    await expect(checkPhoneProxy('https://vn.example/p', async () => res(true, 200, { ok: false }))).resolves.toMatchObject({ state: 'down' })
  })

  it('lỗi mạng / hết giờ → đang hỏng, không ném', async () => {
    await expect(checkPhoneProxy('https://vn.example/p', async () => { throw new Error('timeout') })).resolves.toMatchObject({ state: 'down' })
  })
})

describe('summarizeZcaRelay', () => {
  const NOW = Date.parse('2026-11-11T10:00:00Z')
  const row = (status: ZcaDeliveryRow['status'], minutesAgo: number): ZcaDeliveryRow => {
    const at = new Date(NOW - minutesAgo * 60_000).toISOString()
    return { status, created_at: at, queued_at: at, processing_started_at: status === 'processing' ? at : null }
  }

  it('chưa có thông báo nào → chưa rõ', () => {
    expect(summarizeZcaRelay([], NOW).state).toBe('unknown')
  })

  it('dòng mới nhất đã gửi → sống, kể cả khi trước đó từng lỗi', () => {
    expect(summarizeZcaRelay([row('sent', 5), row('failed', 60)], NOW).state).toBe('ok')
  })

  it('dòng mới nhất thất bại / cần kiểm tra → hỏng', () => {
    expect(summarizeZcaRelay([row('failed', 5), row('sent', 60)], NOW).state).toBe('down')
    expect(summarizeZcaRelay([row('action_required', 5)], NOW).state).toBe('down')
  })

  it('đang chờ gửi dưới 2 phút → chưa rõ; quá 2 phút → hỏng', () => {
    expect(summarizeZcaRelay([row('queued', 1)], NOW).state).toBe('unknown')
    expect(summarizeZcaRelay([row('queued', 3)], NOW).state).toBe('down')
    expect(summarizeZcaRelay([row('processing', 3)], NOW).state).toBe('down')
  })
})
