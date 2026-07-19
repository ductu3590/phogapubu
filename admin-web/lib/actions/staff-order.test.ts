import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireOperator = vi.fn()
  const rpc = vi.fn()
  const supabase = { rpc }
  return { requireOperator, rpc, supabase }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => mocks.supabase) }))

const { createStaffOrder } = await import('./staff-order')

const baseInput = {
  tableId: 'table-1',
  items: [{ menu_item_id: 'm1', quantity: 2, topping_ids: ['t1'], note: null }],
  paymentMethod: 'cash' as const,
  clientRequestId: 'req-1',
  note: null,
}

describe('createStaffOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOperator.mockResolvedValue({ userId: 'u1', role: 'store_staff', storeId: 'store-1' })
    mocks.rpc.mockResolvedValue({ data: { order_id: 'o1', total: 100000 }, error: null })
  })

  it('từ chối nếu không phải staff/owner (superadmin không đặt hộ)', async () => {
    mocks.requireOperator.mockResolvedValue({ userId: 'u1', role: 'mevo_superadmin', storeId: null })
    const res = await createStaffOrder(baseInput)
    expect(res).toEqual({ ok: false, error: 'Không có quyền đặt món hộ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('ném lỗi khi operator guard fail (nhân viên đã tắt / anon)', async () => {
    mocks.requireOperator.mockRejectedValue(new Error('Tài khoản chưa được cấp quyền vận hành'))
    await expect(createStaffOrder(baseInput)).rejects.toThrow('chưa được cấp quyền')
  })

  it('gọi RPC staff_create_order với đúng tham số, KHÔNG gửi store/giá', async () => {
    await createStaffOrder(baseInput)
    expect(mocks.rpc).toHaveBeenCalledWith('staff_create_order', {
      p_table_id: 'table-1',
      p_items: [{ menu_item_id: 'm1', quantity: 2, topping_ids: ['t1'], note: null }],
      p_payment_method: 'cash',
      p_client_request_id: 'req-1',
      p_note: null,
    })
  })

  it('trả về order từ RPC khi thành công', async () => {
    const res = await createStaffOrder(baseInput)
    expect(res).toEqual({ ok: true, orderId: 'o1', total: 100000 })
  })

  it('map lỗi RPC (vd bàn quán khác) sang { ok:false }', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Bàn không thuộc quán hoặc đã ngừng dùng' } })
    const res = await createStaffOrder(baseInput)
    expect(res).toEqual({ ok: false, error: 'Bàn không thuộc quán hoặc đã ngừng dùng' })
  })

  it('từ chối giỏ rỗng trước khi gọi RPC', async () => {
    const res = await createStaffOrder({ ...baseInput, items: [] })
    expect(res).toEqual({ ok: false, error: 'Giỏ hàng đang trống' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
