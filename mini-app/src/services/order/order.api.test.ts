import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, getOrCreateDeviceId } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
}))

vi.mock('../supabase', () => ({ supabase: { rpc } }))
vi.mock('../device-id', () => ({ getOrCreateDeviceId }))

import { sessionOrderService } from './order.api'

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
