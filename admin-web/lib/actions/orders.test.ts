import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStoreOwnerStoreId = vi.fn()
  const rpc = vi.fn()
  const supabase = { rpc }
  const revalidatePath = vi.fn()
  return { requireStoreOwnerStoreId, rpc, supabase, revalidatePath }
})

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.supabase),
  createAdminClient: vi.fn(() => mocks.supabase),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { confirmManualPayment } = await import('./orders')

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

  it('gọi RPC confirm_manual_payment với đúng order id (không tự set payment_received_at)', async () => {
    await confirmManualPayment('o1')
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_manual_payment', { p_order_id: 'o1' })
  })

  it('ném lỗi khi RPC trả lỗi (vd đơn zalopay không xác nhận tay)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Đơn thanh toán online không xác nhận tay' } })
    await expect(confirmManualPayment('o1')).rejects.toThrow('không xác nhận tay')
  })
})
