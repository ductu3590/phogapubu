import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const admin = {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      }
      return builder
    }),
  }
  return { admin }
})

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))

const { POST } = await import('./route')

const SO_TAY_WEBHOOK = 'https://pasefbdemcxxwdquofzt.supabase.co/functions/v1/zalo-webhook'

function request(raw: string, signature = 'sig-abc') {
  return new Request('https://mevo.test/api/zalo-webhook/so-tay', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zevent-signature': signature },
    body: raw,
  })
}

async function post(req: Request, storeId = 'so-tay') {
  return POST(req, { params: Promise.resolve({ storeId }) })
}

describe('zalo-webhook — chuyển tiếp Sổ Tay Buôn Đá', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    mocks.admin.from.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('chuyển nguyên body gốc + chữ ký, trả đúng status của Supabase', async () => {
    fetchMock.mockResolvedValue(new Response('retry later', { status: 500 }))
    // Khoảng trắng lạ cố ý: body phải được chuyển y nguyên, không JSON.stringify lại.
    const raw = '{"appId": 805750043345863894, "event":"user.revoke.consent","userId":"u1"}'

    const res = await post(request(raw))

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('retry later')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(SO_TAY_WEBHOOK)
    expect(init.body).toBe(raw)
    expect(init.headers['X-ZEvent-Signature']).toBe('sig-abc')
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })

  it('appId dạng chuỗi cũng được chuyển tiếp', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    const res = await post(request('{"appId":"805750043345863894","event":"x"}'))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Supabase không phản hồi → 502 để Zalo gửi lại', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = await post(request('{"appId":"805750043345863894"}'))
    expect(res.status).toBe(502)
  })

  it('app MEVO khác → không chuyển tiếp, đi luồng cũ', async () => {
    const res = await post(request('{"appId":"383290948854768685","event":"x"}'), 'store-1')
    expect(res.status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.admin.from).toHaveBeenCalledWith('store_zalo_configs')
  })
})
