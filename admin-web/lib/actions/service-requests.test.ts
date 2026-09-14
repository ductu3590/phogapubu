import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const operator = {
    value: { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' } as {
      userId: string
      role: 'store_owner' | 'store_staff'
      storeId: string
    },
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
  closeTableSession,
  closeTableSessionsBulk,
  listOpenTableSessions,
} = await import('./table-session')
const { listOpenServiceRequests, resolveServiceRequest } = await import('./service-requests')

const OPEN_REQUEST = {
  id: 'request-1',
  store_id: 'store-1',
  table_id: 'table-1',
  table_number: 'Bàn 1',
  type: 'call_staff' as const,
  session_id: 'session-1',
  created_at: '2026-09-14T05:00:00.000Z',
  last_ping_at: '2026-09-14T05:05:00.000Z',
  ping_count: 2,
  resolved_at: null,
  resolved_by: null,
}

describe('quyền đóng phiên bàn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReset()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
    mocks.rpc.mockResolvedValue({
      data: {
        already: false,
        orders_settled: 0,
        orders_cancelled: 0,
        orders_left_in_kitchen: 0,
        total: 0,
      },
      error: null,
    })
  })

  it('staff không gọi action đóng một bill', async () => {
    mocks.operator.value = { userId: 'staff-1', role: 'store_staff', storeId: 'store-1' }

    await expect(closeTableSession('session-1', 'paid', 'cash')).resolves.toEqual({
      ok: false,
      error: 'Chỉ chủ quán được thu tiền hoặc bỏ bàn',
    })
    expect(mocks.rpc).not.toHaveBeenCalledWith('close_table_session', expect.anything())
  })

  it('staff không gọi action đóng bill hàng loạt', async () => {
    mocks.operator.value = { userId: 'staff-1', role: 'store_staff', storeId: 'store-1' }

    await expect(
      closeTableSessionsBulk(['session-1', 'session-2'], 'staff_reset', null),
    ).resolves.toEqual({
      ok: false,
      error: 'Chỉ chủ quán được thu tiền hoặc bỏ bàn',
    })
    expect(mocks.rpc).not.toHaveBeenCalledWith('close_table_sessions_bulk', expect.anything())
  })

  it.each(['paid', 'staff_reset'] as const)('staff bị chặn cả đóng lẻ lẫn bulk: %s', async reason => {
    mocks.operator.value = { userId: 'staff-1', role: 'store_staff', storeId: 'store-1' }
    expect((await closeTableSession('session-1', reason, null)).ok).toBe(false)
    expect((await closeTableSessionsBulk(['session-1'], reason, null)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('owner vẫn đóng lẻ và bulk qua RPC có audit', async () => {
    expect((await closeTableSession('session-1', 'paid', 'cash')).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('close_table_session', { p_session_id: 'session-1', p_reason: 'paid', p_instrument: 'cash' })
    expect((await closeTableSessionsBulk(['session-1'], 'staff_reset', null)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('close_table_sessions_bulk', { p_session_ids: ['session-1'], p_reason: 'staff_reset', p_instrument: null })
  })
})

describe('service request actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReset()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
    mocks.rpc.mockResolvedValue({ data: [OPEN_REQUEST], error: null })
  })

  it.each(['store_owner', 'store_staff'] as const)(
    '%s list request đúng store operator',
    async (role) => {
      mocks.operator.value = { userId: `${role}-1`, role, storeId: 'store-1' }

      await expect(listOpenServiceRequests()).resolves.toEqual({
        ok: true,
        requests: [OPEN_REQUEST],
      })
      expect(mocks.rpc).toHaveBeenCalledWith('list_open_service_requests', {
        p_store_id: 'store-1',
      })
    },
  )

  it('resolve gọi đúng RPC và trả lỗi nghiệp vụ', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Yêu cầu đã được xử lý' },
    })

    await expect(resolveServiceRequest('request-1')).resolves.toEqual({
      ok: false,
      error: 'Yêu cầu đã được xử lý',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_service_request', {
      p_request_id: 'request-1',
    })
  })

  it('resolve thành công trả trạng thái idempotent từ server', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { already: true }, error: null })

    await expect(resolveServiceRequest('request-1')).resolves.toEqual({
      ok: true,
      already: true,
    })
  })
})

describe('timeout phiên từ server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReset()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
  })

  it('gắn timeout cấu hình của quán vào từng phiên trả về', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_open_table_sessions') {
        return {
          data: [{ session_id: 'session-1', table_number: 'Bàn 1' }],
          error: null,
        }
      }
      if (name === 'get_public_store_workflow') {
        return { data: { table_session_idle_timeout_minutes: 420 }, error: null }
      }
      throw new Error(`RPC không mong đợi: ${name}`)
    })

    await expect(listOpenTableSessions()).resolves.toEqual({
      ok: true,
      sessions: [
        {
          session_id: 'session-1',
          table_number: 'Bàn 1',
          idle_timeout_minutes: 420,
        },
      ],
    })
  })

  it('lỗi tải thời lượng không làm mất bill còn nợ', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ session_id: 'expired', unpaid_total: 20000, needs_review: true }], error: null })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'workflow unavailable' } })
    expect(await listOpenTableSessions()).toEqual({ ok: true, sessions: [{ session_id: 'expired', unpaid_total: 20000, needs_review: true, idle_timeout_minutes: null }] })
  })
})
