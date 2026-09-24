import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, getOrCreateDeviceId } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
}))

vi.mock('../supabase', () => ({ supabase: { rpc } }))
vi.mock('../device-id', () => ({ getOrCreateDeviceId }))

import { orderService, sessionOrderService } from './order.api'

describe('sessionOrderService.callStaff', () => {
  beforeEach(() => {
    rpc.mockReset()
    getOrCreateDeviceId.mockReset()
    getOrCreateDeviceId.mockReturnValue('device-1')
    rpc.mockResolvedValue({ data: { id: 'request-1' }, error: null })
  })

  it('ping RPC gọi nhân viên của bàn, không ghi trực tiếp service_requests', async () => {
    await expect(sessionOrderService.callStaff({ tableId: 'table-1' })).resolves.toBeUndefined()

    expect(rpc).toHaveBeenCalledWith('ping_service_request', {
      p_table_id: 'table-1',
      p_type: 'call_staff',
      p_device_id: 'device-1',
    })
  })

  it('trả lỗi throttle từ server cho UI xử lý', async () => {
    const error = new Error('Vui lòng chờ trước khi gọi nhân viên lần nữa')
    rpc.mockResolvedValue({ data: null, error })

    await expect(sessionOrderService.callStaff({ tableId: 'table-1' })).rejects.toBe(error)
  })
})

describe('orderService.createOrder', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { id: 'order-1', store_id: 'store-1', table_id: 'table-1', status: 'pending', total_amount: 1, payment_method: 'cash', created_at: '', updated_at: '' }, error: null })
  })

  it('dùng batch QR idempotent khi gọi tại bàn có request/session context', async () => {
    await orderService.createOrder({
      storeId: 'store-1', tableId: 'table-1', paymentMethod: 'cash', deviceId: 'device-1',
      clientRequestId: '00000000-0000-0000-0000-000000000001', expectedSessionId: 'session-1',
      items: [{ menuItemId: 'menu-1', name: 'Gà', price: 1, quantity: 1 }],
    })

    expect(rpc).toHaveBeenCalledWith('create_table_order_batch', expect.objectContaining({
      p_store_id: 'store-1', p_table_id: 'table-1',
      p_client_request_id: '00000000-0000-0000-0000-000000000001',
      p_expected_session_id: 'session-1', p_device_id: 'device-1',
    }))
  })
})
