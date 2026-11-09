import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOperator: vi.fn(),
  resolveReportDay: vi.fn(async () => ({ date: '2026-11-09', today: '2026-11-09', isToday: true })),
  loadDebtList: vi.fn(),
  storeEq: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/actions/bills-report', () => ({ resolveReportDay: mocks.resolveReportDay }))
vi.mock('@/lib/actions/debt-reads', () => ({ loadDebtList: mocks.loadDebtList }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: (...a: unknown[]) => { mocks.storeEq(...a); return { maybeSingle: async () => ({ data: { name: 'Yên Garden' } }) } } }) }),
    auth: { getUser: async () => ({ data: { user: { email: 'lan@yen.vn', user_metadata: {} } } }) },
  })),
}))

const { GET } = await import('./route')
const req = (qs: string) => ({ nextUrl: new URL(`http://x/admin/debts/export?${qs}`) }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadDebtList.mockResolvedValue({ ok: true, customers: [] })
})

describe('GET /admin/debts/export', () => {
  it('chưa đăng nhập: 401; phục vụ / superadmin: 403 — không tải dữ liệu', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('x'))
    expect((await GET(req(''))).status).toBe(401)
    for (const op of [{ userId: 'u', role: 'store_staff', storeId: 's' }, { userId: 'u', role: 'mevo_superadmin', storeId: null }]) {
      mocks.requireOperator.mockResolvedValueOnce(op)
      expect((await GET(req(''))).status).toBe(403)
    }
    expect(mocks.loadDebtList).not.toHaveBeenCalled()
  })

  it('thu ngân xuất được; quán theo operator (bỏ qua store_id trên URL); open=1 → chỉ khách còn nợ; no-store', async () => {
    mocks.requireOperator.mockResolvedValueOnce({ userId: 'u', role: 'store_cashier', storeId: 'store-A' })
    const res = await GET(req('store_id=store-B&open=1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(res.headers.get('Content-Disposition')).toContain('cong-no-yen-garden-2026-11-09.xlsx')
    expect(mocks.loadDebtList).toHaveBeenCalledWith('store-A', true)
    expect(mocks.storeEq).toHaveBeenCalledWith('id', 'store-A')
    mocks.requireOperator.mockResolvedValueOnce({ userId: 'u', role: 'store_manager', storeId: 'store-A' })
    await GET(req(''))
    expect(mocks.loadDebtList).toHaveBeenLastCalledWith('store-A', false)
  })

  it('RPC lỗi: 500 kèm lý do', async () => {
    mocks.requireOperator.mockResolvedValueOnce({ userId: 'u', role: 'store_owner', storeId: 'store-A' })
    mocks.loadDebtList.mockResolvedValueOnce({ ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được xem / thu nợ' })
    const res = await GET(req(''))
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('Chỉ chủ quán, quản lý hoặc thu ngân')
  })
})
