import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  adminFrom: vi.fn(),
  userRpc: vi.fn(),
  userFrom: vi.fn(),
  createPrintUserClient: vi.fn(),
  loadOrderSlip: vi.fn(),
  loadDayReport: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ rpc: mocks.adminRpc, from: mocks.adminFrom }),
}))
vi.mock('@/lib/print/agent-user-client', () => ({ createPrintUserClient: mocks.createPrintUserClient }))
vi.mock('@/lib/print/load-order-slip', () => ({ loadOrderSlip: mocks.loadOrderSlip }))
vi.mock('@/lib/print/load-day-report', () => ({ loadDayReport: mocks.loadDayReport }))
// PrintReady là client component dùng effect: thay bằng thẻ đánh dấu để kiểm props
vi.mock('./print-ready', () => ({
  default: ({ jobId, error }: { jobId: string; error?: string }) => (
    <i data-ready={jobId} data-error={error ?? ''} />
  ),
}))

const Page = (await import('./page')).default

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const slip = (items: Array<{ key: string; name: string }>) => ({
  ok: true as const,
  slip: {
    storeName: 'Bia lẩu Bảo Lương', storePhone: null, tableLabel: 'Bàn 5', createdAt: '2026-11-05T10:00:00Z',
    orderNote: null, orderTotal: 120000, sessionTotal: 120000, orderSource: 'customer',
    items: items.map((i) => ({ ...i, menuItemId: null, quantity: 2, price: 60000, note: null, toppings: [], isGift: false })),
  },
})
const render = async (t: string | null = 'tok') =>
  renderToStaticMarkup(await Page({ params: Promise.resolve({ jobId: JOB_ID }), searchParams: Promise.resolve({ t: t ?? undefined }) }))
const job = (over: Record<string, unknown>) => ({
  id: JOB_ID, store_id: 'store-1', kind: 'kitchen_ticket', created_by: 'user-1', station_name: 'Bếp nướng',
  ref: { label: 'x', request: {}, source: 'order:o1', itemKeys: ['k1'] }, ...over,
})

