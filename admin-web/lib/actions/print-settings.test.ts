import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    operator: { userId: 'u1', role: 'store_owner', storeId: 'store-1' } as Record<string, unknown>,
    station: { id: 'st1', name: 'Bếp nướng', is_pos: false, is_default_kitchen: false } as null | Record<string, unknown>,
    updateResult: [{ id: 'st1' }] as Array<{ id: string }>,
    rpcResult: { data: { ok: true }, error: null } as { data: unknown; error: null | { message: string } },
  }
  const calls = {
    filters: [] as Array<{ op: string; col: string; val: unknown }>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    deletes: 0,
    from: [] as string[],
  }
  function builder(table: string) {
    let mode: 'select' | 'update' | 'insert' | 'delete' = 'select'
    const b: Record<string, unknown> = {}
    b.select = vi.fn(() => b)
    b.eq = vi.fn((col: string, val: unknown) => { calls.filters.push({ op: mode, col, val }); return b })
    b.update = vi.fn((v: Record<string, unknown>) => { mode = 'update'; calls.updates.push(v); return b })
    b.insert = vi.fn((v: Record<string, unknown>) => { mode = 'insert'; calls.inserts.push({ table, ...v }); return b })
    b.delete = vi.fn(() => { mode = 'delete'; calls.deletes++; return b })
    b.maybeSingle = vi.fn(async () => ({ data: state.station, error: null }))
    b.single = vi.fn(async () => ({ data: { id: 'new-id' }, error: null }))
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: mode === 'update' ? state.updateResult : [], error: null })
    return b
  }
  const admin = { from: vi.fn((t: string) => { calls.from.push(t); return builder(t) }) }
  const session = { rpc: vi.fn(async () => state.rpcResult) }
  return { state, calls, admin, session, requireOperator: vi.fn(async () => state.operator), revalidatePath: vi.fn() }
})

