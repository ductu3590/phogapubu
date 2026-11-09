import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireOperator: vi.fn(),
  resolveReportDay: vi.fn(async () => ({ date: '2026-11-09', today: '2026-11-09', isToday: true })),
  loadCashBookList: vi.fn(),
  storeEq: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/actions/bills-report', () => ({ resolveReportDay: mocks.resolveReportDay }))
vi.mock('@/lib/actions/cash-book-reads', () => ({ loadCashBookList: mocks.loadCashBookList }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: (...a: unknown[]) => { mocks.storeEq(...a); return { maybeSingle: async () => ({ data: { name: 'Yên Garden' } }) } } }) }),
    auth: { getUser: async () => ({ data: { user: { email: 'lan@yen.vn', user_metadata: {} } } }) },
  })),
}))

const { GET } = await import('./route')
const req = (qs: string) => ({ nextUrl: new URL(`http://x/admin/cashbook/export?${qs}`) }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadCashBookList.mockResolvedValue({
    ok: true, entries: [], truncated: false,
    totals: { receiptCash: 0, receiptBank: 0, paymentCash: 0, paymentBank: 0, receiptTotal: 0, paymentTotal: 0, net: 0 },
  })
})

describe('GET /admin/cashbook/export', () => {
  it('chưa đăng nhập: 401; phục vụ / superadmin: 403 — không tải dữ liệu', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('x'))
    expect((await GET(req(''))).status).toBe(401)
    for (const op of [{ userId: 'u', role: 'store_staff', storeId: 's' }, { userId: 'u', role: 'mevo_superadmin', storeId: null }]) {
      mocks.requireOperator.mockResolvedValueOnce(op)
      expect((await GET(req(''))).status).toBe(403)
    }
    expect(mocks.loadCashBookList).not.toHaveBeenCalled()
  })

  it('thu ngân xuất được (RPC chỉ trả phiếu của họ); quán lấy theo operator, bỏ qua store_id trên URL; bộ lọc qua parseCashbookFilters', async () => {
    mocks.requireOperator.mockResolvedValueOnce({ userId: 'u', role: 'store_cashier', storeId: 'store-A' })
    const res = await GET(req('store_id=store-B&from=2026-11-01&to=2026-12-31&kind=payment&method=momo'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml')
    expect(res.headers.get('Content-Disposition')).toContain('so-thu-chi_yen-garden_2026-11-01_2026-11-09.xlsx')
    expect(mocks.loadCashBookList).toHaveBeenCalledWith('store-A', {
      from: '2026-11-01', to: '2026-11-09', kind: 'payment', method: null, categoryId: null,
    })
    expect(mocks.storeEq).toHaveBeenCalledWith('id', 'store-A')
  })

  it('RPC lỗi: 500 kèm lý do', async () => {
    mocks.requireOperator.mockResolvedValueOnce({ userId: 'u', role: 'store_owner', storeId: 'store-A' })
    mocks.loadCashBookList.mockResolvedValueOnce({ ok: false, error: 'Khoảng ngày không hợp lệ' })
    const res = await GET(req(''))
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('Khoảng ngày không hợp lệ')
  })
})
