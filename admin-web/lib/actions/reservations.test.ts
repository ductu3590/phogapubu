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
  cancelStoreReservation,
  confirmReservation,
  createManualReservation,
  listReservations,
  listReservationQueue,
  markReservationNoShow,
  rejectReservation,
  rescheduleReservation,
  resolveReservationChange,
  snoozeReservationReminders,
} = await import('./reservations')

const RANGE = {
  startsAt: '2026-09-20T00:00:00.000Z',
  endsAt: '2026-09-21T00:00:00.000Z',
}

const QUEUE_RANGE = {
  recentSince: '2026-09-18T00:00:00.000Z',
  futureUntil: '2026-09-26T00:00:00.000Z',
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
  planning_hold_minutes: 180,
  reminder_snoozed_until: '2026-09-20T12:15:00.000Z',
  reminder_snoozed_by: 'owner-1',
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
        planningHoldMinutes: 180,
        sessionId: null,
        already: false,
        reminderSnoozedUntil: '2026-09-20T12:15:00.000Z',
        reminderSnoozedBy: 'owner-1',
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
    ['hủy đặt bàn', () => cancelStoreReservation('reservation-1', 'Quán đóng đột xuất')],
    ['đổi lịch', () => rescheduleReservation('reservation-1', '2026-09-21T12:00:00.000Z', 8, ['table-1'], 'Khách đổi giờ')],
    ['Snooze', () => snoozeReservationReminders(['reservation-1'], 15)],
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

  it('queue và thao tác BL-2A map đủ Snooze, chỉ gửi storeId từ operator khi RPC cần tạo/list', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [RPC_RESERVATION], error: null })
    await expect(listReservationQueue(QUEUE_RANGE)).resolves.toMatchObject({
      ok: true,
      reservations: [{
        reservationId: 'reservation-1',
        planningHoldMinutes: 180,
        reminderSnoozedUntil: '2026-09-20T12:15:00.000Z',
        reminderSnoozedBy: 'owner-1',
      }],
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('list_reservation_queue', {
      p_store_id: 'store-1',
      p_recent_since: QUEUE_RANGE.recentSince,
      p_future_until: QUEUE_RANGE.futureUntil,
    })

    const manual = {
      customerName: 'Khách vãng lai',
      customerPhone: '0912345678',
      partySize: 10,
      arrivalAt: '2026-09-20T12:00:00.000Z',
      note: 'Gần sân khấu',
      reason: 'Khách gọi trực tiếp',
      zaloUserId: null,
    }
    await createManualReservation(manual)
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_manual_reservation', {
      p_store_id: 'store-1',
      p_payload: {
        customer_name: 'Khách vãng lai',
        customer_phone: '0912345678',
        party_size: 10,
        arrival_at: '2026-09-20T12:00:00.000Z',
        note: 'Gần sân khấu',
        reason: 'Khách gọi trực tiếp',
        zalo_user_id: null,
      },
    })

    await resolveReservationChange('reservation-1', true, ['table-1'], 'Đồng ý đổi')
    expect(mocks.rpc).toHaveBeenLastCalledWith('resolve_reservation_change', {
      p_reservation_id: 'reservation-1',
      p_accept: true,
      p_table_ids: ['table-1'],
      p_note: 'Đồng ý đổi',
    })

    await rescheduleReservation('reservation-1', '2026-09-21T12:00:00.000Z', 8, ['table-2'], 'Chủ quán đổi lịch')
    expect(mocks.rpc).toHaveBeenLastCalledWith('reschedule_reservation', {
      p_reservation_id: 'reservation-1',
      p_arrival_at: '2026-09-21T12:00:00.000Z',
      p_party_size: 8,
      p_table_ids: ['table-2'],
      p_note: 'Chủ quán đổi lịch',
    })

    mocks.rpc.mockResolvedValueOnce({
      data: { updated_count: 2, reminder_snoozed_until: '2026-09-20T12:15:00.000Z' },
      error: null,
    })
    await expect(snoozeReservationReminders(['reservation-1', 'reservation-2'], 15)).resolves.toEqual({
      ok: true,
      updatedCount: 2,
      reminderSnoozedUntil: '2026-09-20T12:15:00.000Z',
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('snooze_reservation_reminders', {
      p_reservation_ids: ['reservation-1', 'reservation-2'],
      p_minutes: 15,
    })

    await expect(cancelStoreReservation('reservation-1', 'Quán đóng đột xuất')).resolves.toMatchObject({
      ok: true,
      reservation: { reservationId: 'reservation-1' },
    })
    expect(mocks.rpc).toHaveBeenLastCalledWith('cancel_store_reservation', {
      p_reservation_id: 'reservation-1',
      p_reason: 'Quán đóng đột xuất',
    })
  })
})
