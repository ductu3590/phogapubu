import { describe, expect, it, vi } from 'vitest'
import {
  readCashBookCategories,
  readCashShiftReport,
  readCashShiftState,
  readDebtCustomers,
  readPrintStatus,
  readStoreBankAccount,
} from './pos-browser-reads'

type RpcOut = { data: unknown; error: { message: string } | null }
function fakeClient(out: Record<string, RpcOut>) {
  return { rpc: async (name: string) => out[name] } as never
}

describe('readPrintStatus', () => {
  const run = (data: unknown) => readPrintStatus(fakeClient({ get_print_status: { data, error: null } }), 's1')
  const good = { id: 'j1', kind: 'bill', status: 'failed', error: 'x', created_at: '2026-11-09T10:00:00Z', label: 'Hoá đơn', request: { kind: 'bill', sessionIds: ['s1'] } }
  it('bỏ từng phần tử job sai hình, giữ phần tử đúng', async () => {
    const r = await run({ mode: 'agent', agent_online: true, problem_jobs: [good, null, { id: 5 }, { ...good, id: 'j2', status: 'done' }, { ...good, id: 'j3', request: 'rác' }] })
    expect(r.ok && r.status.problem_jobs.map((j) => j.id)).toEqual(['j1', 'j3'])
    // request sai hình bị bỏ (null) để nút trình duyệt không dựng URL từ rác
    expect(r.ok && r.status.problem_jobs[1].request).toBeNull()
  })
  it('thiếu trường: mặc định an toàn', async () => {
    const r = await run({})
    expect(r).toEqual({ ok: true, status: { mode: 'browser', agent_online: false, last_seen_at: null, queued_count: 0, problem_jobs: [] } })
  })
})

describe('readStoreBankAccount', () => {
  const client = (res: { data: unknown; error: { message: string } | null }, eq = vi.fn()) =>
    ({ from: () => ({ select: () => ({ eq: (...a: unknown[]) => { eq(...a); return { maybeSingle: async () => res } } }) }) }) as never
  it('đọc 3 cột theo đúng quán', async () => {
    const eq = vi.fn()
    const bank = { bank_bin: '970436', bank_account_number: '0011001234567', bank_account_name: 'DO DUC TU' }
    expect(await readStoreBankAccount(client({ data: bank, error: null }, eq), 's1')).toEqual({ ok: true, bank })
    expect(eq).toHaveBeenCalledWith('id', 's1')
  })
  it('lỗi đọc hoặc không có dòng: {ok:false}', async () => {
    expect((await readStoreBankAccount(client({ data: null, error: { message: 'x' } }), 's1')).ok).toBe(false)
    expect((await readStoreBankAccount(client({ data: null, error: null }), 's1')).ok).toBe(false)
  })
})

describe('đọc ca + sổ thu chi (mig 122)', () => {
  it('readCashShiftState: gọi get_open_cash_shift theo quán, parse; lỗi → {ok:false}', async () => {
    const calls: unknown[] = []
    const client = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: { required: true, can_manage_entries: false, shift: null }, error: null } } } as never
    expect(await readCashShiftState(client, 's1')).toEqual({ ok: true, state: { required: true, canManageEntries: false, shift: null } })
    expect(calls).toEqual([['get_open_cash_shift', { p_store_id: 's1' }]])
    expect(await readCashShiftState(fakeClient({ get_open_cash_shift: { data: null, error: { message: 'Chưa mở ca' } } }), 's1'))
      .toEqual({ ok: false, error: 'Chưa mở ca' })
  })
  it('readCashShiftReport: rác → {ok:false}', async () => {
    const r = await readCashShiftReport(fakeClient({ get_cash_shift_report: { data: { id: 'x' }, error: null } }), 'sh')
    expect(r).toEqual({ ok: false, error: 'Không đọc được ca' })
    const e = await readCashShiftReport(fakeClient({ get_cash_shift_report: { data: null, error: { message: 'Không có quyền xem ca này' } } }), 'sh')
    expect(e).toEqual({ ok: false, error: 'Không có quyền xem ca này' })
  })
  it('readCashBookCategories: chỉ danh mục đang dùng của đúng quán, sắp theo loại + thứ tự', async () => {
    const steps: unknown[] = []
    const rows = [{ id: 'c1', kind: 'payment', name: 'Đá', report_group: 'operating_expense', is_system: false, is_active: true, requires_note: false, sort_order: 40 }]
    const q = {
      select: (...a: unknown[]) => { steps.push(['select', ...a]); return q },
      eq: (...a: unknown[]) => { steps.push(['eq', ...a]); return q },
      order: (...a: unknown[]) => { steps.push(['order', ...a]); return q },
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    }
    const client = { from: (t: string) => { steps.push(['from', t]); return q } } as never
    const r = await readCashBookCategories(client, 's1')
    expect(r).toEqual({ ok: true, categories: [{ id: 'c1', kind: 'payment', name: 'Đá', reportGroup: 'operating_expense', isSystem: false, isActive: true, requiresNote: false, sortOrder: 40 }] })
    expect(steps).toContainEqual(['from', 'cash_book_categories'])
    expect(steps).toContainEqual(['eq', 'store_id', 's1'])
    expect(steps).toContainEqual(['eq', 'is_active', true])
    expect(steps.filter((s) => (s as unknown[])[0] === 'order').map((s) => (s as unknown[])[1])).toEqual(['kind', 'sort_order'])
  })
})

describe('readDebtCustomers', () => {
  it('gọi debt_list(store, false), đọc danh sách; lỗi → {ok:false}', async () => {
    const calls: unknown[] = []
    const client = { rpc: async (name: string, args: unknown) => {
      calls.push([name, args])
      return { data: { customers: [{ id: 'c1', name: 'Cty', outstanding: '650000', kind: 'company' }] }, error: null }
    } } as never
    const r = await readDebtCustomers(client, 's1')
    expect(calls).toEqual([['debt_list', { p_store_id: 's1', p_only_open: false }]])
    expect(r.ok && r.customers.map((c) => [c.id, c.outstanding, c.kind])).toEqual([['c1', 650000, 'company']])
    expect(await readDebtCustomers(fakeClient({ debt_list: { data: null, error: { message: 'x' } } }), 's1')).toEqual({ ok: false, error: 'x' })
  })
})
