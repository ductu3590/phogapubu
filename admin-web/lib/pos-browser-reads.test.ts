import { describe, expect, it } from 'vitest'
import { readAutoPrintConfig } from './pos-browser-reads'

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
