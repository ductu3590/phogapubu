import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const operator = {
    value: { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' } as
      | { userId: string; role: 'store_owner' | 'store_staff'; storeId: string }
      | { userId: string; role: 'mevo_superadmin'; storeId: null },
  }
  const rpc = vi.fn()
  const requireOperator = vi.fn(async () => operator.value)

  return { operator, requireOperator, rpc }
})

vi.mock('@/lib/auth/operator', () => ({
  requireOperator: mocks.requireOperator,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))

const {
  arriveReservation,
  confirmReservation,
  listReservations,
  markReservationNoShow,
  rejectReservation,
} = await import('./reservations')

const RANGE = {
  startsAt: '2026-09-20T00:00:00.000Z',
  endsAt: '2026-09-21T00:00:00.000Z',
}

const RPC_RESERVATION = {
  reservation_id: 'reservation-1',
  store_id: 'store-1',
  status: 'confirmed',
  customer_name: 'Nguyễn Văn A',
  customer_phone: '0900000000',
  party_size: 8,
  arrival_at: '2026-09-20T12:00:00.000Z',
  note: 'Gần sân khấu',
  requested_arrival_at: null,
  requested_party_size: null,
  change_note: null,
  created_at: '2026-09-19T00:00:00.000Z',
  updated_at: '2026-09-19T00:00:00.000Z',
  table_ids: ['table-1', 'table-2'],
  table_numbers: ['Bàn 1', 'Bàn 2'],
  suggested_table_count: 2,
}

describe('reservation actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
    mocks.requireOperator.mockImplementation(async () => mocks.operator.value)
    mocks.rpc.mockResolvedValue({ data: RPC_RESERVATION, error: null })
  })

  it('owner chỉ dùng store trong operator, gọi đúng khoảng thời gian và map camelCase', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [RPC_RESERVATION], error: null })

    await expect(listReservations(RANGE)).resolves.toEqual({
      ok: true,
      reservations: [{
        reservationId: 'reservation-1',
        storeId: 'store-1',
        status: 'confirmed',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0900000000',
        partySize: 8,
        arrivalAt: '2026-09-20T12:00:00.000Z',
        note: 'Gần sân khấu',
        requestedArrivalAt: null,
        requestedPartySize: null,
        changeNote: null,
        createdAt: '2026-09-19T00:00:00.000Z',
        updatedAt: '2026-09-19T00:00:00.000Z',
        tableIds: ['table-1', 'table-2'],
        tableNumbers: ['Bàn 1', 'Bàn 2'],
        suggestedTableCount: 2,
        sessionId: null,
        already: false,
      }],
    })
    expect(mocks.rpc).toHaveBeenCalledWith('list_store_reservations', {
      p_store_id: 'store-1',
      p_starts_at: RANGE.startsAt,
      p_ends_at: RANGE.endsAt,
    })
  })

  it.each([
    ['xác nhận', () => confirmReservation('reservation-1', ['table-1'], null)],
    ['từ chối', () => rejectReservation('reservation-1', 'Hết bàn')],
    ['nhận khách', () => arriveReservation('reservation-1')],
    ['no-show', () => markReservationNoShow('reservation-1', null)],
  ])('staff bị chặn %s trước RPC', async (_action, invoke) => {
    mocks.operator.value = { userId: 'staff-1', role: 'store_staff', storeId: 'store-1' }

    await expect(invoke()).resolves.toEqual({
      ok: false,
      error: 'Chỉ chủ quán được xử lý đặt bàn',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('owner gọi các RPC quyết định đúng payload và trả lỗi nghiệp vụ nguyên văn', async () => {
    await expect(confirmReservation('reservation-1', ['table-1', 'table-2'], 'Đoàn 8 khách')).resolves.toMatchObject({
      ok: true,
      reservation: { reservationId: 'reservation-1', tableNumbers: ['Bàn 1', 'Bàn 2'] },
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('confirm_reservation', {
      p_reservation_id: 'reservation-1',
      p_table_ids: ['table-1', 'table-2'],
      p_note: 'Đoàn 8 khách',
    })

    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Bàn đang có khách, hãy xử lý phiên hiện tại trước' },
    })
    await expect(arriveReservation('reservation-1')).resolves.toEqual({
      ok: false,
      error: 'Bàn đang có khách, hãy xử lý phiên hiện tại trước',
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('arrive_reservation', {
      p_reservation_id: 'reservation-1',
    })
  })

  it('owner từ chối và no-show qua RPC riêng, không gửi storeId từ client', async () => {
    await expect(rejectReservation('reservation-1', 'Hết bàn')).resolves.toMatchObject({
      ok: true,
      reservation: { reservationId: 'reservation-1' },
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('reject_reservation', {
      p_reservation_id: 'reservation-1',
      p_reason: 'Hết bàn',
    })

    await expect(markReservationNoShow('reservation-1', null)).resolves.toMatchObject({
      ok: true,
      reservation: { reservationId: 'reservation-1' },
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('mark_reservation_no_show', {
      p_reservation_id: 'reservation-1',
      p_note: null,
    })
  })
})
