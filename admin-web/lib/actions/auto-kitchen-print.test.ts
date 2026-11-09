import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Giả lập Supabase theo bảng, ghi lại mọi .eq/.in để kiểm lọc store_id.
const mocks = vi.hoisted(() => {
  const state = {
    operator: { userId: 'u1', role: 'store_cashier', storeId: 'store-1' } as Record<string, unknown>,
    settings: { print_mode: 'agent', kitchen_release_policy: 'automatic', staff_order_release_policy: 'automatic' } as Record<string, unknown>,
    timing: 'postpay',
    orders: [] as Array<Record<string, unknown>>,
    ordersError: null as null | { message: string },
  }
  const calls = {
    filters: [] as Array<{ table: string; col: string; val: unknown }>,
    adminTables: [] as string[],
  }
  const enqueuePrint = vi.fn()
  function builder(table: string) {
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((col: string, val: unknown) => { calls.filters.push({ table, col, val }); return b })
    b.in = vi.fn((col: string, val: unknown) => { calls.filters.push({ table, col, val }); return b })
    b.maybeSingle = vi.fn(async () => ({
      data: table === 'store_workflow_settings' ? state.settings : table === 'stores' ? { payment_timing: state.timing } : null,
      error: null,
    }))
    b.then = (resolve: (v: unknown) => void) => {
      resolve(table === 'orders' ? { data: state.ordersError ? null : state.orders, error: state.ordersError } : { data: [], error: null })
    }
    return b
  }
  const admin = { from: vi.fn((t: string) => { calls.adminTables.push(t); return builder(t) }) }
  const requireOperator = vi.fn(async () => state.operator)
  return { state, calls, enqueuePrint, admin, requireOperator }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/actions/print-jobs', () => ({ enqueuePrint: mocks.enqueuePrint }))

import { enqueueAutoKitchenPrints } from './auto-kitchen-print'

const NOW = Date.parse('2026-12-01T12:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()
const row = (id: string, p: Record<string, unknown> = {}) => ({
  id, status: 'pending', order_source: 'staff', created_at: ago(5),
  payment_received_at: null, payment_method: 'cash', confirmed_at: null, ...p,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.state.operator = { userId: 'u1', role: 'store_cashier', storeId: 'store-1' }
  mocks.state.settings = { print_mode: 'agent', kitchen_release_policy: 'automatic', staff_order_release_policy: 'automatic' }
  mocks.state.timing = 'postpay'
  mocks.state.orders = []
  mocks.state.ordersError = null
  mocks.calls.filters.length = 0
  mocks.calls.adminTables.length = 0
  mocks.enqueuePrint.mockReset()
  mocks.enqueuePrint.mockResolvedValue({ ok: true, queued: 1 })
})
afterEach(() => vi.useRealTimers())

describe('enqueueAutoKitchenPrints', () => {
  it('thu ngân, đơn staff automatic 5 phút trước: gọi enqueuePrint đúng 1 lần, status queued', async () => {
    mocks.state.orders = [row('o1')]
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'o1', status: 'queued' }] })
    expect(mocks.enqueuePrint).toHaveBeenCalledTimes(1)
    expect(mocks.enqueuePrint).toHaveBeenCalledWith({ kind: 'order', orderId: 'o1' })
  })

  it('enqueuePrint trả queued 0: status already', async () => {
    mocks.state.orders = [row('o1')]
    mocks.enqueuePrint.mockResolvedValue({ ok: true, queued: 0 })
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'o1', status: 'already' }] })
  })

  it('store_staff bị từ chối, không đọc DB', async () => {
    mocks.state.operator = { userId: 'u2', role: 'store_staff', storeId: 'store-1' }
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: false, error: 'Bạn không có quyền in phiếu này' })
    expect(mocks.calls.adminTables).toEqual([])
  })

  it('print_mode browser: mọi đơn skipped, không gọi enqueuePrint', async () => {
    mocks.state.settings = { ...mocks.state.settings, print_mode: 'browser' }
    mocks.state.orders = [row('o1')]
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'o1', status: 'skipped' }] })
    expect(mocks.enqueuePrint).not.toHaveBeenCalled()
  })

  it('chính sách khách hiện là pos_confirmation: đơn khách skipped dù client gửi lên', async () => {
    mocks.state.settings = { ...mocks.state.settings, kitchen_release_policy: 'pos_confirmation' }
    mocks.state.orders = [row('o1', { order_source: 'customer_zalo' })]
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'o1', status: 'skipped' }] })
    expect(mocks.enqueuePrint).not.toHaveBeenCalled()
  })

  it('đơn có confirmed_at: skipped', async () => {
    mocks.state.orders = [row('o1', { confirmed_at: ago(1) })]
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'o1', status: 'skipped' }] })
  })

  it('đơn tạo 31 phút trước: skipped; 29 phút: queued', async () => {
    mocks.state.orders = [row('old', { created_at: ago(31) }), row('new', { created_at: ago(29) })]
    const r = await enqueueAutoKitchenPrints(['old', 'new'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'old', status: 'skipped' }, { orderId: 'new', status: 'queued' }] })
  })

  it('id không có trong kết quả đọc (quán khác): skipped; truy vấn orders có eq store_id', async () => {
    mocks.state.orders = []
    const r = await enqueueAutoKitchenPrints(['other'])
    expect(r).toEqual({ ok: true, results: [{ orderId: 'other', status: 'skipped' }] })
    expect(mocks.calls.filters).toContainEqual({ table: 'orders', col: 'store_id', val: 'store-1' })
    expect(mocks.calls.filters).toContainEqual({ table: 'store_workflow_settings', col: 'store_id', val: 'store-1' })
    expect(mocks.calls.filters).toContainEqual({ table: 'stores', col: 'id', val: 'store-1' })
    expect(mocks.enqueuePrint).not.toHaveBeenCalled()
  })

  it('enqueuePrint {ok:false}: status error kèm câu lỗi, đơn kế tiếp vẫn chạy', async () => {
    mocks.state.orders = [row('o1'), row('o2')]
    mocks.enqueuePrint.mockResolvedValueOnce({ ok: false, error: 'Chưa cài trạm in' })
    const r = await enqueueAutoKitchenPrints(['o1', 'o2'])
    expect(r).toEqual({ ok: true, results: [
      { orderId: 'o1', status: 'error', error: 'Chưa cài trạm in' },
      { orderId: 'o2', status: 'queued' },
    ] })
  })

  it('21 id: {ok:false}; id trùng chỉ gọi enqueuePrint một lần', async () => {
    const many = Array.from({ length: 21 }, (_, i) => `o${i}`)
    expect(await enqueueAutoKitchenPrints(many)).toEqual({ ok: false, error: 'Tối đa 20 đơn một lần' })
    mocks.state.orders = [row('o1')]
    await enqueueAutoKitchenPrints(['o1', 'o1', ''])
    expect(mocks.enqueuePrint).toHaveBeenCalledTimes(1)
  })

  it('lỗi đọc orders: {ok:false}, không ném', async () => {
    mocks.state.ordersError = { message: 'boom' }
    const r = await enqueueAutoKitchenPrints(['o1'])
    expect(r).toEqual({ ok: false, error: 'boom' })
  })
})
