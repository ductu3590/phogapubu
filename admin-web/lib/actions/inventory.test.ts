import { beforeEach, describe, expect, it, vi } from 'vitest'

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const mocks = vi.hoisted(() => {
  const state = {
    rpc: {} as Record<string, { data: unknown; error: null | { message: string } }>,
  }
  const session = {
    rpc: vi.fn(async (name: string) => state.rpc[name] ?? { data: null, error: { message: `chưa giả lập ${name}` } }),
  }
  return {
    state,
    session,
    requireBackOfficeStoreId: vi.fn(async () => 'store-1'),
    requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
    loadBusinessDayStart: vi.fn(async () => '05:00'),
    revalidatePath: vi.fn(),
  }
})

vi.mock('@/lib/auth/operator', () => ({
  requireBackOfficeStoreId: mocks.requireBackOfficeStoreId,
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.session),
  createAdminClient: vi.fn(() => { throw new Error('không được dùng admin client') }),
}))
vi.mock('@/lib/actions/bills-report', () => ({ loadBusinessDayStart: mocks.loadBusinessDayStart }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const actions = await import('./inventory')
const server = await import('../inventory-server')

const ok = (data: unknown) => ({ data, error: null })
const rpcErr = (message: string) => ({ data: null, error: { message } })
const rpcCalls = (name: string) =>
  (mocks.session.rpc.mock.calls as unknown as Array<[string, unknown]>).filter((c) => c[0] === name).map((c) => c[1])

const postInput = {
  kind: 'receipt' as const,
  docDate: '2026-11-09',
  supplierName: 'Đại lý',
  note: null,
  paidStatus: 'paid' as const,
  paidMethod: 'bank' as const,
  lines: [{ inventoryItemId: UUID(1), qty: 2.5, unitCost: 126000 }],
  clientRequestId: UUID(9),
}

describe('server action kho', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.rpc = {}
  })

  it('postInventoryDocument gửi store_id của operator, không lấy từ input; map before_count_doc_no → beforeCountDocNo', async () => {
    mocks.state.rpc.inventory_post_document = ok({ ok: true, id: UUID(5), doc_no: 'PN-0003', replayed: false,
      before_count_doc_no: 'PK-0001' })
    const r = await actions.postInventoryDocument({ ...postInput, store_id: 'store-khac' } as typeof postInput)
    expect(r).toEqual({ ok: true, id: UUID(5), docNo: 'PN-0003', replayed: false, beforeCountDocNo: 'PK-0001' })
    expect(rpcCalls('inventory_post_document')).toEqual([{
      p_kind: 'receipt',
      p_doc: { store_id: 'store-1', doc_date: '2026-11-09', supplier_name: 'Đại lý', note: null, paid_status: 'paid',
        paid_method: 'bank' },
      p_lines: [{ inventory_item_id: UUID(1), qty: 2.5, unit_cost: 126000 }],
      p_client_request_id: UUID(9),
    }])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/inventory')
  })

  it('phiếu kiểm gửi counted_qty (+ unit_cost khi có), phiếu huỷ chỉ qty', async () => {
    mocks.state.rpc.inventory_post_document = ok({ ok: true, id: UUID(5), doc_no: 'PK-0001', replayed: false,
      before_count_doc_no: null })
    await actions.postInventoryDocument({ ...postInput, kind: 'count', paidStatus: null, paidMethod: null, lines: [
      { inventoryItemId: UUID(1), countedQty: 0 },
      { inventoryItemId: UUID(2), countedQty: 1.5, unitCost: 120000 },
      { inventoryItemId: UUID(3), countedQty: 2, unitCost: null },
    ] })
    await actions.postInventoryDocument({ ...postInput, kind: 'writeoff', paidStatus: null, paidMethod: null,
      lines: [{ inventoryItemId: UUID(1), qty: 2 }] })
    const [count, writeoff] = rpcCalls('inventory_post_document') as Array<{ p_lines: unknown }>
    expect(count.p_lines).toEqual([
      { inventory_item_id: UUID(1), counted_qty: 0 },
      { inventory_item_id: UUID(2), counted_qty: 1.5, unit_cost: 120000 },
      { inventory_item_id: UUID(3), counted_qty: 2 },
    ])
    expect(writeoff.p_lines).toEqual([{ inventory_item_id: UUID(1), qty: 2 }])
  })

  it('RPC lỗi "Không có quyền" → { ok:false, error:"Không có quyền" }, không ném', async () => {
    mocks.state.rpc.inventory_post_document = rpcErr('Không có quyền')
    expect(await actions.postInventoryDocument(postInput)).toEqual({ ok: false, error: 'Không có quyền' })
    mocks.state.rpc.inventory_void_document = rpcErr('Không có quyền')
    expect(await actions.voidInventoryDocument(UUID(5), 'Nhầm')).toEqual({ ok: false, error: 'Không có quyền' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    // Lỗi ngoài dự kiến (lời gọi rpc ném, vd. mất mạng) cũng thành { ok:false }.
    mocks.session.rpc.mockRejectedValueOnce(new Error('mất mạng'))
    expect(await actions.loadInventoryDocument(UUID(5))).toEqual({ ok: false, error: 'mất mạng' })
  })

  it('requireBackOfficeStoreId ném (thu ngân) → postInventoryDocument trả { ok:false, error:"Chỉ chủ quán hoặc quản lý mới thao tác được ở đây" }, không gọi RPC', async () => {
    const msg = 'Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'
    mocks.requireBackOfficeStoreId.mockRejectedValue(new Error(msg))
    try {
      const results = await Promise.all([
        actions.postInventoryDocument(postInput),
        actions.saveInventoryItem({ id: null, name: 'Bia', unit: 'lon', kind: 'goods', sku: null, minStock: null }),
        actions.setInventoryItemActive(UUID(1), false),
        actions.loadInventoryDocuments('receipt', '2026-11-01', '2026-11-09'),
        actions.loadInventoryDocument(UUID(1)),
        actions.voidInventoryDocument(UUID(1), 'x'),
        actions.loadItemLedger(UUID(1), '2026-11-01', '2026-11-09'),
        actions.setMenuStockLink({ menuItemId: UUID(1), variantId: null, inventoryItemId: null, qty: null }),
      ])
      for (const r of results) expect(r).toEqual({ ok: false, error: msg })
      expect(mocks.session.rpc).not.toHaveBeenCalled()
      expect(mocks.requirePosOperatorStoreId).not.toHaveBeenCalled()
    } finally {
      mocks.requireBackOfficeStoreId.mockReset()
      mocks.requireBackOfficeStoreId.mockImplementation(async () => 'store-1')
    }
  })

  it('loadInventoryStock dùng requirePosOperatorStoreId: thu ngân đọc được', async () => {
    mocks.state.rpc.inventory_stock_levels = ok({ at: 'x', items: [
      { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods', sku: null, min_stock: null, is_active: true, qty: '66',
        last_unit_cost: 10000, stock_value: 660000 }] })
    const r = await actions.loadInventoryStock()
    expect(r).toEqual({ ok: true, rows: [{ id: 'a', name: 'Bia', unit: 'lon', kind: 'goods', sku: null, minStock: null,
      isActive: true, qty: 66, lastUnitCost: 10000, stockValue: 660000 }] })
    expect(mocks.requirePosOperatorStoreId).toHaveBeenCalledTimes(1)
    expect(rpcCalls('inventory_stock_levels')).toEqual([{ p_store_id: 'store-1' }])

    // Thu ngân (không qua guard hậu cần): giá vốn / giá trị tồn bị gỡ Ở SERVER, không tới trình duyệt.
    mocks.requireBackOfficeStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'))
    const cashier = await actions.loadInventoryStock()
    expect(cashier).toEqual({ ok: true, rows: [{ id: 'a', name: 'Bia', unit: 'lon', kind: 'goods', sku: null, minStock: null,
      isActive: true, qty: 66, lastUnitCost: null, stockValue: 0 }] })
    expect(JSON.stringify(cashier)).not.toContain('10000')
    expect(JSON.stringify(cashier)).not.toContain('660000')

    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    expect(await actions.loadInventoryStock()).toEqual({ ok: false,
      error: 'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây' })
  })

  it('id không phải UUID → "Mã không hợp lệ", không gọi RPC', async () => {
    const bad = 'abc'
    const results = await Promise.all([
      actions.saveInventoryItem({ id: bad, name: 'Bia', unit: 'lon', kind: 'goods', sku: null, minStock: null }),
      actions.setInventoryItemActive(bad, false),
      actions.loadInventoryDocument(bad),
      actions.voidInventoryDocument(bad, 'Nhầm'),
      actions.loadItemLedger(bad, '2026-11-01', '2026-11-09'),
      actions.setMenuStockLink({ menuItemId: bad, variantId: null, inventoryItemId: null, qty: null }),
      actions.setMenuStockLink({ menuItemId: UUID(1), variantId: bad, inventoryItemId: UUID(2), qty: 1 }),
      actions.setMenuStockLink({ menuItemId: UUID(1), variantId: null, inventoryItemId: bad, qty: 1 }),
      actions.postInventoryDocument({ ...postInput, clientRequestId: bad }),
      actions.postInventoryDocument({ ...postInput, lines: [{ inventoryItemId: bad, qty: 1, unitCost: 1 }] }),
    ])
    for (const r of results) expect(r).toEqual({ ok: false, error: 'Mã không hợp lệ' })
    // Ngày sai định dạng.
    expect(await actions.postInventoryDocument({ ...postInput, docDate: '09/11/2026' }))
      .toEqual({ ok: false, error: 'Ngày không hợp lệ' })
    expect(await actions.loadInventoryDocuments('receipt', '2026-11-1', '2026-11-09'))
      .toEqual({ ok: false, error: 'Ngày không hợp lệ' })
    expect(await actions.loadItemLedger(UUID(1), '2026-11-01', 'hôm nay')).toEqual({ ok: false, error: 'Ngày không hợp lệ' })
    expect(await actions.loadInventoryDocuments('transfer' as 'receipt', '2026-11-01', '2026-11-09'))
      .toEqual({ ok: false, error: 'Loại phiếu không hợp lệ' })
    expect(mocks.session.rpc).not.toHaveBeenCalled()
  })

  it('replayed true vẫn ok:true', async () => {
    mocks.state.rpc.inventory_post_document = ok({ ok: true, id: UUID(5), doc_no: 'PN-0003', replayed: true,
      before_count_doc_no: null })
    expect(await actions.postInventoryDocument(postInput))
      .toEqual({ ok: true, id: UUID(5), docNo: 'PN-0003', replayed: true, beforeCountDocNo: null })
  })

  it('voidInventoryDocument lý do chỉ dấu cách → lỗi trước khi gọi RPC', async () => {
    expect(await actions.voidInventoryDocument(UUID(5), '   ')).toEqual({ ok: false, error: 'Cần lý do huỷ phiếu' })
    expect(mocks.session.rpc).not.toHaveBeenCalled()
    mocks.state.rpc.inventory_void_document = ok({ ok: true, id: UUID(5), already: true })
    expect(await actions.voidInventoryDocument(UUID(5), ' Nhầm ')).toEqual({ ok: true, already: true })
    expect(rpcCalls('inventory_void_document')).toEqual([{ p_id: UUID(5), p_reason: 'Nhầm' }])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/inventory')
  })

  it('setMenuStockLink inventoryItemId null gửi p_inventory_item_id null, p_qty null; revalidate /admin/menu', async () => {
    mocks.state.rpc.inventory_set_menu_link = ok({ ok: true, link_id: null, changed: true })
    expect(await actions.setMenuStockLink({ menuItemId: UUID(1), variantId: UUID(2), inventoryItemId: null, qty: 24 }))
      .toEqual({ ok: true })
    expect(rpcCalls('inventory_set_menu_link')).toEqual([{ p_menu_item_id: UUID(1), p_variant_id: UUID(2),
      p_inventory_item_id: null, p_qty: null }])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/menu')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/inventory')

    await actions.setMenuStockLink({ menuItemId: UUID(1), variantId: null, inventoryItemId: UUID(3), qty: 24 })
    expect(rpcCalls('inventory_set_menu_link')[1]).toEqual({ p_menu_item_id: UUID(1), p_variant_id: null,
      p_inventory_item_id: UUID(3), p_qty: 24 })
  })

  it('saveInventoryItem / setInventoryItemActive map kết quả', async () => {
    mocks.state.rpc.inventory_upsert_item = ok({ ok: true, id: UUID(7) })
    expect(await actions.saveInventoryItem({ id: null, name: 'Bia', unit: 'lon', kind: 'goods', sku: 'B1', minStock: 24 }))
      .toEqual({ ok: true, id: UUID(7) })
    expect(rpcCalls('inventory_upsert_item')).toEqual([{ p_store_id: 'store-1', p_id: null, p_name: 'Bia', p_unit: 'lon',
      p_kind: 'goods', p_sku: 'B1', p_min_stock: 24 }])
    mocks.state.rpc.inventory_set_item_active = ok({ ok: true, id: UUID(7), is_active: false, links_closed: 2 })
    expect(await actions.setInventoryItemActive(UUID(7), false)).toEqual({ ok: true, linksClosed: 2 })
    expect(rpcCalls('inventory_set_item_active')).toEqual([{ p_id: UUID(7), p_active: false }])
    // Ngừng dùng đóng liên kết món → ô "Trừ kho" ở trang Món phải làm mới.
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/menu')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/inventory')
  })

  it('loadInventoryDocuments / loadInventoryDocument / loadItemLedger gửi store của guard và parse', async () => {
    mocks.state.rpc.inventory_list_documents = ok({ documents: [], suppliers: ['Đại lý'] })
    expect(await actions.loadInventoryDocuments('count', '2026-11-01', '2026-11-09'))
      .toEqual({ ok: true, documents: [], suppliers: ['Đại lý'] })
    expect(rpcCalls('inventory_list_documents')).toEqual([{ p_store_id: 'store-1', p_kind: 'count', p_from: '2026-11-01',
      p_to: '2026-11-09' }])
    mocks.state.rpc.inventory_get_document = ok({ kind: 'receipt' }) // hỏng
    expect(await actions.loadInventoryDocument(UUID(5))).toEqual({ ok: false, error: 'Không đọc được phiếu' })
    mocks.state.rpc.inventory_item_ledger = ok({ item: { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods' },
      from: '2026-11-01', to: '2026-11-09', opening_qty: 0, closing_qty: 0, rows: [] })
    const l = await actions.loadItemLedger(UUID(1), '2026-11-01', '2026-11-09')
    expect(l.ok && l.ledger.item.name).toBe('Bia')
    expect(rpcCalls('inventory_item_ledger')).toEqual([{ p_item_id: UUID(1), p_from: '2026-11-01', p_to: '2026-11-09' }])
  })
})