describe('/print/agent/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createPrintUserClient.mockResolvedValue({ rpc: mocks.userRpc, from: mocks.userFrom })
    mocks.adminRpc.mockResolvedValue({ data: job({}), error: null })
  })

  it('token sai: hiện "Phiếu đã hết hạn", có PrintReady error, không đọc đơn', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: null })
    const html = await render('sai')
    expect(html).toContain('Phiếu đã hết hạn')
    expect(html).toContain('data-error="Phiếu đã hết hạn"')
    expect(mocks.createPrintUserClient).not.toHaveBeenCalled()
    expect(mocks.loadOrderSlip).not.toHaveBeenCalled()
  })

  it('thiếu token hoặc jobId không phải uuid: hết hạn, không gọi DB', async () => {
    expect(await render(null)).toContain('Phiếu đã hết hạn')
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ jobId: 'abc' }), searchParams: Promise.resolve({ t: 'x' }) }))
    expect(html).toContain('Phiếu đã hết hạn')
    expect(mocks.adminRpc).not.toHaveBeenCalled()
  })

  it('RPC kiểm token lỗi: coi như hết hạn', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await render()).toContain('Phiếu đã hết hạn')
  })

  it('gọi print_job_for_render đúng tham số', async () => {
    mocks.loadOrderSlip.mockResolvedValue(slip([{ key: 'k1', name: 'Bia hơi' }]))
    await render('tok123')
    expect(mocks.adminRpc).toHaveBeenCalledWith('print_job_for_render', { p_job_id: JOB_ID, p_render_token: 'tok123' })
    expect(mocks.createPrintUserClient).toHaveBeenCalledWith('user-1')
    expect(mocks.loadOrderSlip).toHaveBeenCalledWith(expect.anything(), 'store-1', { orderId: 'o1' })
  })

  it('kitchen_ticket chỉ vẽ món trong itemKeys, không có giá, có tên trạm', async () => {
    mocks.loadOrderSlip.mockResolvedValue(slip([{ key: 'k1', name: 'Bia hơi' }, { key: 'k2', name: 'Lẩu cá' }]))
    const html = await render()
    expect(html).toContain('Bia hơi')
    expect(html).not.toContain('Lẩu cá')
    expect(html).not.toContain('60.000')
    expect(html).not.toContain('Tổng phiếu')
    expect(html).toContain('Bếp nướng')
    expect(html).toContain('data-ready="' + JOB_ID + '"')
    expect(html).toContain('data-error=""')
  })

  it('kitchen_ticket mà mọi món đã bị bỏ: lỗi "Các món trên phiếu đã bị bỏ", không vẽ phiếu', async () => {
    mocks.loadOrderSlip.mockResolvedValue(slip([{ key: 'k9', name: 'Món khác' }]))
    const html = await render()
    expect(html).toContain('Các món trên phiếu đã bị bỏ')
    expect(html).toContain('data-error="Các món trên phiếu đã bị bỏ"')
    expect(html).not.toContain('PHIẾU BẾP')
  })

  it('kitchen_ticket nguồn đặt trước đọc theo preorderJobId', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ ref: { source: 'preorder:pj1', itemKeys: ['0'] } }), error: null })
    mocks.loadOrderSlip.mockResolvedValue(slip([{ key: '0', name: 'Gà' }]))
    await render()
    expect(mocks.loadOrderSlip).toHaveBeenCalledWith(expect.anything(), 'store-1', { preorderJobId: 'pj1' })
  })

  it('đơn không đọc được: hiện lỗi từ loadOrderSlip', async () => {
    mocks.loadOrderSlip.mockResolvedValue({ ok: false, error: 'Không tìm thấy đơn của quán này.' })
    const html = await render()
    expect(html).toContain('Không tìm thấy đơn của quán này.')
    expect(html).toContain('data-error="Không tìm thấy đơn của quán này."')
  })

  it('table_slip vẽ phiếu bàn có giá', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'table_slip', ref: { source: 'order:o1' } }), error: null })
    mocks.loadOrderSlip.mockResolvedValue(slip([{ key: 'k1', name: 'Bia hơi' }, { key: 'k2', name: 'Lẩu cá' }]))
    const html = await render()
    expect(html).toContain('☐ Bia hơi')
    expect(html).toContain('☐ Lẩu cá')
    expect(html).toContain('120.000')
    expect(html).not.toContain('PHIẾU BẾP')
  })

  it('bill không có khối no-print', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'bill', ref: { request: { kind: 'bill', sessionIds: ['s1'] } } }), error: null })
    mocks.userRpc.mockResolvedValue({
      data: {
        store: { name: 'Quán', address: null, phone: null }, printed_at: '2026-11-05T10:00:00Z', grand_total: 100000,
        sessions: [{ session_id: 's1', opened_at: '2026-11-05T09:00:00Z', is_open_ordering: false, tables: 'Bàn 5', subtotal: 100000,
          items: [{ name: 'Bia hơi', quantity: 1, price: 100000, line_total: 100000 }] }],
      },
      error: null,
    })
    const html = await render()
    expect(mocks.userRpc).toHaveBeenCalledWith('get_sessions_bill', { p_session_ids: ['s1'] })
    expect(html).toContain('HOÁ ĐƠN')
    expect(html).not.toContain('no-print')
  })

  it('RPC đọc bill lỗi: hiện lỗi, không vẽ phiếu', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'bill', ref: { request: { kind: 'bill', sessionIds: ['s1'] } } }), error: null })
    mocks.userRpc.mockResolvedValue({ data: null, error: { message: 'Không có quyền' } })
    const html = await render()
    expect(html).toContain('Không có quyền')
    expect(html).toContain('data-error=')
    expect(html).not.toContain('HOÁ ĐƠN')
  })

  it('day_report: dùng loadDayReport, autoPrint tắt', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'day_report', ref: { request: { kind: 'day_report', date: '2026-11-05' } } }), error: null })
    mocks.adminFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Lan', role: 'store_cashier' } }) }) }) }),
    })
    mocks.loadDayReport.mockResolvedValue({
      ok: true,
      props: {
        storeName: 'Quán', date: '2026-11-05', printedAt: '2026-11-05T15:00:00Z', printedBy: 'Lan · Thu ngân',
        totals: { revenue: 1, cash: 1, bank: 0, other: 0, billsCount: 1 },
        summary: { waitingCount: 0, waitingTotal: 0, cancelledCount: 0, cancelledTotal: 0, giftCount: 0, giftTotal: 0, voidCount: 0, voidTotal: 0, quantityChangeCount: 0, discountTotal: 0, billDiscountTotal: 0 },
      },
    })
    const html = await render()
    expect(html).toContain('BÁO CÁO CUỐI NGÀY')
    expect(html).not.toContain('no-print')
    expect(mocks.loadDayReport.mock.calls[0][1]).toBe('store-1')
    expect(mocks.loadDayReport.mock.calls[0][2]).toBe('2026-11-05')
    expect(mocks.loadDayReport.mock.calls[0][3]).toBe('Lan · Thu ngân')
  })

  it('test: PHIẾU IN THỬ, không có no-print', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'test', ref: {} }), error: null })
    mocks.userFrom.mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Quán A', address: null, phone: null } }) }) }),
    })
    const html = await render()
    expect(html).toContain('PHIẾU IN THỬ')
    expect(html).not.toContain('no-print')
  })

  it('shift_report: Chưa hỗ trợ', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'shift_report', ref: {} }), error: null })
    expect(await render()).toContain('Chưa hỗ trợ')
  })

  it('lỗi bất ngờ (vd thiếu secret) trả lỗi, không ném', async () => {
    mocks.createPrintUserClient.mockRejectedValue(new Error('Thiếu SUPABASE_JWT_SECRET'))
    const html = await render()
    expect(html).toContain('Thiếu SUPABASE_JWT_SECRET')
  })
})
