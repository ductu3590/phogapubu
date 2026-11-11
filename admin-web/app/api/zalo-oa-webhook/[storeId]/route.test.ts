import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { POST, GET } = await import('./route')

function post(body: string, signature?: string) {
  return POST(new Request('https://mevo.test/api/zalo-oa-webhook/store-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature ? { 'x-zevent-signature': signature } : {}) },
    body,
  }))
}

describe('Webhook Zalo OA — chỉ ack và chuyển tiếp Sổ Tay Buôn Đá', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('GET và POST kiểm tra URL của Zalo đều trả 200', async () => {
    expect((await GET()).status).toBe(200)
    const response = await post('{}')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('event Mini App của Sổ Tay → chuyển nguyên body + chữ ký, trả đúng status Supabase', async () => {
    fetchMock.mockResolvedValue(new Response('{"result":"deleted"}', { status: 200 }))
    const raw = '{"appId": 805750043345863894, "event":"user.revoke.consent","userId":"u1","timestamp":1}'
    const response = await post(raw, 'abc123')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"result":"deleted"}')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://pasefbdemcxxwdquofzt.supabase.co/functions/v1/zalo-webhook')
    expect(init.body).toBe(raw)
    expect(init.headers['X-ZEvent-Signature']).toBe('abc123')
  })

  it('event OA bình thường chỉ được ack, không chuyển tiếp', async () => {
    const raw = JSON.stringify({ app_id: 'oa-parent-app-1', event_name: 'user_send_text', message: { text: 'xin chào' } })
    const response = await post(raw, 'mac=abc')
    expect(response.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
