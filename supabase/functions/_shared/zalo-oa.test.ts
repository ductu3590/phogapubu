import { describe, expect, it, vi } from 'vitest'
import { sendOaText } from './zalo-oa'

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('Zalo OA sender', () => {
  it('2xx + error 0 là thành công', async () => {
    const result = await sendOaText('secret', 'user', 'hello', vi.fn(async () => response(200, { error: 0, data: { message_id: 'm1' } })))
    expect(result).toEqual({ ok: true, providerMessageId: 'm1' })
  })
  it('provider error là action_required', async () => {
    const result = await sendOaText('secret', 'user', 'hello', vi.fn(async () => response(200, { error: -201, message: 'invalid token' })))
    expect(result).toMatchObject({ ok: false, providerCode: '-201', retryable: false })
  })
  it('429 và 5xx có thể retry', async () => {
    await expect(sendOaText('secret', 'user', 'hello', vi.fn(async () => response(429, { error: 429, message: 'rate' })))).resolves.toMatchObject({ ok: false, retryable: true })
    await expect(sendOaText('secret', 'user', 'hello', vi.fn(async () => response(503, { error: 503 })))).resolves.toMatchObject({ ok: false, retryable: true })
  })
  it('network error có thể retry', async () => {
    const result = await sendOaText('secret', 'user', 'hello', vi.fn(async () => { throw new Error('offline') }))
    expect(result).toMatchObject({ ok: false, providerCode: 'NETWORK_ERROR', retryable: true })
  })
})

