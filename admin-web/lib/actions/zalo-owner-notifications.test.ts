import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperadmin = vi.fn()
  const revalidatePath = vi.fn()
  const rows: Record<string, unknown> = {}
  const updates: Array<{ table: string; value: unknown; filters: Array<[string, unknown]> }> = []
  const rpc = vi.fn()
  const admin = {
    from: vi.fn((table: string) => {
      const filters: Array<[string, unknown]> = []
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value])
          return builder
        }),
        maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
        update: vi.fn((value: unknown) => {
          updates.push({ table, value, filters })
          return builder
        }),
        then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }
      return builder
    }),
    rpc,
  }
  return { requireSuperadmin, revalidatePath, rows, updates, rpc, admin }
})

vi.mock('@/lib/auth/operator', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const {
  createOwnerOaChallenge,
  disableOwnerOaRecipient,
  getOwnerOaNotificationState,
} = await import('./zalo-owner-notifications')

describe('owner OA onboarding actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updates.length = 0
    Object.assign(mocks.rows, {
      stores: { zalo_oa_id: 'oa-789' },
      store_app_configs: { zalo_mini_app_id: 'app-123' },
      store_zalo_configs: {
        zalo_oa_access_token: 'access-token-secret',
        zalo_app_secret_key: 'app-secret-secret',
        is_enabled: true,
      },
      store_zalo_notification_recipients: {
        status: 'verified',
        oa_user_id: 'owner-uid-secret',
        verified_at: '2026-09-21T00:00:00Z',
        last_tested_at: null,
        last_test_status: null,
      },
    })
    mocks.requireSuperadmin.mockResolvedValue({
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'mevo_superadmin',
      storeId: null,
    })
    mocks.rpc.mockResolvedValue({ data: 'challenge-1', error: null })
  })

  it('tạo mã 96-bit, chỉ trả message một lần và chỉ lưu SHA-256', async () => {
    const result = await createOwnerOaChallenge('store-1')
    expect(result.message).toMatch(/^MEVO [A-F0-9]{24}$/)
    const code = result.message.slice(5)
    const expectedHash = createHash('sha256').update(code).digest('hex')
    expect(mocks.rpc).toHaveBeenCalledWith('create_zalo_oa_onboarding_challenge', expect.objectContaining({
      p_store_id: 'store-1',
      p_code_hash: expectedHash,
      p_created_by: '00000000-0000-0000-0000-000000000001',
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(code)
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
  })

  it.each([
    ['stores', { zalo_oa_id: null }, 'OA ID'],
    ['store_app_configs', { zalo_mini_app_id: null }, 'Mini App ID'],
    ['store_zalo_configs', { zalo_app_secret_key: null, is_enabled: true }, 'App Secret'],
  ])('không tạo challenge khi thiếu cấu hình bắt buộc', async (table, row, error) => {
    mocks.rows[table] = row
    await expect(createOwnerOaChallenge('store-1')).rejects.toThrow(error)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('trạng thái cockpit chỉ trả boolean credential và không lộ token, secret hoặc OA UID', async () => {
    const state = await getOwnerOaNotificationState('store-1')
    expect(state).toMatchObject({
      hasOaId: true,
      hasMiniAppId: true,
      hasAccessToken: true,
      hasAppSecret: true,
      recipientStatus: 'verified',
    })
    const serialized = JSON.stringify(state)
    expect(serialized).not.toContain('access-token-secret')
    expect(serialized).not.toContain('app-secret-secret')
    expect(serialized).not.toContain('owner-uid-secret')
  })

  it('tắt recipient đúng store và không nhận OA UID từ input', async () => {
    await disableOwnerOaRecipient('store-1')
    expect(mocks.updates).toContainEqual(expect.objectContaining({
      table: 'store_zalo_notification_recipients',
      value: expect.objectContaining({ status: 'disabled' }),
    }))
    expect(JSON.stringify(mocks.updates)).toContain('store-1')
  })

  it('chặn toàn bộ thao tác khi không phải MEVO superadmin', async () => {
    mocks.requireSuperadmin.mockRejectedValue(new Error('Chỉ MEVO superadmin'))
    await expect(createOwnerOaChallenge('store-1')).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
