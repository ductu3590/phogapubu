import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { saveBusinessDayStart } = await import('./business-day')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: { ok: true, business_day_start: '05:00' }, error: null })
})

describe('saveBusinessDayStart', () => {
  it('giờ không có trong danh sách: trả lỗi, không gọi RPC', async () => {
    for (const start of ['05:15', '12:30', 'abc', '']) {
      await expect(saveBusinessDayStart(start)).resolves.toEqual({
        ok: false, error: 'Giờ bắt đầu ngày phải từ 00:00 đến 12:00, bước 30 phút',
      })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('không phải chủ quán: trả {ok:false}, không ném', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(saveBusinessDayStart('05:00')).resolves.toEqual({
      ok: false, error: 'Chỉ chủ quán mới thao tác được ở đây',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('RPC lỗi: trả nguyên message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Chỉ chủ quán được đổi giờ bắt đầu ngày' } })
    await expect(saveBusinessDayStart('05:00')).resolves.toEqual({
      ok: false, error: 'Chỉ chủ quán được đổi giờ bắt đầu ngày',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('thành công: gọi set_business_day_start với store của operator, revalidate /admin layout', async () => {
    await expect(saveBusinessDayStart('05:00')).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('set_business_day_start', { p_store_id: 'store-1', p_start: '05:00' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin', 'layout')
  })
})
