import { describe, expect, it, vi } from 'vitest'
import { handleReservationZcaNotify } from './handler'

function db(data: unknown, freeze: unknown = null, finish: unknown = true) {
  return {
    rpc: vi.fn(async (name: string) => {
      if (name.startsWith('claim')) return { data, error: null }
      if (name.startsWith('freeze')) return { data: freeze, error: null }
      return { data: finish, error: null }
    }),
  }
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

  it('chỉ gửi payload đã freeze; mất claim trước finish trả lost_claim', async () => {
    const payload = {
      version: 1, notification_id: 'd1', store_id: delivery.store_id,
      group_id: 'group-1', text: 'Payload đã freeze',
    }
    const database = db({ ...delivery, message_snapshot: { version: 1 } }, payload, false)
    const send = vi.fn(async () => ({ ok: true as const, providerMessageId: 'm1' }))
    await expect(handleReservationZcaNotify({ delivery_id: 'd1', dispatch_token: 't1' }, {
      db: database, send, adminOrigin: 'https://origin-moi.test',
    })).resolves.toEqual({ ok: false, status: 'lost_claim', providerCode: 'LOST_CLAIM', message: null })
    expect(send).toHaveBeenCalledWith({ notificationId: 'd1', storeId: delivery.store_id, groupId: 'group-1', text: 'Payload đã freeze' })
  })

  it('freeze không còn token hợp lệ thì không gửi relay', async () => {
    const database = db({ ...delivery, message_snapshot: { version: 1 } }, null)
    const send = vi.fn()
    await expect(handleReservationZcaNotify({ delivery_id: 'd1', dispatch_token: 't1' }, {
      db: database, send, adminOrigin: 'https://admin.test',
    })).resolves.toEqual({ ok: false, status: 'lost_claim', providerCode: 'LOST_CLAIM', message: null })
    expect(send).not.toHaveBeenCalled()
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