describe('bộ đọc phía server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.rpc = {}
  })

  it('readMenuStock RPC lỗi → null', async () => {
    mocks.state.rpc.inventory_menu_links = rpcErr('function inventory_menu_links does not exist')
    expect(await server.readMenuStock('store-1')).toBeNull()
    mocks.session.rpc.mockRejectedValueOnce(new Error('mất mạng'))
    expect(await server.readMenuStock('store-1')).toBeNull()
    mocks.state.rpc.inventory_menu_links = ok({ goods: [{ id: 'a', name: 'Bia', unit: 'lon' }], links: [] })
    expect(await server.readMenuStock('store-1')).toEqual({ goods: [{ id: 'a', name: 'Bia', unit: 'lon' }], links: [] })
    expect(rpcCalls('inventory_menu_links')).toContainEqual({ p_store_id: 'store-1' })
  })

  it('readStockLevels(storeId, { withCost: false }) gỡ giá vốn + giá trị tồn', async () => {
    mocks.state.rpc.inventory_stock_levels = ok({ at: 'x', items: [
      { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods', sku: null, min_stock: 24, is_active: true, qty: 66,
        last_unit_cost: 10000, stock_value: 660000 }] })
    const full = await server.readStockLevels('store-1')
    expect(full.ok && full.rows[0]).toMatchObject({ lastUnitCost: 10000, stockValue: 660000 })
    const lean = await server.readStockLevels('store-1', { withCost: false })
    expect(lean.ok && lean.rows[0]).toMatchObject({ qty: 66, minStock: 24, lastUnitCost: null, stockValue: 0 })
  })

  it('readStockLevels lỗi RPC → { ok:false }', async () => {
    mocks.state.rpc.inventory_stock_levels = rpcErr('Không có quyền')
    expect(await server.readStockLevels('store-1')).toEqual({ ok: false, error: 'Không có quyền' })
  })

  it('inventoryToday theo giờ bắt đầu ngày của quán (05:00): 04:59 vẫn là hôm qua, 05:00 sang ngày mới', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-11-10T04:59:59+07:00'))
      expect(await server.inventoryToday('store-1')).toBe('2026-11-09')
      vi.setSystemTime(new Date('2026-11-10T05:00:00+07:00'))
      expect(await server.inventoryToday('store-1')).toBe('2026-11-10')
      expect(mocks.loadBusinessDayStart).toHaveBeenCalledWith('store-1')
    } finally {
      vi.useRealTimers()
    }
  })
})
