import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
}))

vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))

const { loadBusinessDayStart, resolveReportDay } = await import('./bills-report')

// 01:00 sáng 02/11 giờ VN
const ONE_AM = new Date('2026-11-01T18:00:00Z')

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: { business_day_start: '05:00' }, error: null })
})

describe('resolveReportDay', () => {
  it('01:00 sáng 02/11, quán 05:00: gõ ?date=2026-11-02 kẹp về 2026-11-01', async () => {
    await expect(resolveReportDay('2026-11-02', ONE_AM)).resolves.toEqual({
      date: '2026-11-01', today: '2026-11-01', isToday: true,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('get_public_store_workflow', { p_store_id: 'store-1' })
  })

  it('không có ?date: lấy ngày kinh doanh hiện tại', async () => {
    await expect(resolveReportDay(undefined, ONE_AM)).resolves.toEqual({
      date: '2026-11-01', today: '2026-11-01', isToday: true,
    })
  })

  it('xem ngày cũ: isToday false', async () => {
    await expect(resolveReportDay('2026-10-30', ONE_AM)).resolves.toEqual({
      date: '2026-10-30', today: '2026-11-01', isToday: false,
    })
  })

  it('RPC lỗi hoặc trả null: coi như 00:00, không ném', async () => {
    const calendar = { date: '2026-11-02', today: '2026-11-02', isToday: true }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'hỏng' } })
    await expect(resolveReportDay(undefined, ONE_AM)).resolves.toEqual(calendar)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(resolveReportDay(undefined, ONE_AM)).resolves.toEqual(calendar)
    mocks.rpc.mockRejectedValueOnce(new Error('mất mạng'))
    await expect(resolveReportDay(undefined, ONE_AM)).resolves.toEqual(calendar)
  })

  it('không phải chủ quán hay thu ngân: để lỗi quyền đi lên, không đọc cài đặt', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    await expect(resolveReportDay(undefined, ONE_AM)).rejects.toThrow('Chỉ chủ quán hoặc thu ngân')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('loadBusinessDayStart', () => {
  it('server chưa áp mig 111 (thiếu khoá) hoặc giá trị lạ: 00:00', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { table_ordering_enabled: true }, error: null })
    await expect(loadBusinessDayStart('store-1')).resolves.toBe('00:00')
    mocks.rpc.mockResolvedValueOnce({ data: { business_day_start: 'abc' }, error: null })
    await expect(loadBusinessDayStart('store-1')).resolves.toBe('00:00')
  })

  it('trả giờ của quán', async () => {
    await expect(loadBusinessDayStart('store-1')).resolves.toBe('05:00')
  })
})
