import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStoreOwnerStoreId = vi.fn()
  const rpc = vi.fn()
  const orderRow = { value: null as null | Record<string, unknown> }
  const updateArgs = { value: null as unknown }
  const eqCalls: Array<[string, unknown]> = []
  const isCalls: Array<[string, unknown]> = []
  // Dòng update().select() trả về; mặc định có 1 dòng được sửa.
  const updatedRows = { value: [{ id: 'o1' }] as Array<{ id: string }> }
  const from = vi.fn(() => {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.update = vi.fn((arg: unknown) => { updateArgs.value = arg; return b })
    b.eq = vi.fn((col: string, val: unknown) => { eqCalls.push([col, val]); return b })
    b.is = vi.fn((col: string, val: unknown) => { isCalls.push([col, val]); return b })
    b.single = vi.fn(async () => ({ data: orderRow.value, error: null }))
    // update().eq() được await → thenable trả { data, error: null }
    b.then = (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: updatedRows.value, error: null })
    return b
  })
  const supabase = { rpc, from }
  const revalidatePath = vi.fn()
  return { requireStoreOwnerStoreId, rpc, from, supabase, orderRow, updateArgs, eqCalls, isCalls, updatedRows, revalidatePath }
})

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.supabase),
  createAdminClient: vi.fn(() => mocks.supabase),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { cancelOrder, confirmManualPayment, completeOrder } = await import('./orders')

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

  it('mig 110: lượt của bàn trả sau bị chặn → lỗi tiếng Việt nguyên văn, không tiền tố kỹ thuật', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)' } })
    await expect(confirmManualPayment('o1')).rejects.toThrow(/^Bàn trả sau thu cả bàn một lần ở POS \(Thanh toán\)$/)
  })
})

describe('mig 122: cổng ca ở confirm_manual_payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
    mocks.updateArgs.value = null
    mocks.orderRow.value = { payment_method: 'cash', payment_received_at: null, status: 'ready' }
  })
  it('quán bật ca chưa mở ca → câu "Chưa mở ca …" nguyên văn, không tiền tố kỹ thuật (cả xác nhận lẫn hoàn tất)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Chưa mở ca' } })
    await expect(confirmManualPayment('o1')).rejects.toThrow(/^Chưa mở ca — mở ca trên POS rồi xác nhận lại$/)
    await expect(completeOrder('o1')).rejects.toThrow(/^Chưa mở ca — mở ca trên POS rồi xác nhận lại$/)
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

  it('khách chuyển khoản (zalo_checkout, không phải ví): xác nhận đã nhận tiền RỒI đóng', async () => {
    mocks.orderRow.value = { payment_method: 'zalo_checkout', payment_received_at: null, status: 'confirmed', payment_instrument: 'bank' }
    await completeOrder('o1')
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_manual_payment', { p_order_id: 'o1' })
    expect(mocks.updateArgs.value).toEqual({ status: 'paid' })
  })

  it('đơn ví (zalo_checkout wallet): KHÔNG xác nhận tay (callback lo), chỉ đóng', async () => {
    mocks.orderRow.value = { payment_method: 'zalo_checkout', payment_received_at: null, status: 'confirmed', payment_instrument: 'wallet' }
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

  it('mig 110: lượt của bàn trả sau bị chặn thu lẻ → báo lỗi sạch, KHÔNG đóng đơn', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Bàn trả sau thu cả bàn một lần ở POS (Thanh toán)' } })
    await expect(completeOrder('o1')).rejects.toThrow(/^Bàn trả sau thu cả bàn một lần ở POS \(Thanh toán\)$/)
    expect(mocks.updateArgs.value).toBeNull()
  })

  it('đơn đã huỷ: không hoàn tất', async () => {
    mocks.orderRow.value = { payment_method: 'cash', payment_received_at: null, status: 'cancelled' }
    await expect(completeOrder('o1')).rejects.toThrow('đã huỷ')
    expect(mocks.updateArgs.value).toBeNull()
  })
})

describe('cancelOrder (vá review PA-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eqCalls.length = 0
    mocks.isCalls.length = 0
    mocks.updateArgs.value = null
    mocks.updatedRows.value = [{ id: 'o1' }]
    mocks.requireStoreOwnerStoreId.mockResolvedValue('store-1')
  })

  it('không phải chủ quán → từ chối, KHÔNG huỷ gì', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValue(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(cancelOrder('o1')).rejects.toThrow('Chỉ chủ quán')
    expect(mocks.updateArgs.value).toBeNull()
  })

  it('chỉ huỷ đơn thuộc quán của chủ quán đang đăng nhập', async () => {
    await cancelOrder('o1')
    expect(mocks.updateArgs.value).toEqual({ status: 'cancelled' })
    expect(mocks.eqCalls).toEqual(expect.arrayContaining([['id', 'o1'], ['store_id', 'store-1']]))
  })

  it('mig 112a: chỉ huỷ đơn CHƯA thu tiền — lọc payment_received_at IS NULL ngay trong câu UPDATE', async () => {
    await cancelOrder('o1')
    expect(mocks.isCalls).toEqual([['payment_received_at', null]])
  })

  it('đơn đã thu tiền (ngăn kéo A04 cũ): 0 dòng bị sửa → báo lỗi tiếng Việt, không revalidate', async () => {
    mocks.updatedRows.value = []
    await expect(cancelOrder('o1')).rejects.toThrow(/^Đơn đã thu tiền, không huỷ được$/)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
