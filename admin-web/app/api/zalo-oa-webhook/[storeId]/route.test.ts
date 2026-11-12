import { describe, expect, it, vi } from 'vitest'

const { POST, GET } = await import('./route')

describe('Webhook Zalo OA — chỉ ack', () => {
  it('GET và POST đều trả 200, không gọi ra ngoài', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      expect((await GET()).status).toBe(200)
      const res = await POST()
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
