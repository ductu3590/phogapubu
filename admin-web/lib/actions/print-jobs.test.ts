import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Giả lập Supabase theo bảng: mỗi bảng trả dữ liệu cấu hình sẵn, ghi lại các lệnh lọc (.eq/.in) để kiểm store_id.
const mocks = vi.hoisted(() => {
  const state = {
    operator: { userId: 'u1', role: 'store_cashier', storeId: 'store-1' } as Record<string, unknown>,
    mode: 'agent' as string,
    stations: [
      { id: 'st-pos', name: 'Quầy', is_pos: true, is_default_kitchen: false },
      { id: 'st-bep', name: 'Bếp', is_pos: false, is_default_kitchen: true },
      { id: 'st-nuong', name: 'Nướng', is_pos: false, is_default_kitchen: false },
    ] as Array<Record<string, unknown>>,
    menuItems: [] as Array<{ id: string; category_id: string | null }>,
    categories: [] as Array<{ id: string; print_station_id: string | null }>,
    sessions: [] as Array<{ id: string }>,
    upsertError: null as null | { message: string },
    rpcResult: { data: null, error: null } as { data: unknown; error: null | { message: string } },
    upsertReturn: undefined as undefined | Array<{ id: string }>,
    businessDayStart: '00:00:00',
  }
  const calls = {
    upsert: [] as Array<{ rows: Array<Record<string, unknown>>; opts: unknown }>,
    filters: [] as Array<{ table: string; col: string; val: unknown }>,
    sessionTables: [] as string[],
    adminTables: [] as string[],
  }
  const loadOrderSlip = vi.fn()

  function builder(table: string, rows: () => unknown[]) {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((col: string, val: unknown) => { calls.filters.push({ table, col, val }); return b })
    b.in = vi.fn((col: string, val: unknown) => { calls.filters.push({ table, col, val }); return b })
    b.upsert = vi.fn((r: Array<Record<string, unknown>>, opts: unknown) => {
      calls.upsert.push({ rows: r, opts })
      return b
    })
    b.maybeSingle = vi.fn(async () => ({
      data: table === 'store_workflow_settings' ? { business_day_start: state.businessDayStart } : null,
      error: null,
    }))
    b.then = (resolve: (v: unknown) => void) => {
      if (table === 'print_jobs') {
        resolve({
          data: state.upsertError ? null : state.upsertReturn ?? calls.upsert[calls.upsert.length - 1]?.rows.map((_, i) => ({ id: `j${i}` })),
          error: state.upsertError,
        })
      } else resolve({ data: rows(), error: null })
    }
    return b
  }
  const admin = {
    from: vi.fn((table: string) => {
      calls.adminTables.push(table)
      return builder(table, () => {
        if (table === 'print_stations') return state.stations
        if (table === 'menu_items') return state.menuItems
        if (table === 'menu_categories') return state.categories
        if (table === 'table_sessions') return state.sessions
        return []
      })
    }),
  }
  const session = {
    rpc: vi.fn(async (fn: string) => (fn === 'get_print_mode' ? { data: state.mode, error: null } : state.rpcResult)),
    from: vi.fn((table: string) => {
      calls.sessionTables.push(table)
      return builder(table, () => (table === 'table_sessions' ? state.sessions : []))
    }),
  }
  const requireOperator = vi.fn(async () => state.operator)
  return { state, calls, admin, session, requireOperator, loadOrderSlip }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.session),
  createAdminClient: vi.fn(() => mocks.admin),
}))
vi.mock('@/lib/print/load-order-slip', () => ({ loadOrderSlip: mocks.loadOrderSlip }))

const { enqueuePrint, retryPrintJob, markPrintedInBrowser } = await import('./print-jobs')

