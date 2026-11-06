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
  default: ({ jobId, error, retryable }: { jobId: string; error?: string; retryable?: boolean }) => (
    <i data-ready={jobId} data-error={error ?? ''} data-retryable={retryable ? '1' : ''} />
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

  it('token sai (RPC trả NULL): hết hạn, KHÔNG retryable', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: null })
    const html = await render()
    expect(html).toContain('data-error="Phiếu đã hết hạn"')
    expect(html).toContain('data-retryable=""')
  })

  it('RPC kiểm token lỗi (mạng/DB): "Không đọc được dữ liệu phiếu" và retryable, khác nhánh NULL', async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const html = await render()
    expect(html).toContain('Không đọc được dữ liệu phiếu')
    expect(html).not.toContain('Phiếu đã hết hạn')
    expect(html).toContain('data-retryable="1"')
    expect(mocks.createPrintUserClient).not.toHaveBeenCalled()
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

  it('đơn đã huỷ (kitchen_ticket và table_slip): báo lỗi vĩnh viễn, không retryable, không vẽ phiếu', async () => {
    mocks.loadOrderSlip.mockResolvedValue({ ok: false, error: 'Đơn đã huỷ' })
    for (const kind of ['kitchen_ticket', 'table_slip']) {
      mocks.adminRpc.mockResolvedValue({ data: job({ kind, ref: { source: 'order:o1', itemKeys: ['k1'] } }), error: null })
      const html = await render()
      expect(html).toContain('data-error="Đơn đã huỷ"')
      expect(html).toContain('data-retryable=""')
      expect(html).not.toContain('PHIẾU BẾP')
      expect(html).not.toContain('☐')
    }
  })

  it('loadOrderSlip lỗi đọc tạm thời: câu riêng + retryable (không lộ lỗi kỹ thuật)', async () => {
    mocks.loadOrderSlip.mockResolvedValue({ ok: false, error: 'fetch failed', transient: true })
    const html = await render()
    expect(html).toContain('data-error="Không đọc được dữ liệu phiếu"')
    expect(html).toContain('data-retryable="1"')
    expect(html).not.toContain('fetch failed')
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

  it('phiếu in lại (request.reprint hoặc retried) có chữ IN LẠI, cả phiếu bếp lẫn phiếu bàn; phiếu đầu thì không', async () => {
    mocks.loadOrderSlip.mockResolvedValue(slip([{ key: 'k1', name: 'Bia hơi' }]))
    const cases: Array<[string, Record<string, unknown>, boolean]> = [
      ['kitchen_ticket', { source: 'order:o1', itemKeys: ['k1'], request: { reprint: true } }, true],
      ['kitchen_ticket', { source: 'order:o1', itemKeys: ['k1'], retried: true }, true],
      ['kitchen_ticket', { source: 'order:o1', itemKeys: ['k1'], request: {} }, false],
      ['table_slip', { source: 'order:o1', request: { reprint: true } }, true],
      ['table_slip', { source: 'order:o1', retried: true }, true],
      ['table_slip', { source: 'order:o1' }, false],
    ]
    for (const [kind, ref, expected] of cases) {
      mocks.adminRpc.mockResolvedValue({ data: job({ kind, ref }), error: null })
      const html = await render()
      expect(html.includes('IN LẠI'), `${kind} ${JSON.stringify(ref)}`).toBe(expected)
    }
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

  it('RPC đọc bill lỗi: "Không đọc được dữ liệu phiếu", retryable, không vẽ phiếu', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'bill', ref: { request: { kind: 'bill', sessionIds: ['s1'] } } }), error: null })
    mocks.userRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    const html = await render()
    expect(html).toContain('data-error="Không đọc được dữ liệu phiếu"')
    expect(html).toContain('data-retryable="1"')
    expect(html).not.toContain('HOÁ ĐƠN')
  })

  it('day_report: dùng loadDayReport, autoPrint tắt', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'day_report', ref: { request: { kind: 'day_report', date: '2026-11-05' } } }), error: null })
    mocks.adminFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Lan', role: 'store_cashier' }, error: null }) }) }) }),
    })
    mocks.loadDayReport.mockResolvedValue({
      ok: true,
      props: {
        storeName: 'Quán', date: '2026-11-05', rangeLabel: '05:00 05/11 – 05:00 06/11', printedAt: '2026-11-05T15:00:00Z', printedBy: 'Lan · Thu ngân',
        totals: { revenue: 1, cash: 1, bank: 0, other: 0, billsCount: 1 },
        summary: { waitingCount: 0, waitingTotal: 0, cancelledCount: 0, cancelledTotal: 0, giftCount: 0, giftTotal: 0, voidCount: 0, voidTotal: 0, quantityChangeCount: 0, discountTotal: 0, billDiscountTotal: 0 },
      },
    })
    const html = await render()
    expect(html).toContain('BÁO CÁO CUỐI NGÀY')
    expect(html).toContain('05:00 05/11 – 05:00 06/11')
    expect(html).not.toContain('no-print')
    expect(mocks.loadDayReport.mock.calls[0][1]).toBe('store-1')
    expect(mocks.loadDayReport.mock.calls[0][2]).toBe('2026-11-05')
    expect(mocks.loadDayReport.mock.calls[0][3]).toBe('Lan · Thu ngân')
  })

  it('day_report: loadDayReport lỗi tạm thời thì retryable; lỗi vĩnh viễn (ngày sai) thì không', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'day_report', ref: { request: { kind: 'day_report', date: '2026-11-05' } } }), error: null })
    mocks.adminFrom.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Lan', role: 'store_cashier' }, error: null }) }) }) }),
    })
    mocks.loadDayReport.mockResolvedValue({ ok: false, error: 'rpc lỗi', transient: true })
    let html = await render()
    expect(html).toContain('data-error="Không đọc được dữ liệu phiếu"')
    expect(html).toContain('data-retryable="1"')
    mocks.loadDayReport.mockResolvedValue({ ok: false, error: 'Ngày báo cáo không hợp lệ' })
    html = await render()
    expect(html).toContain('data-error="Ngày báo cáo không hợp lệ"')
    expect(html).toContain('data-retryable=""')
  })

  it('test: quán không đọc được (lỗi DB) thì retryable', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'test', ref: {} }), error: null })
    mocks.userFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }),
    })
    const html = await render()
    expect(html).toContain('data-error="Không đọc được dữ liệu phiếu"')
    expect(html).toContain('data-retryable="1"')
    expect(html).not.toContain('PHIẾU IN THỬ')
  })

  it('test: quán không tồn tại (store null, không lỗi): báo lỗi KHÔNG retryable, không in tên rỗng', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'test', ref: {} }), error: null })
    mocks.userFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    const html = await render()
    expect(html).toContain('data-error="Không tìm thấy quán"')
    expect(html).toContain('data-retryable=""')
    expect(html).not.toContain('PHIẾU IN THỬ')
  })

  it('test: PHIẾU IN THỬ, không có no-print', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'test', ref: {} }), error: null })
    mocks.userFrom.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Quán A', address: null, phone: null }, error: null }) }) }),
    })
    const html = await render()
    expect(html).toContain('PHIẾU IN THỬ')
    expect(html).not.toContain('no-print')
  })

  it('shift_report: Chưa hỗ trợ', async () => {
    mocks.adminRpc.mockResolvedValue({ data: job({ kind: 'shift_report', ref: {} }), error: null })
    expect(await render()).toContain('Chưa hỗ trợ')
  })

  it('lỗi bất ngờ (vd thiếu secret) trả lỗi, không ném; coi là retryable', async () => {
    mocks.createPrintUserClient.mockRejectedValue(new Error('Thiếu SUPABASE_JWT_SECRET'))
    const html = await render()
    expect(html).toContain('Thiếu SUPABASE_JWT_SECRET')
    expect(html).toContain('data-retryable="1"')
  })
})
