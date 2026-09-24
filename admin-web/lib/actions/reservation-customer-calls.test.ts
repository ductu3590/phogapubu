import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const operator = { value: { role: 'store_owner', storeId: 'store-1' } as { role: string; storeId: string } }
  const rpc = vi.fn()
  return { operator, rpc, requireOperator: vi.fn(async () => operator.value) }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }))

const { listReservationCustomerCalls, resolveReservationCustomerCall } = await import('./reservation-customer-calls')

describe('reservation customer call actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operator.value = { role: 'store_owner', storeId: 'store-1' }
  })

  it('chỉ dùng store của owner và map task từ RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ task_id: 'task-1', reservation_id: 'booking-1', customer_name: 'A', customer_phone: '0900', party_size: 2, arrival_at: '2026-09-24T12:00:00Z', due_at: '2026-09-24T11:00:00Z', created_at: '2026-09-24T09:00:00Z' }], error: null })
    await expect(listReservationCustomerCalls()).resolves.toMatchObject({ ok: true, value: [{ taskId: 'task-1', reservationId: 'booking-1' }] })
    expect(mocks.rpc).toHaveBeenCalledWith('list_reservation_customer_calls', { p_store_id: 'store-1' })
  })

  it('staff bị chặn trước khi gọi RPC; resolve chỉ nhận outcome hợp lệ theo type', async () => {
    mocks.operator.value = { role: 'store_staff', storeId: 'store-1' }
    await expect(listReservationCustomerCalls()).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán được xử lý việc gọi nhắc khách' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.operator.value = { role: 'store_owner', storeId: 'store-1' }
    mocks.rpc.mockResolvedValueOnce({ data: { already: false }, error: null })
    await expect(resolveReservationCustomerCall('task-1', 'called')).resolves.toEqual({ ok: true, value: { already: false } })
    expect(mocks.rpc).toHaveBeenLastCalledWith('resolve_reservation_customer_call', { p_task_id: 'task-1', p_outcome: 'called' })
  })
})
