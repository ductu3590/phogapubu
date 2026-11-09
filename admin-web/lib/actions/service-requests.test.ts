import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const operator = {
    value: { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' } as {
      userId: string
      role: 'store_owner' | 'store_staff' | 'store_cashier' | 'store_manager'
      storeId: string
    },
  }
  const rpc = vi.fn()
  const requireOperator = vi.fn(async () => operator.value)
  // Vai được isPosRole nhận thêm (giả lập vai quầy mới, vd. quản lý, thêm ở nhánh khác).
  const extraPosRoles = new Set<string>()

  const revalidatePath = vi.fn()

  return { operator, requireOperator, rpc, extraPosRoles, revalidatePath }
})

vi.mock('@/lib/auth/operator', () => ({
  requireOperator: mocks.requireOperator,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/auth/roles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/roles')>()
  return {
    ...actual,
    isPosRole: (role: Parameters<typeof actual.isPosRole>[0]) =>
      (role !== null && mocks.extraPosRoles.has(role)) || actual.isPosRole(role),
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))

const {
  closeTableSession,
  collectTableBill,
  listOpenTableSessions,
} = await import('./table-session')
const { listOpenServiceRequests, resolveServiceRequest } = await import('./service-requests')
const { collectSessionBill } = await import('./bill-detail')
const { listStaffUpcomingReservedTables } = await import('./staff-reservations')

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

  it('staff không bỏ bàn được', async () => {
    mocks.operator.value = { userId: 'staff-1', role: 'store_staff', storeId: 'store-1' }

    await expect(closeTableSession('session-1', 'staff_reset')).resolves.toEqual({
      ok: false,
      error: 'Chỉ chủ quán, quản lý hoặc thu ngân được thu tiền hoặc bỏ bàn',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('owner bỏ bàn qua RPC có audit, p_instrument luôn null (mig 112b: close_table_session chỉ còn staff_reset)', async () => {
    expect((await closeTableSession('session-1', 'staff_reset')).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('close_table_session', { p_session_id: 'session-1', p_reason: 'staff_reset', p_instrument: null })
  })
})

describe('service request actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReset()
    mocks.operator.value = { userId: 'owner-1', role: 'store_owner', storeId: 'store-1' }
    mocks.rpc.mockResolvedValue({ data: [OPEN_REQUEST], error: null })
  })

  it.each(['store_owner', 'store_staff', 'store_cashier', 'store_manager'] as const)(
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

describe('thu ngân ở quầy (PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.operator.value = { userId: 'cashier-1', role: 'store_cashier', storeId: 'store-1' }
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, orders_settled: 1, orders_cancelled: 0, orders_left_in_kitchen: 0, total: 100000, sessions: 1 }, error: null })
  })

  it('thu ngân bỏ bàn được', async () => {
    expect((await closeTableSession('session-1', 'staff_reset')).ok).toBe(true)
  })

  it('A04 collectSessionBill: một phương tiện, đúng số, mã chống trùng → collect_table_bill', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, payment_id: 'p1', total: 90000, orders_settled: 2 }, error: null })
    const a = '11111111-1111-4111-8111-111111111111'
    const b = '22222222-2222-4222-8222-222222222222'
    const rid = '33333333-3333-4333-8333-333333333333'
    expect(await collectSessionBill([a, b], 'bank', 90000, rid)).toEqual({ ok: true, already: false, lines: [], cashGiven: null, changeAmount: null })
    expect(mocks.rpc).toHaveBeenCalledWith('collect_table_bill', {
      p_session_ids: [a, b], p_lines: [{ instrument: 'bank', amount: 90000 }], p_cash_given: null, p_client_request_id: rid,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/bills')
  })

  it('A04 collectSessionBill: bill 0đ gửi lines rỗng; số tiền xấu / phương tiện lạ / không có bàn bị chặn trước RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, payment_id: 'p1', total: 0, orders_settled: 1 }, error: null })
    const a = '11111111-1111-4111-8111-111111111111'
    expect(await collectSessionBill([a], 'cash', 0, a)).toMatchObject({ ok: true, already: false })
    expect(mocks.rpc).toHaveBeenCalledWith('collect_table_bill', expect.objectContaining({ p_lines: [] }))
    mocks.rpc.mockClear()
    expect(await collectSessionBill([a], 'cash', -1, a)).toEqual({ ok: false, error: 'Số tiền không hợp lệ' })
    expect(await collectSessionBill([a], 'cash', 1.5, a)).toEqual({ ok: false, error: 'Số tiền không hợp lệ' })
    expect(await collectSessionBill([a], 'wallet' as never, 1000, a)).toEqual({ ok: false, error: 'Phương thức thanh toán không hợp lệ' })
    expect(await collectSessionBill(['x'], 'cash', 1000, a)).toEqual({ ok: false, error: 'Không có bàn nào để thu' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('A04 collectSessionBill: already → trả khoản đã ghi để ngăn kéo báo cho thu ngân', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: true, payment_id: 'p1', total: 90000, orders_settled: 0,
      lines: [{ instrument: 'cash', amount: 90000 }], cash_given: null, change_amount: null }, error: null })
    const a = '11111111-1111-4111-8111-111111111111'
    expect(await collectSessionBill([a], 'bank', 90000, a)).toEqual({ ok: true, already: true, lines: [{ instrument: 'cash', amount: 90000 }], cashGiven: null, changeAmount: null })
  })

  it('A04 collectSessionBill: lỗi server (vd số lệch) trả nguyên văn, không revalidate', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Số tiền không khớp bill: cần thu 100000, đang ghi 90000. Tải lại bill rồi thu lại' } })
    const a = '11111111-1111-4111-8111-111111111111'
    const res = await collectSessionBill([a], 'cash', 90000, a)
    expect(res).toEqual({ ok: false, error: 'Số tiền không khớp bill: cần thu 100000, đang ghi 90000. Tải lại bill rồi thu lại' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('collectTableBill gửi đúng tham số RPC và đọc already thật', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: true, payment_id: 'p1', total: 100000, orders_settled: 0,
      lines: [{ instrument: 'cash', amount: 100000 }, { instrument: 'wallet', amount: 1 }], cash_given: 200000, change_amount: 100000 }, error: null })
    const id = '11111111-1111-4111-8111-111111111111'
    const res = await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'bank', amount: 100000 }], cashGiven: null, clientRequestId: id })
    // already: trả khoản ĐÃ GHI (tiền mặt), không phải khoản vừa gửi (chuyển khoản); phương tiện lạ bị lọc
    expect(res).toEqual({ ok: true, already: true, paymentId: 'p1', total: 100000, ordersSettled: 0,
      lines: [{ instrument: 'cash', amount: 100000 }], cashGiven: 200000, changeAmount: 100000 })
    expect(mocks.rpc).toHaveBeenCalledWith('collect_table_bill', { p_session_ids: [id], p_lines: [{ instrument: 'bank', amount: 100000 }], p_cash_given: null, p_client_request_id: id })
  })

  it('collectTableBill chặn phục vụ, mã sai, chưa chọn mâm; lỗi RPC trả nguyên văn', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const base = { sessionIds: [id], lines: [], cashGiven: null, clientRequestId: id }
    expect(await collectTableBill({ ...base, sessionIds: [] })).toEqual({ ok: false, error: 'Chưa chọn mâm nào' })
    expect(await collectTableBill({ ...base, clientRequestId: 'x' })).toEqual({ ok: false, error: 'Mã thu tiền không hợp lệ' })
    expect(await collectTableBill({ ...base, sessionIds: ['session-1'] })).toEqual({ ok: false, error: 'Mã phiên không hợp lệ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Số tiền không khớp bill' } })
    expect(await collectTableBill(base)).toEqual({ ok: false, error: 'Số tiền không khớp bill' })
    mocks.rpc.mockClear()
    mocks.operator.value = { userId: 's', role: 'store_staff', storeId: 'store-1' }
    expect(await collectTableBill(base)).toEqual({ ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được thu tiền hoặc bỏ bàn' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('vai mới mà isPosRole nhận (vd. quản lý) thu được tiền và chốt bill — staffClient không chặn cứng 3 vai', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    mocks.extraPosRoles.add('store_manager')
    try {
      mocks.operator.value = { userId: 'm', role: 'store_manager' as never, storeId: 'store-1' }
      mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, payment_id: 'p1', total: 1000, orders_settled: 1 }, error: null })
      expect((await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'cash', amount: 1000 }], cashGiven: null, clientRequestId: id })).ok).toBe(true)
      mocks.rpc.mockResolvedValue({ data: { already: false, orders_settled: 0, orders_cancelled: 1, orders_left_in_kitchen: 0, total: 0 }, error: null })
      expect((await closeTableSession('session-1', 'staff_reset')).ok).toBe(true)
    } finally {
      mocks.extraPosRoles.clear()
    }
  })

  it('vai lạ ngoài isPosRole và ngoài phục vụ vẫn bị chặn ở staffClient', async () => {
    mocks.operator.value = { userId: 'x', role: 'mevo_superadmin' as never, storeId: 'store-1' }
    expect(await listOpenTableSessions()).toEqual({ ok: false, error: 'Không có quyền' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('collectTableBill có dòng nợ: gửi thêm tham số khách; không có thì giữ 4 tham số', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, payment_id: 'p', total: 1000, orders_settled: 1 }, error: null })
    const id = '11111111-1111-4111-8111-111111111111'
    await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'debt', amount: 1000 }], cashGiven: null, clientRequestId: id, debtCustomerId: id })
    expect(mocks.rpc).toHaveBeenLastCalledWith('collect_table_bill', { p_session_ids: [id], p_lines: [{ instrument: 'debt', amount: 1000 }], p_cash_given: null, p_client_request_id: id, p_debt_customer_id: id, p_new_debt_customer: null })
    expect(await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'debt', amount: 1000 }], cashGiven: null, clientRequestId: id }))
      .toEqual({ ok: false, error: 'Chọn khách ghi nợ' })
  })

  it('collectTableBill (thêm ngoài plan): không có dòng nợ thì bỏ khách, đúng 4 tham số; khách mới; mã khách sai', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, payment_id: 'p', total: 1000, orders_settled: 1 }, error: null })
    const id = '11111111-1111-4111-8111-111111111111'
    await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'cash', amount: 1000 }], cashGiven: null, clientRequestId: id, debtCustomerId: id })
    expect(mocks.rpc).toHaveBeenLastCalledWith('collect_table_bill', { p_session_ids: [id], p_lines: [{ instrument: 'cash', amount: 1000 }], p_cash_given: null, p_client_request_id: id })
    const nc = { name: 'Anh Long', phone: null, kind: 'person' as const }
    await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'cash', amount: 500 }, { instrument: 'debt', amount: 500 }], cashGiven: null, clientRequestId: id, newDebtCustomer: nc })
    expect(mocks.rpc).toHaveBeenLastCalledWith('collect_table_bill', expect.objectContaining({ p_debt_customer_id: null, p_new_debt_customer: nc }))
    mocks.rpc.mockClear()
    expect(await collectTableBill({ sessionIds: [id], lines: [{ instrument: 'debt', amount: 1000 }], cashGiven: null, clientRequestId: id, debtCustomerId: 'x' }))
      .toEqual({ ok: false, error: 'Mã khách không hợp lệ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('collectTableBill: khách mới tên trống / SĐT sai báo sớm, không gọi RPC (debtChoiceError)', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const debtLine = [{ instrument: 'debt' as const, amount: 1000 }]
    mocks.rpc.mockClear()
    expect(await collectTableBill({ sessionIds: [id], lines: debtLine, cashGiven: null, clientRequestId: id, newDebtCustomer: { name: '  ', phone: null, kind: 'person' } }))
      .toEqual({ ok: false, error: 'Nhập tên khách' })
    expect(await collectTableBill({ sessionIds: [id], lines: debtLine, cashGiven: null, clientRequestId: id, newDebtCustomer: { name: 'A', phone: '12', kind: 'person' } }))
      .toEqual({ ok: false, error: 'SĐT không hợp lệ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('collectTableBill: RPC không lỗi mà không có dữ liệu → báo tải lại, không ném; số đếm ép kiểu số', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const input = { sessionIds: [id], lines: [], cashGiven: null, clientRequestId: id }
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect(await collectTableBill(input)).toEqual({ ok: false, error: 'Không nhận được kết quả thu tiền, tải lại trang để kiểm tra' })
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, payment_id: 'p1', total: '0', orders_settled: '2' }, error: null })
    expect(await collectTableBill(input)).toEqual({ ok: true, already: false, paymentId: 'p1', total: 0, ordersSettled: 2, lines: [], cashGiven: null, changeAmount: null })
  })

  it('xem và xử lý gọi nhân viên', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(listOpenServiceRequests()).resolves.toMatchObject({ ok: true })
  })
})

// Vai Quản lý (mig 116) dùng được các action /staff giống chủ quán / thu ngân: nút chuông, danh sách bàn,
// bàn đặt trước sắp tới. RPC phía DB kiểm lại bằng is_store_scoped_operator / is_store_pos_operator.
describe('quản lý (QL) ở khu /staff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReset()
    mocks.operator.value = { userId: 'm1', role: 'store_manager', storeId: 'store-1' }
  })

  it('resolveServiceRequest gọi RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { already: false }, error: null })
    await expect(resolveServiceRequest('request-1')).resolves.toMatchObject({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_service_request', { p_request_id: 'request-1' })
  })

  it('listOpenTableSessions gọi RPC list_open_table_sessions', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    await listOpenTableSessions()
    expect(mocks.rpc).toHaveBeenCalledWith('list_open_table_sessions', expect.anything())
  })

  it('listStaffUpcomingReservedTables gọi RPC đúng quán', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    await expect(listStaffUpcomingReservedTables()).resolves.toEqual({ ok: true, rows: [] })
    expect(mocks.rpc).toHaveBeenCalledWith('list_staff_upcoming_reserved_tables', { p_store_id: 'store-1' })
  })
})
