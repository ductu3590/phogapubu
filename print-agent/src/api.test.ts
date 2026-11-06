import { describe, it, expect, vi } from 'vitest'
import { createApi } from './api'
import type { AgentConfig } from './config'

const config: AgentConfig = {
  supabaseUrl: 'https://abc.supabase.co',
  anonKey: 'anon-key',
  webOrigin: 'https://admin.test',
  pageSizeMode: 'measured',
}

function okJson(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
}

function sent(fetchMock: ReturnType<typeof okJson>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init, body: JSON.parse(String(init.body)) }
}

describe('api', () => {
  it('gọi đúng URL, header apikey, tên tham số p_token, p_version, p_printers', async () => {
    const f = okJson({ ok: true, job: null })
    const api = createApi(config, f as unknown as typeof fetch)
    const res = await api.poll('tok', '0.1.0', [{ name: 'XP-80' }])

    const { url, init, body } = sent(f)
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/print_agent_poll')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
      'Content-Type': 'application/json',
    })
    expect(body).toEqual({ p_token: 'tok', p_version: '0.1.0', p_printers: [{ name: 'XP-80' }] })
    expect(res).toEqual({ ok: true, job: null })
  })

  it('poll printers null: vẫn gửi p_printers null (server hiểu là không đổi)', async () => {
    const f = okJson({ ok: true, job: null })
    await createApi(config, f as unknown as typeof fetch).poll('tok', '0.1.0', null)
    expect(sent(f).body).toEqual({ p_token: 'tok', p_version: '0.1.0', p_printers: null })
  })

  it('pair: gửi p_code, p_name, p_version và trả nguyên kết quả', async () => {
    const f = okJson({ ok: true, agent_id: 'a1', token: 't1', store_name: 'Quán' })
    const res = await createApi(config, f as unknown as typeof fetch).pair('123456', 'QUAY-1', '0.1.0')
    const { url, body } = sent(f)
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/print_agent_pair')
    expect(body).toEqual({ p_code: '123456', p_name: 'QUAY-1', p_version: '0.1.0' })
    expect(res).toEqual({ ok: true, agent_id: 'a1', token: 't1', store_name: 'Quán' })
  })

  it('report: gửi đủ p_token, p_job_id, p_ok, p_error, p_retryable', async () => {
    const f = okJson({ ok: true })
    await createApi(config, f as unknown as typeof fetch).report('tok', 'job-1', false, 'Hết giấy', true)
    const { url, body } = sent(f)
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/print_agent_report')
    expect(body).toEqual({ p_token: 'tok', p_job_id: 'job-1', p_ok: false, p_error: 'Hết giấy', p_retryable: true })
  })

  it('report server trả ok:false (job đã hết hạn): không ném, tránh thử lại vô ích', async () => {
    const f = okJson({ ok: false, error: 'not_printing' })
    await expect(
      createApi(config, f as unknown as typeof fetch).report('tok', 'job-1', true, null, false),
    ).resolves.toBeUndefined()
  })

  it('HTTP lỗi ném để job-loop coi như mất mạng', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 503 }))
    await expect(createApi(config, f as unknown as typeof fetch).poll('tok', '0.1.0', null)).rejects.toThrow('503')
  })

  it('mọi lời gọi đều có hạn chờ, không treo vòng lặp khi mạng im', async () => {
    const f = okJson({ ok: true, job: null })
    await createApi(config, f as unknown as typeof fetch).poll('tok', '0.1.0', null)
    expect(sent(f).init.signal).toBeInstanceOf(AbortSignal)
  })
})
