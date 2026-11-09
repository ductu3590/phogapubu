import { describe, expect, it, vi } from 'vitest'
import { loadShiftReportSlip } from './load-shift-report'

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'sh1', store_id: 'store-1', status: 'closed', opened_at: '2026-11-09T01:00:00Z', closed_at: '2026-11-09T15:30:00Z',
  opening_cash: 500000, cash_sales: 300000, bank_sales: 200000, cash_receipts: 0, cash_payments: 0, debt_cash: 0,
  expected_cash: 800000, counted_cash: 800000, difference: 0, bills_count: 3, entries: [], ...over,
})
function client(rpc: { data: unknown; error: { message: string } | null }, store: { data: unknown; error: { message: string } | null } = { data: { name: 'Yên Garden' }, error: null }) {
  return { rpc: vi.fn(async () => rpc), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => store }) }) }) }
}
const run = (c: ReturnType<typeof client>, storeId = 'store-1') =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadShiftReportSlip(c as any, storeId, 'sh1', 'Lan · Thu ngân', new Date('2026-11-09T15:35:00Z'))

describe('loadShiftReportSlip (service role, KHÔNG có kiểm quyền trong RPC)', () => {
  it('ca đã đóng đúng quán: ra props, debt null, gọi cash_shift_report_json', async () => {
    const c = client({ data: raw(), error: null })
    const r = await run(c)
    expect(r.ok && r.props.storeName).toBe('Yên Garden')
    expect(r.ok && r.props.debt).toBeNull()
    expect(r.ok && r.props.printedBy).toBe('Lan · Thu ngân')
    expect(c.rpc).toHaveBeenCalledWith('cash_shift_report_json', { p_shift_id: 'sh1' })
  })
  it('ca của quán khác: lỗi, không có props (không vẽ số tiền)', async () => {
    const r = await run(client({ data: raw({ store_id: 'store-2' }), error: null }))
    expect(r).toEqual({ ok: false, error: 'Không tìm thấy ca của quán này' })
  })
  it('ca chưa đóng: lỗi "Ca chưa kết, chưa có phiếu bàn giao"', async () => {
    const r = await run(client({ data: raw({ status: 'open' }), error: null }))
    expect(r).toEqual({ ok: false, error: 'Ca chưa kết, chưa có phiếu bàn giao' })
  })
  it('ca đóng nhưng thiếu số đã chốt: lỗi, không in 0đ', async () => {
    const r = await run(client({ data: raw({ counted_cash: null }), error: null }))
    expect(r.ok).toBe(false)
  })
  it('dữ liệu sai hình / RPC lỗi: lỗi; RPC lỗi là tạm thời', async () => {
    expect((await run(client({ data: 'rác', error: null }))).ok).toBe(false)
    expect(await run(client({ data: null, error: { message: 'down' } }))).toMatchObject({ ok: false, transient: true })
  })
  it('đọc tên quán lỗi: lỗi tạm thời; quán không có: lỗi vĩnh viễn', async () => {
    expect(await run(client({ data: raw(), error: null }, { data: null, error: { message: 'x' } }))).toMatchObject({ ok: false, transient: true })
    const r = await run(client({ data: raw(), error: null }, { data: null, error: null }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.transient).toBeUndefined()
  })
})

describe('loadShiftReportSlip — công nợ trong ca (mig 123)', () => {
  const debtClient = (out: { data: unknown; error: { message: string } | null }) => ({ rpc: vi.fn(async () => out) })
  const runDebt = (getDebtClient: (() => Promise<unknown>) | undefined) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadShiftReportSlip(client({ data: raw(), error: null }) as any, 'store-1', 'sh1', 'Lan · Thu ngân', new Date('2026-11-09T15:35:00Z'), getDebtClient as any)

  it('agent: đọc get_debt_shift_summary bằng client người tạo phiếu → props.debt có số', async () => {
    const u = debtClient({ data: { debt_recorded: 300000, debt_cash: 250000, debt_bank: 100000 }, error: null })
    const r = await runDebt(async () => u)
    expect(r.ok && r.props.debt).toEqual({ debtRecorded: 300000, debtCash: 250000, debtBank: 100000 })
    expect(u.rpc).toHaveBeenCalledWith('get_debt_shift_summary', { p_shift_id: 'sh1' })
  })
  it('RPC lỗi / không có quyền / dựng client lỗi: debt null, phiếu vẫn in', async () => {
    const denied = await runDebt(async () => debtClient({ data: null, error: { message: 'Không có quyền xem ca này' } }))
    expect(denied.ok && denied.props.debt).toBeNull()
    const broken = await runDebt(async () => { throw new Error('Thiếu người tạo phiếu') })
    expect(broken.ok && broken.props.debt).toBeNull()
  })
  it('chỉ dựng client người dùng khi ca hợp lệ (ca quán khác: không gọi)', async () => {
    const getter = vi.fn(async () => debtClient({ data: {}, error: null }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadShiftReportSlip(client({ data: raw({ store_id: 'store-2' }), error: null }) as any, 'store-1', 'sh1', 'x', new Date(), getter as any)
    expect(getter).not.toHaveBeenCalled()
  })
})
