import { describe, expect, it, vi } from 'vitest'
import { handleZaloPhone, ZALO_PHONE_URL } from './handler'

const STORE = '2139c162-9677-4cbd-87e3-d2e1ac22e6e8'
const body = { storeId: STORE, token: 'tok-1', accessToken: 'acc-1' }
const SECRET = 'secret-abc'

function zaloResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function deps(over: Partial<Parameters<typeof handleZaloPhone>[1]> = {}) {
  const logs: string[] = []
  return {
    logs,
    d: {
      loadConfig: vi.fn(async () => ({ secret: SECRET, enabled: true })),
      fetch: vi.fn(async () => zaloResponse({ data: { number: '84912345678' }, error: 0, message: 'Success' })),
      log: (m: string) => { logs.push(m) },
      ...over,
    },
  }
}

describe('zalo-phone handler', () => {
  it.each([
    [null],
    [{}],
    [{ ...body, storeId: 'khong-phai-uuid' }],
    [{ ...body, token: '' }],
    [{ ...body, accessToken: 42 }],
  ])('thiếu/sai input → 400 bad_request, không đọc config: %j', async (input) => {
    const { d } = deps()
    expect(await handleZaloPhone(input as never, d)).toEqual({ status: 400, body: { error: 'bad_request' } })
    expect(d.loadConfig).not.toHaveBeenCalled()
  })

  it.each([
    [null],
    [{ secret: SECRET, enabled: false }],
    [{ secret: '  ', enabled: true }],
    [{ secret: null, enabled: true }],
  ])('quán chưa cấu hình → 409 not_configured, không gọi Zalo: %j', async (config) => {
    const { d } = deps({ loadConfig: vi.fn(async () => config) })
    expect(await handleZaloPhone(body, d)).toEqual({ status: 409, body: { error: 'not_configured' } })
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('thành công → 200 phone, gọi Zalo đúng header', async () => {
    const { d } = deps()
    expect(await handleZaloPhone(body, d)).toEqual({ status: 200, body: { phone: '84912345678' } })
    expect(d.loadConfig).toHaveBeenCalledWith(STORE)
    expect(d.fetch).toHaveBeenCalledWith(ZALO_PHONE_URL, {
      method: 'GET',
      headers: { access_token: 'acc-1', code: 'tok-1', secret_key: SECRET },
    })
  })

  it.each([
    ['Zalo trả error khác 0', zaloResponse({ error: -501, message: 'token expired' })],
    ['thiếu data.number', zaloResponse({ data: {}, error: 0 })],
    ['HTTP 500', zaloResponse({ error: 0, data: { number: '84912345678' } }, 500)],
    ['body không phải JSON', new Response('oops', { status: 200 })],
  ])('%s → 502 zalo_error', async (_name, res) => {
    const { d } = deps({ fetch: vi.fn(async () => res) })
    expect(await handleZaloPhone(body, d)).toEqual({ status: 502, body: { error: 'zalo_error' } })
  })

  it('mạng tới Zalo lỗi → 502 zalo_error', async () => {
    const { d } = deps({ fetch: vi.fn(async () => { throw new Error('ECONNRESET') }) })
    expect(await handleZaloPhone(body, d)).toEqual({ status: 502, body: { error: 'zalo_error' } })
  })

  it('log KHÔNG BAO GIỜ chứa số, token, access token, secret', async () => {
    const cases = [
      deps(),
      deps({ fetch: vi.fn(async () => zaloResponse({ error: -501, data: { number: '84912345678' } })) }),
      deps({ fetch: vi.fn(async () => { throw new Error('tok-1 acc-1') }) }),
    ]
    for (const { d, logs } of cases) {
      await handleZaloPhone(body, d)
      for (const line of logs) {
        for (const secretish of ['84912345678', '0912345678', 'tok-1', 'acc-1', SECRET]) {
          expect(line).not.toContain(secretish)
        }
      }
    }
  })
})
