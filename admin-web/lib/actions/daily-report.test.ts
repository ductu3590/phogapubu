import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
  rpc: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({ requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }))

const { loadDailyReport } = await import('./daily-report')

describe('loadDailyReport (PA-1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gọi RPC đúng quán của người đăng nhập + đúng ngày, đọc ra số', async () => {
    mocks.rpc.mockResolvedValue({ data: { date: '2026-10-03', totals: { revenue: 100, bills_count: 1 } }, error: null })
    const res = await loadDailyReport('2026-10-03')
    expect(mocks.rpc).toHaveBeenCalledWith('get_daily_report', { p_store_id: 'store-1', p_date: '2026-10-03' })
    expect(res).toMatchObject({ ok: true, report: { totals: { revenue: 100, billsCount: 1 } } })
  })

  it('RPC lỗi → trả lỗi, không ném', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Không có quyền xem báo cáo quán này' } })
    await expect(loadDailyReport('2026-10-03')).resolves.toEqual({ ok: false, error: 'Không có quyền xem báo cáo quán này' })
  })
})
