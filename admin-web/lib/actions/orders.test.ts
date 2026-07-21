import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStoreOwnerStoreId = vi.fn()
  const rpc = vi.fn()
  const orderRow = { value: null as null | Record<string, unknown> }
  const updateArgs = { value: null as unknown }
  const from = vi.fn(() => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.update = vi.fn((arg: unknown) => { updateArgs.value = arg; return b })
    b.eq = vi.fn(() => b)
    b.single = vi.fn(async () => ({ data: orderRow.value, error: null }))
    // update().eq() được await → thenable trả { error: null }
    b.then = (resolve: (v: { error: null }) => void) => resolve({ error: null })
    return b
  })
  const supabase = { rpc, from }
  const revalidatePath = vi.fn()
  return { requireStoreOwnerStoreId, rpc, from, supabase, orderRow, updateArgs, revalidatePath }
})

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.supabase),
  createAdminClient: vi.fn(() => mocks.supabase),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { confirmManualPayment, completeOrder } = await import('./orders')

describe('confirmManualPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })
  })

  it('từ chối TRƯỚC khi gọi RPC nếu không phải chủ quán', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(confirmManualPayment('o1')).rejects.toThrow('Chỉ chủ quán')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('gọi RPC confirm_manual_payment với đúng order id', async () => {
    await confirmManualPayment('o1')
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_manual_payment', { p_order_id: 'o1' })
  })

  it('ném lỗi khi RPC trả lỗi (vd đơn zalopay không xác nhận tay)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Đơn thanh toán online không xác nhận tay' } })
    await expect(confirmManualPayment('o1')).rejects.toThrow('không xác nhận tay')
  })
})

describe('completeOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })
    mocks.updateArgs.value = null
    mocks.orderRow.value = { payment_method: 'cash', payment_received_at: null, status: 'ready' }
  })

  it('từ chối nếu không phải chủ quán', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(completeOrder('o1')).rejects.toThrow('Chỉ chủ quán')
  })

  it('tiền mặt chưa thu: xác nhận đã nhận tiền RỒI đóng đơn (status=paid)', async () => {
    await completeOrder('o1')
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_manual_payment', { p_order_id: 'o1' })
    expect(mocks.updateArgs.value).toEqual({ status: 'paid' })
  })

  it('zalopay: KHÔNG gọi xác nhận tay, chỉ đóng đơn', async () => {
    mocks.orderRow.value = { payment_method: 'zalopay', payment_received_at: null, status: 'confirmed' }
    await completeOrder('o1')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.updateArgs.value).toEqual({ status: 'paid' })
  })

  it('đơn đã nhận tiền rồi: bỏ qua xác nhận, chỉ đóng', async () => {
    mocks.orderRow.value = { payment_method: 'bank_transfer', payment_received_at: '2026-07-21T10:00:00Z', status: 'ready' }
    await completeOrder('o1')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.updateArgs.value).toEqual({ status: 'paid' })
  })

  it('đơn đã huỷ: không hoàn tất', async () => {
    mocks.orderRow.value = { payment_method: 'cash', payment_received_at: null, status: 'cancelled' }
    await expect(completeOrder('o1')).rejects.toThrow('đã huỷ')
    expect(mocks.updateArgs.value).toBeNull()
  })
})
