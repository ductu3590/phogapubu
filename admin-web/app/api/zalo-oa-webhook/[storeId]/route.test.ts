import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rows: Record<string, unknown> = {}
  const rpc = vi.fn()
  const admin = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
      }
      return builder
    }),
    rpc,
  }
  return { rows, rpc, admin }
})

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))

const { POST } = await import('./route')

function payload(overrides: Record<string, unknown> = {}) {
  return {
    app_id: 'app-123',
    sender: { id: 'owner-uid-456' },
    recipient: { id: 'oa-789' },
    event_name: 'user_send_text',
    message: { text: 'MEVO A1B2C3D4E5F60718293A4B5C', msg_id: 'msg-001' },
    timestamp: '1789952400000',
    ...overrides,
  }
}

function signedRequest(body = payload(), secret = 'oa-secret-test') {
  const raw = JSON.stringify(body)
  const digest = createHash('sha256')
    .update(`${String(body.app_id)}${raw}${String(body.timestamp)}${secret}`)
    .digest('hex')
  return new Request('https://mevo.test/api/zalo-oa-webhook/store-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zevent-signature': `mac=${digest}` },
    body: raw,
  })
}

async function post(request: Request) {
  return POST(request, { params: Promise.resolve({ storeId: 'store-1' }) })
}

describe('Zalo OA owner onboarding webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mocks.rows, {
      stores: { zalo_oa_id: 'oa-789' },
      store_app_configs: { zalo_mini_app_id: 'app-123' },
      store_zalo_configs: { zalo_app_secret_key: 'oa-secret-test', is_enabled: true },
    })
    mocks.rpc.mockResolvedValue({ data: { status: 'claimed' }, error: null })
  })

  it('từ chối trước DB khi thiếu hoặc sai chữ ký', async () => {
    const request = signedRequest()
    request.headers.set('x-zevent-signature', 'mac=00')
    const response = await post(request)
    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['store_app_configs', { zalo_mini_app_id: 'app-other' }],
    ['stores', { zalo_oa_id: 'oa-other' }],
  ])('từ chối app/OA không thuộc store trong URL', async (table, row) => {
    mocks.rows[table] = row
    const response = await post(signedRequest())
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('bỏ qua event không phải user_send_text và không claim mã', async () => {
    const response = await post(signedRequest(payload({ event_name: 'user_send_image' })))
    expect(response.status).toBe(202)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('event hợp lệ chỉ gửi hash code và tenant identity vào RPC', async () => {
    const response = await post(signedRequest())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('claim_zalo_oa_onboarding_challenge', {
      p_store_id: 'store-1',
      p_app_id: 'app-123',
      p_oa_id: 'oa-789',
      p_oa_user_id: 'owner-uid-456',
      p_message_id: 'msg-001',
      p_code_hash: 'dd1a64dd3c7b400cef802f66cfb747337dd6a290d2aeeda2cb0c1e72db3ec6af',
    })
    expect(JSON.stringify(body)).not.toContain('owner-uid-456')
  })

  it('code sai/hết hạn vẫn trả phản hồi chung, không lộ nguyên nhân cho người gửi', async () => {
    mocks.rpc.mockResolvedValue({ data: { status: 'invalid' }, error: null })
    const response = await post(signedRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})
