import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperadmin = vi.fn()
  const revalidatePath = vi.fn()
  const fetch = vi.fn()
  const rows: Record<string, unknown> = {}
  const upserts: Array<{ table: string; value: unknown }> = []
  const inserts: Array<{ table: string; value: unknown }> = []
  const admin = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
        upsert: vi.fn((value: unknown) => { upserts.push({ table, value }); return Promise.resolve({ error: null }) }),
        insert: vi.fn((value: unknown) => { inserts.push({ table, value }); return builder }),
        single: vi.fn(async () => ({ data: { id: 'delivery-1', dispatch_token: 'dispatch-1' }, error: null })),
      }
      return builder
    }),
  }
  return { requireSuperadmin, revalidatePath, fetch, rows, upserts, inserts, admin }
})

vi.mock('@/lib/auth/operator', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn(() => mocks.admin) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const {
  getGroupNotificationState,
  saveGroupNotificationChannel,
  disableGroupNotificationChannel,
  sendGroupNotificationTest,
} = await import('./reservation-group-notifications')

describe('group Zalo notification actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upserts.length = 0
    mocks.inserts.length = 0
    Object.assign(mocks.rows, {
      store_reservation_notification_channels: { provider: 'zca_group', is_enabled: true, destination_group_id: 'group-secret' },
      reservation_notification_deliveries: { status: 'sent', created_at: '2026-09-22T00:00:00Z', provider_code: 'OK' },
    })
    mocks.requireSuperadmin.mockResolvedValue({ userId: 'operator-1', role: 'mevo_superadmin', storeId: null })
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, status: 'sent', providerCode: 'message-1', message: null }) })
    vi.stubGlobal('fetch', mocks.fetch)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret'
  })

  it('state không lộ group ID và chỉ trả health delivery', async () => {
    const state = await getGroupNotificationState('store-1')
    expect(state).toMatchObject({ provider: 'zca_group', enabled: true, hasDestination: true, lastDeliveryStatus: 'sent' })
    expect(JSON.stringify(state)).not.toContain('group-secret')
  })

  it('lưu channel chỉ ghi config, không gọi relay', async () => {
    await saveGroupNotificationChannel('store-1', { enabled: true, groupId: ' group-new ' })
    expect(mocks.upserts).toContainEqual(expect.objectContaining({
      table: 'store_reservation_notification_channels',
      value: expect.objectContaining({ store_id: 'store-1', provider: 'zca_group', is_enabled: true, destination_group_id: 'group-new', updated_by: 'operator-1' }),
    }))
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('tắt channel không xóa outbox cũ và không gọi relay', async () => {
    await disableGroupNotificationChannel('store-1')
    expect(mocks.upserts).toContainEqual(expect.objectContaining({
      value: expect.objectContaining({ provider: 'none', is_enabled: false, destination_group_id: null }),
    }))
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('gửi thử tạo delivery zca và gọi Edge Function, không lộ group ID', async () => {
    await expect(sendGroupNotificationTest('store-1')).resolves.toMatchObject({ ok: true, status: 'sent' })
    expect(mocks.inserts).toContainEqual(expect.objectContaining({
      table: 'reservation_notification_deliveries',
      value: expect.objectContaining({ store_id: 'store-1', delivery_provider: 'zca_group', destination_group_id: 'group-secret', kind: 'owner_test' }),
    }))
    expect(mocks.fetch).toHaveBeenCalledWith('https://project.supabase.co/functions/v1/reservation-zca-notify', expect.objectContaining({ method: 'POST' }))
    expect(JSON.stringify(mocks.fetch.mock.calls)).not.toContain('group-secret')
  })

  it('staff không thể lưu, gửi thử hoặc tắt channel', async () => {
    mocks.requireSuperadmin.mockRejectedValue(new Error('Cần quyền MEVO superadmin'))
    await expect(saveGroupNotificationChannel('store-1', { enabled: true, groupId: 'group-1' })).rejects.toThrow('superadmin')
    await expect(sendGroupNotificationTest('store-1')).rejects.toThrow('superadmin')
    await expect(disableGroupNotificationChannel('store-1')).rejects.toThrow('superadmin')
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })
})
