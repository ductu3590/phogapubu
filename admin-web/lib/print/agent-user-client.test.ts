import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeJwt, jwtVerify } from 'jose'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

const { createPrintUserClient } = await import('./agent-user-client')

describe('createPrintUserClient', () => {
  beforeEach(() => {
    mocks.createClient.mockReset()
    mocks.createClient.mockReturnValue({ fake: true })
    vi.stubEnv('SUPABASE_JWT_SECRET', 'test-secret-test-secret-test-secret-1234')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('JWT có sub, role authenticated, aud authenticated, exp <= 120 giây, ký đúng secret', async () => {
    await createPrintUserClient('user-1')
    const opts = mocks.createClient.mock.calls[0][2] as { accessToken: () => Promise<string> }
    const token = await opts.accessToken()
    const secret = new TextEncoder().encode('test-secret-test-secret-test-secret-1234')
    const { payload } = await jwtVerify(token, secret, { audience: 'authenticated' })
    expect(payload.sub).toBe('user-1')
    expect(payload.role).toBe('authenticated')
    const now = Math.floor(Date.now() / 1000)
    expect(payload.exp! - now).toBeLessThanOrEqual(120)
    expect(payload.exp! - now).toBeGreaterThan(100)
    expect(decodeJwt(token).iat).toBeLessThanOrEqual(now)
  })

  it('dùng anon key + URL từ env, KHÔNG dùng service role', async () => {
    await createPrintUserClient('user-1')
    expect(mocks.createClient.mock.calls[0][0]).toBe('https://x.supabase.co')
    expect(mocks.createClient.mock.calls[0][1]).toBe('anon-key')
  })

  it('thiếu SUPABASE_JWT_SECRET thì ném lỗi rõ ràng', async () => {
    vi.stubEnv('SUPABASE_JWT_SECRET', '')
    await expect(createPrintUserClient('user-1')).rejects.toThrow('SUPABASE_JWT_SECRET')
  })

  it('thiếu userId thì ném lỗi', async () => {
    await expect(createPrintUserClient('')).rejects.toThrow()
  })
})
