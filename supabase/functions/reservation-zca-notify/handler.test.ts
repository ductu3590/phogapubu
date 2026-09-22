import { describe, expect, it, vi } from 'vitest'
import { handleReservationZcaNotify } from './handler'

function db(data: unknown) {
  return { rpc: vi.fn(async (name: string) => name.startsWith('claim') ? { data, error: null } : { data: true, error: null }) }
}

const delivery = {
  delivery_id: 'd1', store_id: '2139c162-9677-4cbd-87e3-d2e1ac22e6e8', reservation_id: 'r1',
  kind: 'owner_new_reservation' as const, destination_group_id: 'group-1', customer_name: 'Anh Nam',
  party_size: 4, arrival_at: '2026-09-23T12:00:00.000Z', customer_phone: 'must-not-exist', note: 'must-not-exist',
}

describe('reservation ZCA notify handler', () => {
  it('claim null là no-op, không gửi delivery đã xử lý', async () => {
    const database = db(null)
    const send = vi.fn()
    await expect(handleReservationZcaNotify({ delivery_id: 'd1', dispatch_token: 't1' }, { db: database, send, adminOrigin: 'https://admin.test' }))
      .resolves.toEqual({ ok: true, skipped: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('gửi thành công rồi finish sent; text không bao giờ chứa SĐT hay ghi chú', async () => {
    const database = db(delivery)
    const send = vi.fn(async () => ({ ok: true as const, providerMessageId: 'm1' }))
    const result = await handleReservationZcaNotify({ delivery_id: 'd1', dispatch_token: 't1' }, { db: database, send, adminOrigin: 'https://admin.test' })
    expect(result).toMatchObject({ ok: true, status: 'sent' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ notificationId: 'd1', groupId: 'group-1', text: expect.not.stringContaining('must-not-exist') }))
    expect(database.rpc).toHaveBeenCalledWith('finish_reservation_zca_notification', expect.objectContaining({ p_status: 'sent', p_provider_detail: 'm1' }))
  })

  it.each([
    ['BOT_OFFLINE', true, 'failed'], ['RATE_LIMITED', true, 'failed'], ['GROUP_NOT_FOUND', false, 'action_required'],
    ['INVALID_REQUEST', false, 'action_required'], ['PROVIDER_REJECTED', true, 'action_required'],
  ])('map %s an toàn sang %s', async (code, retryable, status) => {
    const database = db(delivery)
    const result = await handleReservationZcaNotify({ delivery_id: 'd1', dispatch_token: 't1' }, {
      db: database, adminOrigin: 'https://admin.test',
      send: vi.fn(async () => ({ ok: false as const, code, message: 'relay error', retryable })),
    })
    expect(result).toMatchObject({ ok: false, status, providerCode: code })
    expect(database.rpc).toHaveBeenCalledWith('finish_reservation_zca_notification', expect.objectContaining({ p_status: status, p_provider_code: code }))
  })
})
