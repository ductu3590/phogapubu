import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({
  requireStoreOwnerStoreId: mocks.requireOwner,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))

const { rejectOrder } = await import('./pos-order')

describe('rejectOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireOwner.mockResolvedValue('store-1')
    mocks.rpc.mockResolvedValue({
      data: { already: false, status: 'cancelled' },
      error: null,
    })
  })

  it('gửi đúng lý do chọn nhanh tới RPC từ chối đơn', async () => {
    await expect(rejectOrder('order-1', 'out_of_stock', null)).resolves.toEqual({
      ok: true,
      already: false,
      status: 'cancelled',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('pos_reject_order', {
      p_order_id: 'order-1',
      p_reason_code: 'out_of_stock',
      p_reason_note: null,
    })
  })

  it('không gọi RPC khi lý do khác không có nội dung', async () => {
    await expect(rejectOrder('order-1', 'other', '   ')).resolves.toEqual({
      ok: false,
      error: 'Vui lòng nhập lý do khác',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('chặn trước RPC nếu không phải chủ quán', async () => {
    mocks.requireOwner.mockRejectedValue(new Error('Chỉ chủ quán'))
    await expect(rejectOrder('order-1', 'duplicate', null)).resolves.toEqual({
      ok: false,
      error: 'Chỉ chủ quán',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
