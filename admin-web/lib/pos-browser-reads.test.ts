import { describe, expect, it } from 'vitest'
import { readAutoPrintConfig, readPrintStatus } from './pos-browser-reads'

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
