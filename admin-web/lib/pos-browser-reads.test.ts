import { describe, expect, it, vi } from 'vitest'
import { readAutoPrintConfig, readPrintStatus, readStoreBankAccount } from './pos-browser-reads'

type RpcOut = { data: unknown; error: { message: string } | null }
function fakeClient(out: Record<string, RpcOut>) {
  return { rpc: async (name: string) => out[name] } as never
}
const okWorkflow: RpcOut = {
  data: { payment_timing: 'postpay', kitchen_release_policy: 'automatic', staff_order_release_policy: 'pos_confirmation' },
  error: null,
}
const okMode: RpcOut = { data: 'agent', error: null }

describe('readAutoPrintConfig', () => {
  it('ghép đúng mode + 2 policy + payment_timing', async () => {
    const r = await readAutoPrintConfig(fakeClient({ get_public_store_workflow: okWorkflow, get_print_mode: okMode }), 's1')
    expect(r).toEqual({
      ok: true,
      config: { mode: 'agent', kitchenReleasePolicy: 'automatic', staffOrderReleasePolicy: 'pos_confirmation', paymentTiming: 'postpay' },
    })
  })
  it('get_public_store_workflow lỗi: {ok:false}', async () => {
    const r = await readAutoPrintConfig(fakeClient({ get_public_store_workflow: { data: null, error: { message: 'x' } }, get_print_mode: okMode }), 's1')
    expect(r).toEqual({ ok: false, error: 'x' })
  })
  it('get_print_mode lỗi: {ok:false}', async () => {
    const r = await readAutoPrintConfig(fakeClient({ get_public_store_workflow: okWorkflow, get_print_mode: { data: null, error: { message: 'y' } } }), 's1')
    expect(r).toEqual({ ok: false, error: 'y' })
  })
  it('policy lạ: {ok:false}', async () => {
    const bad: RpcOut = { data: { ...(okWorkflow.data as object), kitchen_release_policy: 'weird' }, error: null }
    const r = await readAutoPrintConfig(fakeClient({ get_public_store_workflow: bad, get_print_mode: okMode }), 's1')
    expect(r.ok).toBe(false)
  })
})

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
