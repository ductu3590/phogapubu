import { describe, expect, it, vi } from 'vitest'
import { sendZcaGroupMessage } from './zca-relay'

const input = {
  notificationId: '00000000-0000-4000-8000-000000000001',
  storeId: '2139c162-9677-4cbd-87e3-d2e1ac22e6e8',
  groupId: 'group-test',
  text: '📅 Có đặt bàn mới',
}

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

describe('ZCA group relay sender', () => {
  it('ký và gửi đúng raw UTF-8 bytes chỉ serialize một lần', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(JSON.stringify({
        version: 1,
        notification_id: input.notificationId,
        store_id: input.storeId,
        group_id: input.groupId,
        text: input.text,
      }))
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'X-Mevo-Timestamp': '1700000000',
        'X-Mevo-Signature': 'sha256=a8d807f9bdafe12878690f48b01e8f898178e50e6a913c738e314c26d984e948',
      })
      return response(200, { ok: true, providerMessageId: 'message-1' })
    })

    await expect(sendZcaGroupMessage(input, {
      relayUrl: 'https://relay.test/mevo/relay', hmacSecret: 'secret', now: () => 1700000000000, fetchImpl,
    })).resolves.toEqual({ ok: true, providerMessageId: 'message-1' })
  })

  it.each([
    ['BOT_OFFLINE', true], ['RATE_LIMITED', true], ['GROUP_NOT_FOUND', false],
    ['INVALID_REQUEST', false], ['PROVIDER_REJECTED', false],
  ])('đọc code relay %s từ body HTTP 200', async (code, retryable) => {
    await expect(sendZcaGroupMessage(input, {
      relayUrl: 'https://relay.test/mevo/relay', hmacSecret: 'secret',
      fetchImpl: vi.fn(async () => response(200, { ok: false, code, message: 'provider message', retryable })),
    })).resolves.toEqual({ ok: false, code, message: 'provider message', retryable })
  })

  it('HTTP lỗi, JSON lỗi và lỗi mạng đều không ném text/signature ra ngoài và có thể retry khi phù hợp', async () => {
    const base = { relayUrl: 'https://relay.test/mevo/relay', hmacSecret: 'secret' }
    await expect(sendZcaGroupMessage(input, { ...base, fetchImpl: vi.fn(async () => new Response('down', { status: 503 })) }))
      .resolves.toMatchObject({ ok: false, code: 'BOT_OFFLINE', retryable: true })
    await expect(sendZcaGroupMessage(input, { ...base, fetchImpl: vi.fn(async () => { throw new Error('offline') }) }))
      .resolves.toMatchObject({ ok: false, code: 'BOT_OFFLINE', retryable: true })
  })
})
