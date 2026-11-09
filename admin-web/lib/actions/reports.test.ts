import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
  requireBackOfficeStoreId: vi.fn(async () => 'store-1'),
}))

vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
  requireBackOfficeStoreId: mocks.requireBackOfficeStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}))

const { REPORT_RPC, loadReport, resolveReportRange } = await import('./reports')

// 01:00 sáng 21/11 giờ VN
const ONE_AM = new Date('2026-11-20T18:00:00Z')

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.maybeSingle.mockReset()
  mocks.maybeSingle.mockResolvedValue({ data: { business_day_start: '05:00' }, error: null })
  mocks.eq.mockReset()
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.from.mockReset()
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) })
  mocks.requirePosOperatorStoreId.mockReset()
  mocks.requirePosOperatorStoreId.mockResolvedValue('store-1')
  mocks.requireBackOfficeStoreId.mockReset()
  mocks.requireBackOfficeStoreId.mockResolvedValue('store-1')
})

describe('loadReport', () => {
  it('REPORT_RPC đủ 8 tab', () => {
    expect(REPORT_RPC).toEqual({
      item: 'report_sales_by_item',
      category: 'report_sales_by_category',
      hour: 'report_sales_by_hour',
      voids: 'report_voids',
      revenue: 'report_revenue_series',
      cashflow: 'report_cash_flow',
      pnl: 'report_profit_loss',
      debts: 'report_receivables',
    })
  })

  it('loadReport tab revenue gọi report_revenue_series kèm p_grain', async () => {
    mocks.rpc.mockResolvedValue({ data: { from: '2026-12-01', to: '2026-12-03', grain: 'month', rows: [], totals: {} }, error: null })
    const res = await loadReport('revenue', '2026-12-01', '2026-12-03', 'month')
    expect(mocks.rpc).toHaveBeenLastCalledWith('report_revenue_series',
      { p_store_id: 'store-1', p_from: '2026-12-01', p_to: '2026-12-03', p_grain: 'month' })
    expect(res.ok && res.report.tab === 'revenue' && res.report.grain).toBe('month')
    await loadReport('revenue', '2026-12-01', '2026-12-03')
    expect(mocks.rpc).toHaveBeenLastCalledWith('report_revenue_series',
      { p_store_id: 'store-1', p_from: '2026-12-01', p_to: '2026-12-03', p_grain: 'day' })
    // Tab khác không nhận p_grain.
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
    for (const tab of ['cashflow', 'pnl', 'debts'] as const) {
      const r = await loadReport(tab, '2026-12-01', '2026-12-03', 'month')
      expect(r.ok && r.report.tab).toBe(tab)
      expect(mocks.rpc).toHaveBeenLastCalledWith(REPORT_RPC[tab], { p_store_id: 'store-1', p_from: '2026-12-01', p_to: '2026-12-03' })
    }
  })

  it('tab tài chính ở vai không phải hậu cần: {ok:false} tiếng Việt, không ném, không gọi RPC', async () => {
    mocks.requireBackOfficeStoreId.mockRejectedValue(new Error('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'))
    for (const tab of ['revenue', 'cashflow', 'pnl', 'debts'] as const) {
      await expect(loadReport(tab, '2026-12-01', '2026-12-03')).resolves.toEqual({
        ok: false, error: 'Chỉ chủ quán hoặc quản lý mới xem được báo cáo tài chính',
      })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
    // Tab bán hàng vẫn đọc được (thu ngân).
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
    expect((await loadReport('item', '2026-12-01', '2026-12-03')).ok).toBe(true)
  })

  it('loadReport gọi đúng RPC theo tab với store của operator và p_from, p_to', async () => {
    mocks.rpc.mockResolvedValue({
      data: { from: '2026-11-01', to: '2026-11-20', period_from: 'a', period_to: 'b', summary: { revenue: 5 },
        rows: [{ hour: 18, orders_count: 1, items_qty: 2, amount: 5 }] },
      error: null,
    })
    for (const tab of ['item', 'category', 'hour', 'voids'] as const) {
      const res = await loadReport(tab, '2026-11-01', '2026-11-20')
      expect(res.ok).toBe(true)
      expect(res.ok && res.report.tab).toBe(tab)
      expect(mocks.rpc).toHaveBeenLastCalledWith(REPORT_RPC[tab], { p_store_id: 'store-1', p_from: '2026-11-01', p_to: '2026-11-20' })
    }
    const res = await loadReport('hour', '2026-11-01', '2026-11-20')
    expect(res.ok && res.report).toMatchObject({
      tab: 'hour', head: { from: '2026-11-01', to: '2026-11-20', periodFrom: 'a', periodTo: 'b' },
      rows: [{ hour: 18, ordersCount: 1, itemsQty: 2, amount: 5 }],
    })
  })

  it('RPC lỗi: trả {ok:false, error} nguyên message, không ném', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Kỳ báo cáo tối đa 366 ngày' } })
    await expect(loadReport('item', '2025-01-01', '2026-11-20')).resolves.toEqual({ ok: false, error: 'Kỳ báo cáo tối đa 366 ngày' })
    mocks.rpc.mockRejectedValueOnce(new Error('fetch failed'))
    await expect(loadReport('item', '2026-11-20', '2026-11-20')).resolves.toEqual({ ok: false, error: 'fetch failed' })
  })

  it('không phải vai POS: để lỗi quyền đi lên, không gọi RPC', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    await expect(loadReport('item', '2026-11-20', '2026-11-20')).rejects.toThrow('Chỉ chủ quán hoặc thu ngân')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('resolveReportRange', () => {
  it('resolveReportRange: quán 05:00, 01:00 sáng 21/11 thì today là 2026-11-20', async () => {
    await expect(resolveReportRange({}, ONE_AM)).resolves.toEqual({
      preset: 'today', from: '2026-11-20', to: '2026-11-20', today: '2026-11-20',
    })
    expect(mocks.eq).toHaveBeenCalledWith('store_id', 'store-1')
  })

  it('gõ tay ngày lịch hôm nay (21/11) bị kẹp về ngày kinh doanh 20/11', async () => {
    await expect(resolveReportRange({ from: '2026-11-15', to: '2026-11-21' }, ONE_AM)).resolves.toEqual({
      preset: 'custom', from: '2026-11-15', to: '2026-11-20', today: '2026-11-20',
    })
    await expect(resolveReportRange({ period: 'yesterday' }, ONE_AM)).resolves.toMatchObject({ from: '2026-11-19', to: '2026-11-19' })
  })

  it('đọc giờ bắt đầu lỗi: coi như 00:00 (ngày lịch)', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'hỏng' } })
    await expect(resolveReportRange({}, ONE_AM)).resolves.toMatchObject({ today: '2026-11-21' })
  })
})