const slipWith = (items: Array<{ key: string; menuItemId: string | null }>) => ({
  ok: true as const,
  slip: {
    storeName: 'Quán', storePhone: null, tableLabel: 'Bàn 5', createdAt: '2026-11-05T10:00:00Z', orderNote: null,
    orderTotal: 1, sessionTotal: 1, orderSource: 'customer',
    items: items.map((i) => ({ ...i, name: 'Món', quantity: 1, price: 1, note: null, toppings: [], isGift: false })),
  },
})

describe('enqueuePrint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.upsert.length = 0
    mocks.calls.filters.length = 0
    mocks.calls.sessionTables.length = 0
    mocks.calls.adminTables.length = 0
    Object.assign(mocks.state, {
      operator: { userId: 'u1', role: 'store_cashier', storeId: 'store-1' },
      mode: 'agent',
      menuItems: [{ id: 'm1', category_id: 'c1' }, { id: 'm2', category_id: 'c2' }],
      categories: [{ id: 'c1', print_station_id: 'st-nuong' }, { id: 'c2', print_station_id: null }],
      sessions: [{ id: 's1' }],
      upsertError: null,
      upsertReturn: undefined,
      businessDayStart: '00:00:00',
      stations: [
        { id: 'st-pos', name: 'Quầy', is_pos: true, is_default_kitchen: false },
        { id: 'st-bep', name: 'Bếp', is_pos: false, is_default_kitchen: true },
        { id: 'st-nuong', name: 'Nướng', is_pos: false, is_default_kitchen: false },
      ],
    })
    mocks.loadOrderSlip.mockResolvedValue(slipWith([{ key: 'k1', menuItemId: 'm1' }, { key: 'k2', menuItemId: 'm2' }]))
  })

  it('nhân viên phục vụ in được bill, không in được order và day_report', async () => {
    mocks.state.operator = { userId: 'u2', role: 'store_staff', storeId: 'store-1' }
    expect((await enqueuePrint({ kind: 'bill', sessionIds: ['s1'] })).ok).toBe(true)
    const o = await enqueuePrint({ kind: 'order', orderId: 'o1' })
    expect(o.ok).toBe(false)
    const d = await enqueuePrint({ kind: 'day_report', date: '2026-11-05' })
    expect(d.ok).toBe(false)
    expect(mocks.loadOrderSlip).not.toHaveBeenCalled()
  })

  it('thu ngân in được order', async () => {
    const r = await enqueuePrint({ kind: 'order', orderId: 'o1' })
    expect(r).toEqual({ ok: true, queued: 3 })
    expect(mocks.loadOrderSlip).toHaveBeenCalledWith(mocks.session, 'store-1', { orderId: 'o1' })
  })

  it('không có quyền vận hành: trả lỗi, không ném', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('Tài khoản chưa được cấp quyền vận hành'))
    const r = await enqueuePrint({ kind: 'order', orderId: 'o1' })
    expect(r).toEqual({ ok: false, error: 'Tài khoản chưa được cấp quyền vận hành' })
  })

  it('quán đang browser: {ok:false, error:"Quán chưa bật phần mềm in"}', async () => {
    mocks.state.mode = 'browser'
    expect(await enqueuePrint({ kind: 'order', orderId: 'o1' })).toEqual({ ok: false, error: 'Quán chưa bật phần mềm in' })
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('shift_report chưa được hỗ trợ ở Part 1', async () => {
    const r = await enqueuePrint({ kind: 'shift_report', shiftId: 'x' })
    expect(r.ok).toBe(false)
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('đơn của quán khác: loadOrderSlip không thấy → {ok:false}, không insert', async () => {
    mocks.loadOrderSlip.mockResolvedValue({ ok: false, error: 'Không tìm thấy đơn của quán này.' })
    const r = await enqueuePrint({ kind: 'order', orderId: 'o-khac' })
    expect(r).toEqual({ ok: false, error: 'Không tìm thấy đơn của quán này.' })
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('phiên bill của quán khác: {ok:false}, không insert; đếm theo store_id', async () => {
    mocks.state.sessions = [] // phiên không thuộc quán
    const r = await enqueuePrint({ kind: 'bill', sessionIds: ['s-khac'] })
    expect(r.ok).toBe(false)
    expect(mocks.calls.upsert).toHaveLength(0)
    expect(mocks.calls.filters).toContainEqual({ table: 'table_sessions', col: 'store_id', val: 'store-1' })
  })

  it('bill: một phiên thiếu trong danh sách cũng bị từ chối', async () => {
    mocks.state.sessions = [{ id: 's1' }]
    const r = await enqueuePrint({ kind: 'bill', sessionIds: ['s1', 's-khac'] })
    expect(r.ok).toBe(false)
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('chưa có trạm: {ok:false, error chứa "Chưa cài trạm in"}', async () => {
    mocks.state.stations = []
    const r = await enqueuePrint({ kind: 'order', orderId: 'o1' })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toContain('Chưa cài trạm in')
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('đơn không còn món: {ok:false, error:"Đơn không còn món để in"}', async () => {
    mocks.loadOrderSlip.mockResolvedValue(slipWith([]))
    expect(await enqueuePrint({ kind: 'order', orderId: 'o1' })).toEqual({ ok: false, error: 'Đơn không còn món để in' })
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('món đã xoá khỏi menu (menu_item_id null) ra trạm mặc định', async () => {
    mocks.loadOrderSlip.mockResolvedValue(slipWith([{ key: 'k1', menuItemId: null }]))
    await enqueuePrint({ kind: 'order', orderId: 'o1' })
    const rows = mocks.calls.upsert[0].rows
    expect(rows.find((r) => r.kind === 'kitchen_ticket')?.station_id).toBe('st-bep')
  })

  it('trạm đã xoá (danh mục trỏ trạm không còn trong danh sách) rơi về trạm bếp mặc định ngay lúc tạo job', async () => {
    mocks.state.categories = [{ id: 'c1', print_station_id: 'st-da-xoa' }, { id: 'c2', print_station_id: null }]
    await enqueuePrint({ kind: 'order', orderId: 'o1' })
    const kitchen = mocks.calls.upsert[0].rows.filter((r) => r.kind === 'kitchen_ticket')
    expect(kitchen).toHaveLength(1)
    expect(kitchen[0].station_id).toBe('st-bep')
  })

  it('món theo danh mục: phiếu bếp tách đúng trạm, lọc menu theo store_id', async () => {
    await enqueuePrint({ kind: 'order', orderId: 'o1' })
    const rows = mocks.calls.upsert[0].rows
    expect(rows.map((r) => [r.kind, r.station_id])).toEqual([
      ['kitchen_ticket', 'st-nuong'],
      ['kitchen_ticket', 'st-bep'],
      ['table_slip', 'st-pos'],
    ])
    for (const t of ['menu_items', 'menu_categories', 'print_stations']) {
      expect(mocks.calls.filters).toContainEqual({ table: t, col: 'store_id', val: 'store-1' })
    }
  })

  it('insert một lần với ignoreDuplicates, created_by là người đang đăng nhập, ref có label + request', async () => {
    await enqueuePrint({ kind: 'order', orderId: 'o1' })
    expect(mocks.calls.upsert).toHaveLength(1)
    expect(mocks.calls.upsert[0].opts).toEqual({ onConflict: 'store_id,dedupe_key', ignoreDuplicates: true })
    for (const r of mocks.calls.upsert[0].rows) {
      expect(r.created_by).toBe('u1')
      expect(r.store_id).toBe('store-1')
      expect(r.ref).toMatchObject({ request: { kind: 'order', orderId: 'o1' } })
      expect(typeof (r.ref as { label: string }).label).toBe('string')
    }
    expect(mocks.calls.upsert[0].rows.map((r) => r.dedupe_key)).toEqual([
      'order:o1:kitchen:st-nuong', 'order:o1:kitchen:st-bep', 'order:o1:table',
    ])
  })

  it('ref.request của order/preorder_job lưu bản sạch {kind, id, reprint}, không lưu req thô', async () => {
    const raw = { kind: 'order', orderId: 'o1', reprint: true, extra: 'x' } as unknown as Parameters<typeof enqueuePrint>[0]
    await enqueuePrint(raw)
    const req1 = (mocks.calls.upsert[0].rows[0].ref as { request: object }).request
    expect(req1).toEqual({ kind: 'order', orderId: 'o1', reprint: true })
    await enqueuePrint({ kind: 'preorder_job', jobId: 'pj1' })
    const req2 = (mocks.calls.upsert[1].rows[0].ref as { request: object }).request
    expect(req2).toEqual({ kind: 'preorder_job', jobId: 'pj1' })
  })

  it('orderId/jobId không phải chuỗi hoặc rỗng: từ chối, không đọc đơn', async () => {
    for (const bad of [{ kind: 'order', orderId: 123 }, { kind: 'order', orderId: '' }, { kind: 'preorder_job', jobId: null }]) {
      const r = await enqueuePrint(bad as unknown as Parameters<typeof enqueuePrint>[0])
      expect(r.ok).toBe(false)
    }
    expect(mocks.loadOrderSlip).not.toHaveBeenCalled()
    expect(mocks.calls.upsert).toHaveLength(0)
  })

  it('reprint: khoá có hậu tố riêng mỗi lần', async () => {
    await enqueuePrint({ kind: 'order', orderId: 'o1', reprint: true })
    await enqueuePrint({ kind: 'order', orderId: 'o1', reprint: true })
    const k1 = mocks.calls.upsert[0].rows.map((r) => r.dedupe_key)
    const k2 = mocks.calls.upsert[1].rows.map((r) => r.dedupe_key)
    expect(k1[0]).toMatch(/:r[0-9a-f-]{36}$/)
    expect(k1).not.toEqual(k2)
  })

  it('preorder_job: nguồn preorder, đọc qua loadOrderSlip bằng phiên đăng nhập', async () => {
    await enqueuePrint({ kind: 'preorder_job', jobId: 'pj1' })
    expect(mocks.loadOrderSlip).toHaveBeenCalledWith(mocks.session, 'store-1', { preorderJobId: 'pj1' })
    expect(mocks.calls.upsert[0].rows[2].dedupe_key).toBe('preorder:pj1:table')
  })

  it('bill: một phiếu ở Quầy, trạm lấy theo store_id', async () => {
    const r = await enqueuePrint({ kind: 'bill', sessionIds: ['s1'] })
    expect(r).toEqual({ ok: true, queued: 1 })
    const row = mocks.calls.upsert[0].rows[0]
    expect(row).toMatchObject({ kind: 'bill', station_id: 'st-pos', store_id: 'store-1', created_by: 'u1' })
    expect(row.dedupe_key).toMatch(/^bill:/)
  })

  it('day_report: ngày sai định dạng, không tồn tại (2026-02-31) hoặc ở tương lai bị từ chối', async () => {
    expect((await enqueuePrint({ kind: 'day_report', date: '05/11/2026' })).ok).toBe(false)
    expect((await enqueuePrint({ kind: 'day_report', date: '2026-02-31' })).ok).toBe(false)
    expect((await enqueuePrint({ kind: 'day_report', date: '2999-01-01' })).ok).toBe(false)
    expect(mocks.calls.upsert).toHaveLength(0)
    expect((await enqueuePrint({ kind: 'day_report', date: '2026-11-05' })).ok).toBe(true)
  })

  describe('day_report theo ngày kinh doanh của quán', () => {
    // 18:00Z ngày 05/11 = 01:00 sáng 06/11 giờ VN
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T18:00:00Z') }) })
    afterEach(() => { vi.useRealTimers() })

    it('quán 05:00 lúc 01:00 sáng: ngày lịch mới bị từ chối, ngày kinh doanh hiện tại được nhận', async () => {
      mocks.state.businessDayStart = '05:00:00'
      expect(await enqueuePrint({ kind: 'day_report', date: '2026-11-06' })).toEqual({ ok: false, error: 'Ngày báo cáo không hợp lệ' })
      expect(mocks.calls.upsert).toHaveLength(0)
      expect((await enqueuePrint({ kind: 'day_report', date: '2026-11-05' })).ok).toBe(true)
      expect(mocks.calls.upsert).toHaveLength(1)
    })

    it('quán 00:00 cùng thời điểm: ngày lịch mới chính là ngày kinh doanh, được nhận', async () => {
      expect((await enqueuePrint({ kind: 'day_report', date: '2026-11-06' })).ok).toBe(true)
    })

    it('giờ bắt đầu đọc đúng quán của người đang đăng nhập', async () => {
      mocks.state.operator = { userId: 'u1', role: 'store_cashier', storeId: 'store-2' }
      await enqueuePrint({ kind: 'day_report', date: '2026-11-05' })
      expect(mocks.calls.filters).toContainEqual({ table: 'store_workflow_settings', col: 'store_id', val: 'store-2' })
    })
  })

  it('ref.request của bill lưu bản đã làm sạch (kind + sessionIds không trùng), không lưu req thô', async () => {
    const raw = { kind: 'bill', sessionIds: ['s1', 's1', ''], reprint: true, extra: 'x' } as unknown as Parameters<typeof enqueuePrint>[0]
    expect((await enqueuePrint(raw)).ok).toBe(true)
    expect(mocks.calls.upsert[0].rows[0].ref).toMatchObject({ request: { kind: 'bill', sessionIds: ['s1'] } })
    expect((mocks.calls.upsert[0].rows[0].ref as { request: object }).request).toEqual({ kind: 'bill', sessionIds: ['s1'] })
  })

  it('lỗi DB trả {ok:false}, không ném', async () => {
    mocks.state.upsertError = { message: 'boom' }
    const r = await enqueuePrint({ kind: 'order', orderId: 'o1' })
    expect(r.ok).toBe(false)
  })

  it('trùng khoá (đã xếp hàng rồi): ok với queued 0', async () => {
    mocks.state.upsertReturn = []
    expect(await enqueuePrint({ kind: 'order', orderId: 'o1' })).toEqual({ ok: true, queued: 0 })
  })
})

describe('retryPrintJob / markPrintedInBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.rpcResult = { data: { ok: true }, error: null }
  })
  it('retryPrintJob gọi retry_print_job, ok', async () => {
    expect(await retryPrintJob('j1')).toEqual({ ok: true })
    expect(mocks.session.rpc).toHaveBeenCalledWith('retry_print_job', { p_job_id: 'j1' })
  })
  it('retryPrintJob trả nguyên lỗi RPC trong {ok:false}', async () => {
    mocks.state.rpcResult = { data: null, error: { message: 'Không có quyền' } }
    expect(await retryPrintJob('j1')).toEqual({ ok: false, error: 'Không có quyền' })
    mocks.state.rpcResult = { data: { ok: false, error: 'Phiếu này chưa lỗi, không cần in lại' }, error: null }
    expect(await retryPrintJob('j1')).toEqual({ ok: false, error: 'Phiếu này chưa lỗi, không cần in lại' })
  })
  it('markPrintedInBrowser gọi dismiss_print_job', async () => {
    expect(await markPrintedInBrowser('j1')).toEqual({ ok: true })
    expect(mocks.session.rpc).toHaveBeenCalledWith('dismiss_print_job', { p_job_id: 'j1' })
  })
  it('mã phiếu rỗng: lỗi, không gọi RPC', async () => {
    expect((await markPrintedInBrowser('')).ok).toBe(false)
    expect(mocks.session.rpc).not.toHaveBeenCalled()
  })
})
