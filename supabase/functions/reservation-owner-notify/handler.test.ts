import { describe, expect, it, vi } from 'vitest'
import { handleReservationOwnerNotify } from './handler'

function db(data: unknown) {
  return { rpc: vi.fn(async (name: string) => name.startsWith('claim') ? { data, error: null } : { data: true, error: null }) }
}

const delivery = { delivery_id: 'd1', store_id: 's1', kind: 'owner_test' as const, oa_user_id: 'u1', oa_access_token: 'token', customer_name: null, customer_phone: null, party_size: null, arrival_at: null }

describe('reservation owner notify handler', () => {
  it('claim null là no-op, không gửi lại delivery đã xử lý', async () => {
    const database = db(null)
    const send = vi.fn()
    await expect(handleReservationOwnerNotify({ delivery_id: 'd1', dispatch_token: 't1' }, { db: database, send, adminOrigin: 'https://admin.test' })).resolves.toEqual({ ok: true, skipped: true })
    expect(send).not.toHaveBeenCalled()
  })
  it('gửi thành công rồi finish sent', async () => {
    const database = db(delivery)
    const send = vi.fn(async () => ({ ok: true as const, providerMessageId: 'm1' }))
    const result = await handleReservationOwnerNotify({ delivery_id: 'd1', dispatch_token: 't1' }, { db: database, send, adminOrigin: 'https://admin.test' })
    expect(result).toMatchObject({ ok: true, status: 'sent' })
    expect(database.rpc).toHaveBeenCalledWith('finish_reservation_owner_notification', expect.objectContaining({ p_status: 'sent', p_provider_detail: 'm1' }))
  })
  it('provider lỗi retryable thì finish failed', async () => {
    const database = db(delivery)
    const send = vi.fn(async () => ({ ok: false as const, providerCode: '429', message: 'rate', retryable: true }))
    const result = await handleReservationOwnerNotify({ delivery_id: 'd1', dispatch_token: 't1' }, { db: database, send, adminOrigin: 'https://admin.test' })
    expect(result).toMatchObject({ ok: false, status: 'failed', message: 'rate' })
  })
})
