import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error — module .mjs thuần, không có typings
import { handlePhoneProxy, ZALO_PHONE_URL } from './proxy.mjs'

const SECRET = 'hmac-secret'
const NOW = 1_800_000_000_000
const payload = { version: 1, token: 'tok-1', access_token: 'acc-1', secret_key: 'app-secret' }

function signed(body: string, ts = String(Math.floor(NOW / 1000)), secret = SECRET) {
  return {
    'x-mevo-timestamp': ts,
    'x-mevo-signature': 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex'),
  }
}

function req(over: Record<string, unknown> = {}) {
  const rawBody = JSON.stringify(payload)
  return { method: 'POST', path: '/mevo/phone', headers: signed(rawBody), rawBody, ...over }
}

function deps(zalo: unknown = { data: { number: '84912345678' }, error: 0, message: 'Success' }) {
  const logs: string[] = []
  return {
    logs,
    d: {
      hmacSecret: SECRET,
      now: () => NOW,
      fetch: vi.fn(async () => new Response(JSON.stringify(zalo), { status: 200 })),
      log: (m: string) => { logs.push(m) },
    },
  }
}

describe('phone proxy', () => {
  it('GET /mevo/phone/health trả ok, không cần chữ ký', async () => {
    const { d } = deps()
    expect(await handlePhoneProxy({ method: 'GET', path: '/mevo/phone/health', headers: {}, rawBody: '' }, d))
      .toEqual({ status: 200, body: { ok: true } })
  })

  it('đường dẫn/method khác → 404/405, không gọi Zalo', async () => {
    const { d } = deps()
    expect((await handlePhoneProxy(req({ path: '/khac' }), d)).status).toBe(404)
    expect((await handlePhoneProxy(req({ method: 'GET' }), d)).status).toBe(405)
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['thiếu chữ ký', { 'x-mevo-timestamp': String(Math.floor(NOW / 1000)) }],
    ['sai secret', signed(JSON.stringify(payload), String(Math.floor(NOW / 1000)), 'khac')],
    ['timestamp lệch quá 5 phút', signed(JSON.stringify(payload), String(Math.floor(NOW / 1000) - 600))],
    ['timestamp không phải số', signed(JSON.stringify(payload), 'abc')],
  ])('%s → 401, không gọi Zalo', async (_n, headers) => {
    const { d } = deps()
    expect((await handlePhoneProxy(req({ headers }), d)).status).toBe(401)
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('body bị sửa sau khi ký → 401', async () => {
    const { d } = deps()
    const r = req()
    expect((await handlePhoneProxy({ ...r, rawBody: r.rawBody.replace('tok-1', 'tok-2') }, d)).status).toBe(401)
  })

  it.each([
    [{ ...payload, token: '' }],
    [{ ...payload, access_token: 5 }],
    [{ version: 1 }],
  ])('chữ ký đúng nhưng body thiếu/sai → 400: %j', async (bad) => {
    const { d } = deps()
    const rawBody = JSON.stringify(bad)
    expect((await handlePhoneProxy({ method: 'POST', path: '/mevo/phone', headers: signed(rawBody), rawBody }, d)).status).toBe(400)
    expect(d.fetch).not.toHaveBeenCalled()
  })

  it('hợp lệ → gọi Zalo đúng header từ IP máy này, trả nguyên JSON Zalo', async () => {
    const { d } = deps()
    expect(await handlePhoneProxy(req(), d)).toEqual({
      status: 200,
      body: { data: { number: '84912345678' }, error: 0, message: 'Success' },
    })
    expect(d.fetch).toHaveBeenCalledWith(ZALO_PHONE_URL, {
      method: 'GET',
      headers: { access_token: 'acc-1', code: 'tok-1', secret_key: 'app-secret' },
    })
  })

  it('Zalo trả lỗi: vẫn chuyển nguyên JSON lỗi để bên gọi chẩn đoán', async () => {
    const { d } = deps({ error: -501, message: 'IP khác' })
    expect((await handlePhoneProxy(req(), d)).body).toEqual({ error: -501, message: 'IP khác' })
  })

  it('không gọi được Zalo / body không phải JSON → 502', async () => {
    const a = deps()
    a.d.fetch = vi.fn(async () => { throw new Error('ECONNRESET') })
    expect((await handlePhoneProxy(req(), a.d)).status).toBe(502)
    const b = deps()
    b.d.fetch = vi.fn(async () => new Response('oops', { status: 200 }))
    expect((await handlePhoneProxy(req(), b.d)).status).toBe(502)
  })

  it('log KHÔNG BAO GIỜ chứa số, token, access token, secret', async () => {
    const cases = [deps(), deps({ error: -501, message: 'x' })]
    const boom = deps(); boom.d.fetch = vi.fn(async () => { throw new Error('tok-1 acc-1 app-secret') }); cases.push(boom)
    for (const { d, logs } of cases) {
      await handlePhoneProxy(req(), d)
      for (const line of logs) {
        for (const s of ['84912345678', 'tok-1', 'acc-1', 'app-secret', SECRET]) expect(line).not.toContain(s)
      }
    }
  })
})