vi.mock('@/lib/auth/operator', () => ({ requireOperator: mocks.requireOperator }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.session),
  createAdminClient: vi.fn(() => mocks.admin),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('./print-settings')

describe('print-settings actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.filters.length = 0
    mocks.calls.inserts.length = 0
    mocks.calls.updates.length = 0
    mocks.calls.deletes = 0
    mocks.calls.from.length = 0
    Object.assign(mocks.state, {
      operator: { userId: 'u1', role: 'store_owner', storeId: 'store-1' },
      station: { id: 'st1', name: 'Bếp nướng', is_pos: false, is_default_kitchen: false },
      updateResult: [{ id: 'st1' }],
      rpcResult: { data: { ok: true }, error: null },
    })
  })

  it('thu ngân bị từ chối ở mọi action', async () => {
    mocks.state.operator = { userId: 'u2', role: 'store_cashier', storeId: 'store-1' }
    const results = await Promise.all([
      actions.savePrintMode('agent'),
      actions.savePrintStation({ id: null, name: 'Bar', printerName: null }),
      actions.deletePrintStation('st1'),
      actions.createPairCode('Máy quầy'),
      actions.revokePrintAgent('a1'),
      actions.enqueueTestPrint('st1'),
    ])
    for (const r of results) expect(r.ok).toBe(false)
    expect(mocks.session.rpc).not.toHaveBeenCalled()
    expect(mocks.admin.from).not.toHaveBeenCalled()
  })

  it('không có quyền vận hành: trả lỗi, không ném', async () => {
    mocks.requireOperator.mockRejectedValueOnce(new Error('Tài khoản chưa được cấp quyền vận hành'))
    expect(await actions.savePrintMode('agent')).toEqual({ ok: false, error: 'Tài khoản chưa được cấp quyền vận hành' })
  })

  it('savePrintMode gọi RPC set_print_mode đúng tham số', async () => {
    expect(await actions.savePrintMode('agent')).toEqual({ ok: true })
    expect(mocks.session.rpc).toHaveBeenCalledWith('set_print_mode', { p_store_id: 'store-1', p_mode: 'agent' })
  })

  it('savePrintMode trả nguyên câu lỗi RPC trong {ok:false}', async () => {
    mocks.state.rpcResult = { data: null, error: { message: 'Chế độ phần mềm in cần cả đơn khách và đơn nhân viên xuống bếp theo thu ngân xác nhận' } }
    expect(await actions.savePrintMode('agent')).toEqual({
      ok: false,
      error: 'Chế độ phần mềm in cần cả đơn khách và đơn nhân viên xuống bếp theo thu ngân xác nhận',
    })
  })

  it('savePrintMode từ chối giá trị lạ', async () => {
    expect((await actions.savePrintMode('xyz' as 'agent')).ok).toBe(false)
    expect(mocks.session.rpc).not.toHaveBeenCalled()
  })

  it('savePrintStation sửa trạm quán khác: {ok:false}, update có .eq("store_id")', async () => {
    mocks.state.updateResult = []
    const r = await actions.savePrintStation({ id: 'st-khac', name: 'Bar', printerName: 'XP' })
    expect(r.ok).toBe(false)
    expect(mocks.calls.filters).toContainEqual({ op: 'update', col: 'store_id', val: 'store-1' })
    expect(mocks.calls.filters).toContainEqual({ op: 'update', col: 'id', val: 'st-khac' })
  })

  it('savePrintStation sửa được trạm của quán: ghi tên đã cắt khoảng trắng và máy in', async () => {
    expect(await actions.savePrintStation({ id: 'st1', name: '  Bar  ', printerName: ' XP-80 ' })).toEqual({ ok: true, id: 'st1' })
    expect(mocks.calls.updates[0]).toEqual({ name: 'Bar', printer_name: 'XP-80' })
  })

  it('savePrintStation thêm mới gắn store_id của người gọi, printerName rỗng thành null', async () => {
    const r = await actions.savePrintStation({ id: null, name: 'Bar', printerName: '  ' })
    expect(r).toEqual({ ok: true, id: 'new-id' })
    expect(mocks.calls.inserts[0]).toMatchObject({ table: 'print_stations', store_id: 'store-1', name: 'Bar', printer_name: null })
  })

  it('tên trạm rỗng: {ok:false}', async () => {
    expect((await actions.savePrintStation({ id: null, name: '   ', printerName: null })).ok).toBe(false)
    expect(mocks.calls.inserts).toHaveLength(0)
    expect(mocks.calls.updates).toHaveLength(0)
  })

  it('deletePrintStation: trạm is_pos hoặc is_default_kitchen bị từ chối', async () => {
    mocks.state.station = { id: 'st1', name: 'Quầy', is_pos: true, is_default_kitchen: false }
    expect((await actions.deletePrintStation('st1')).ok).toBe(false)
    mocks.state.station = { id: 'st2', name: 'Bếp', is_pos: false, is_default_kitchen: true }
    expect((await actions.deletePrintStation('st2')).ok).toBe(false)
    expect(mocks.calls.deletes).toBe(0)
  })

  it('deletePrintStation: trạm thường xoá được, lọc store_id; trạm quán khác {ok:false}', async () => {
    expect(await actions.deletePrintStation('st1')).toEqual({ ok: true })
    expect(mocks.calls.deletes).toBe(1)
    expect(mocks.calls.filters).toContainEqual({ op: 'delete', col: 'store_id', val: 'store-1' })
    mocks.calls.deletes = 0
    mocks.state.station = null
    expect((await actions.deletePrintStation('st-khac')).ok).toBe(false)
    expect(mocks.calls.deletes).toBe(0)
  })

  it('createPairCode trả code + expiresAt từ RPC', async () => {
    mocks.state.rpcResult = { data: { code: '123456', expires_at: '2026-11-05T10:10:00Z' }, error: null }
    expect(await actions.createPairCode('Máy quầy')).toEqual({ ok: true, code: '123456', expiresAt: '2026-11-05T10:10:00Z' })
    expect(mocks.session.rpc).toHaveBeenCalledWith('create_print_pair_code', { p_store_id: 'store-1', p_name: 'Máy quầy' })
  })

  it('revokePrintAgent gọi RPC; lỗi RPC trả {ok:false}', async () => {
    expect(await actions.revokePrintAgent('a1')).toEqual({ ok: true })
    expect(mocks.session.rpc).toHaveBeenCalledWith('revoke_print_agent', { p_agent_id: 'a1' })
    mocks.state.rpcResult = { data: null, error: { message: 'Không có quyền' } }
    expect(await actions.revokePrintAgent('a1')).toEqual({ ok: false, error: 'Không có quyền' })
  })

  it('enqueueTestPrint: tạo job kind test đúng station, dedupe ngẫu nhiên, created_by người gọi', async () => {
    expect(await actions.enqueueTestPrint('st1')).toEqual({ ok: true })
    await actions.enqueueTestPrint('st1')
    const jobs = mocks.calls.inserts.filter((i) => i.table === 'print_jobs')
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ store_id: 'store-1', station_id: 'st1', kind: 'test', created_by: 'u1' })
    expect(jobs[0].dedupe_key).toMatch(/^test:[0-9a-f-]{36}$/)
    expect(jobs[0].dedupe_key).not.toBe(jobs[1].dedupe_key)
    expect(jobs[0].ref).toMatchObject({ label: expect.stringContaining('Bếp nướng'), request: null })
    expect(mocks.calls.filters).toContainEqual({ op: 'select', col: 'store_id', val: 'store-1' })
  })

  it('enqueueTestPrint: trạm quán khác {ok:false}, không insert', async () => {
    mocks.state.station = null
    expect((await actions.enqueueTestPrint('st-khac')).ok).toBe(false)
    expect(mocks.calls.inserts).toHaveLength(0)
  })
})

describe('savePrintMode: chuyển về trình duyệt', () => {
  it('huỷ các phiếu còn xếp hàng của đúng quán để phần mềm in cũ không in muộn', async () => {
    mocks.calls.filters.length = 0
    mocks.calls.updates.length = 0
    expect(await actions.savePrintMode('browser')).toEqual({ ok: true })
    expect(mocks.calls.from).toContain('print_jobs')
    expect(mocks.calls.updates[0]).toMatchObject({ status: 'expired' })
    expect(mocks.calls.updates[0]).toHaveProperty('resolved_at')
    expect(mocks.calls.filters).toEqual(expect.arrayContaining([
      { op: 'update', col: 'store_id', val: 'store-1' },
      { op: 'update', col: 'status', val: 'queued' },
    ]))
  })
  it('bật agent: không đụng hàng đợi', async () => {
    mocks.calls.from.length = 0
    expect(await actions.savePrintMode('agent')).toEqual({ ok: true })
    expect(mocks.calls.from).not.toContain('print_jobs')
  })
})
