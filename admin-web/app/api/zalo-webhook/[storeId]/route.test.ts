import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = { config: null as null | { zalo_app_secret_key: string; is_enabled: boolean } }
  const updates: Array<{ patch: unknown; eqs: Array<[string, unknown]> }> = []
  const admin = {
    from: vi.fn((table: string) => {
      const eqs: Array<[string, unknown]> = []
      let patch: unknown = null
      const builder = {
        select: vi.fn(() => builder),
        update: vi.fn((p: unknown) => { patch = p; return builder }),
        eq: vi.fn((k: string, v: unknown) => {
          eqs.push([k, v])
          // update(...).eq().eq() — ghi nhận khi đủ hai điều kiện
          if (table === 'orders' && eqs.length === 2) updates.push({ patch, eqs: [...eqs] })
          return table === 'orders' && eqs.length === 2 ? Promise.resolve({ error: null }) : builder
        }),
        maybeSingle: vi.fn(async () => ({ data: state.config, error: null })),
      }
      return builder
    }),
  }
  return { admin, state, updates }
})

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))

const { POST } = await import('./route')

// Chữ ký Zalo: sha256(<giá trị sort theo key A→Z, nối lại> + secret)
function sign(payload: Record<string, unknown>, secret: string) {
  const content = Object.keys(payload).sort().map((k) => String(payload[k])).join('')
  return createHash('sha256').update(`${content}${secret}`).digest('hex')
}

function post(payload: Record<string, unknown>, signature: string, storeId = 'store-1') {
  return POST(new Request(`https://mevo.test/api/zalo-webhook/${storeId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zevent-signature': signature },
    body: JSON.stringify(payload),
  }), { params: Promise.resolve({ storeId }) })
}

describe('zalo-webhook — khách rút đồng ý (user.revoke.consent)', () => {
  beforeEach(() => {
    mocks.admin.from.mockClear()
    mocks.updates.length = 0
    mocks.state.config = { zalo_app_secret_key: 'secret-1', is_enabled: true }
  })

  it('chữ ký đúng → gỡ zalo_user_id trong đúng quán', async () => {
    const payload = { event: 'user.revoke.consent', userId: 'u1', timestamp: 1 }
    const res = await post(payload, sign(payload, 'secret-1'))
    expect(res.status).toBe(200)
    expect(mocks.updates).toEqual([{ patch: { zalo_user_id: null }, eqs: [['zalo_user_id', 'u1'], ['store_id', 'store-1']] }])
  })

  it('chữ ký sai → vẫn 200 nhưng không gỡ gì', async () => {
    const res = await post({ event: 'user.revoke.consent', userId: 'u1' }, 'sai')
    expect(res.status).toBe(200)
    expect(mocks.updates).toEqual([])
  })

  it('quán chưa cấu hình secret → 200, không gỡ gì', async () => {
    mocks.state.config = null
    const res = await post({ event: 'user.revoke.consent', userId: 'u1' }, 'x')
    expect(res.status).toBe(200)
    expect(mocks.admin.from).toHaveBeenCalledWith('store_zalo_configs')
    expect(mocks.updates).toEqual([])
  })
})
