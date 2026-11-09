import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'

const mocks = vi.hoisted(() => ({
  requireOperator: vi.fn(),
  resolveReportRange: vi.fn(),
  loadReport: vi.fn(),
  storeEq: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/actions/reports', () => ({ resolveReportRange: mocks.resolveReportRange, loadReport: mocks.loadReport }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: (col: string, v: string) => { mocks.storeEq(col, v); return { maybeSingle: async () => ({ data: { name: 'Bia lẩu Bảo Lương' } }) } } }) }),
    auth: { getUser: mocks.getUser },
  })),
}))

const { GET } = await import('./route')
const req = (qs: string) => ({ nextUrl: new URL(`http://localhost/admin/reports/export${qs}`) }) as never

const EMPTY_ITEM = {
  tab: 'item', head: { from: '2026-11-01', to: '2026-11-20', periodFrom: '', periodTo: '' },
  summary: { itemsAmount: 0, discountTotal: 0, revenue: 0, qtySold: 0, qtyGift: 0, openTablesCount: 0 }, rows: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireOperator.mockResolvedValue({ userId: 'u1', role: 'store_owner', storeId: 'store-1' })
  mocks.resolveReportRange.mockResolvedValue({ preset: 'custom', from: '2026-11-01', to: '2026-11-20', today: '2026-11-20' })
  mocks.loadReport.mockImplementation(async (tab: string) => ({ ok: true, report: { ...EMPTY_ITEM, tab, ...(tab === 'voids' ? { totals: { cancelledAmount: 0, giftAmount: 0, reducedAmount: 0, count: 0 } } : {}) } }))
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'chu@quan.vn', user_metadata: { full_name: 'Anh Tú' } } } })
})

describe('GET /admin/reports/export', () => {
  it('chủ quán: trả .xlsx đúng tab, kỳ, tên file; tên quán đọc theo store của operator', async () => {
    const res = await GET(req('?tab=voids&from=2026-11-01&to=2026-11-20&store_id=khac'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="bao-cao-voids-bia-lau-bao-luong-2026-11-01_2026-11-20.xlsx"')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.resolveReportRange).toHaveBeenCalledWith({ period: undefined, from: '2026-11-01', to: '2026-11-20' }, expect.any(Date))
    expect(mocks.loadReport).toHaveBeenCalledWith('voids', '2026-11-01', '2026-11-20')
    expect(mocks.storeEq).toHaveBeenCalledWith('id', 'store-1')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await res.arrayBuffer())
    expect(wb.worksheets[0].name).toBe('Món huỷ')
    expect(wb.worksheets[0].getCell('B5').value).toBe('Anh Tú · Chủ quán')
  })

  it('thu ngân xuất được; tab lạ về Theo món', async () => {
    mocks.requireOperator.mockResolvedValue({ userId: 'u2', role: 'store_cashier', storeId: 'store-1' })
    const res = await GET(req('?tab=zzz&period=7d'))
    expect(res.status).toBe(200)
    expect(mocks.loadReport).toHaveBeenCalledWith('item', '2026-11-01', '2026-11-20')
    expect(mocks.resolveReportRange).toHaveBeenCalledWith({ period: '7d', from: undefined, to: undefined }, expect.any(Date))
  })

  it('chưa đăng nhập: 401; phục vụ / superadmin: 403, không đọc báo cáo', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('Tài khoản chưa được cấp quyền vận hành'))
    expect((await GET(req('?tab=item'))).status).toBe(401)
    for (const op of [{ userId: 'u3', role: 'store_staff', storeId: 'store-1' }, { userId: 'u4', role: 'mevo_superadmin', storeId: null }]) {
      mocks.requireOperator.mockResolvedValueOnce(op)
      expect((await GET(req('?tab=item'))).status, op.role).toBe(403)
    }
    expect(mocks.resolveReportRange).not.toHaveBeenCalled()
    expect(mocks.loadReport).not.toHaveBeenCalled()
  })

  it('không xác định được kỳ (resolveReportRange ném): 400 tiếng Việt, không gọi RPC', async () => {
    mocks.resolveReportRange.mockRejectedValueOnce(new Error('boom'))
    const res = await GET(req('?tab=item&from=2026-11-01'))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Không xác định được kỳ báo cáo')
    expect(mocks.loadReport).not.toHaveBeenCalled()
  })

  it('RPC lỗi: 500 kèm lý do', async () => {
    mocks.loadReport.mockResolvedValueOnce({ ok: false, error: 'Kỳ báo cáo tối đa 366 ngày' })
    const res = await GET(req('?tab=item'))
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('Kỳ báo cáo tối đa 366 ngày')
  })
})
