import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadOrderSlip } from './load-order-slip'

type R = { data: unknown; error: null | { message: string } }
const ok = (data: unknown): R => ({ data, error: null })
const err = (message: string): R => ({ data: null, error: { message } })

// Client giả theo bảng. Riêng `orders` có hai truy vấn: một đơn (maybeSingle) và đơn của phiên (await trực tiếp).
const cfg = {
  orderOne: ok(null) as R,
  orderMany: ok([]) as R,
  items: ok([]) as R,
  sessionTables: ok([]) as R,
  table: ok(null) as R,
  store: ok({ name: 'Bia lẩu Bảo Lương', phone: '0826', address: ' 236 Bảo Lương ' }) as R,
  rpc: ok(null) as R,
}
const filters: Array<{ table: string; col: string; val: unknown }> = []

function builder(table: string) {
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, val: unknown) => { filters.push({ table, col, val }); return b }
  b.maybeSingle = async () => {
    if (table === 'orders') return cfg.orderOne
    return table === 'tables' ? cfg.table : cfg.store
  }
  b.single = async () => cfg.store
  b.then = (resolve: (v: R) => void) => {
    resolve(
      table === 'orders' ? cfg.orderMany
        : table === 'order_items' ? cfg.items
        : table === 'session_tables' ? cfg.sessionTables
        : ok([]),
    )
  }
  return b
}
const client = {
  from: vi.fn((t: string) => builder(t)),
  rpc: vi.fn(async () => cfg.rpc),
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (source: Parameters<typeof loadOrderSlip>[2]) => loadOrderSlip(client as any, 'store-1', source)

const order = {
  id: 'o1', created_at: '2026-11-05T10:00:00Z', note: 'ít cay', total_amount: 150000,
  session_id: 'sess1', table_id: 't1', order_source: 'customer', status: 'confirmed',
}

describe('loadOrderSlip — nhánh đơn thường', () => {
  beforeEach(() => {
    filters.length = 0
    Object.assign(cfg, {
      orderOne: ok(order),
      orderMany: ok([{ total_amount: 150000, status: 'confirmed' }, { total_amount: 90000, status: 'paid' }, { total_amount: 50000, status: 'cancelled' }]),
      items: ok([
        { id: 'i1', menu_item_id: 'm1', item_name: 'Bia hơi', quantity: 2, item_price: 30000, note: null, selected_toppings: [{ name: 'Đá', price: 0 }], void_type: null },
        { id: 'i2', menu_item_id: null, item_name: 'Lạc rang', quantity: 1, item_price: 20000, note: 'ít muối', selected_toppings: null, void_type: 'gift' },
        { id: 'i3', menu_item_id: 'm3', item_name: 'Khách bỏ', quantity: 1, item_price: 99000, note: null, selected_toppings: [], void_type: 'cancelled' },
      ]),
      sessionTables: ok([{ is_open: true, tables: { table_number: 'Bàn 10' } }, { is_open: true, tables: { table_number: 'Bàn 2' } }, { is_open: false, tables: { table_number: 'Bàn 9' } }]),
      table: ok({ table_number: 'Bàn X' }),
      store: ok({ name: 'Bia lẩu Bảo Lương', phone: '0826', address: ' 236 Bảo Lương ' }),
    })
  })

  it('dựng phiếu: key = order_items.id, menuItemId, bỏ dòng Khách bỏ, giữ món tặng, tên bàn theo thứ tự số', async () => {
    const r = await load({ orderId: 'o1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.slip.items.map((i) => [i.key, i.menuItemId, i.name, i.isGift])).toEqual([
      ['i1', 'm1', 'Bia hơi', false],
      ['i2', null, 'Lạc rang', true],
    ])
    expect(r.slip.tableLabel).toBe('Bàn 2, Bàn 10')
    expect(r.slip.sessionTotal).toBe(240000) // bỏ đơn đã huỷ
    expect(r.slip.orderTotal).toBe(150000)
    expect(r.slip.storeName).toBe('Bia lẩu Bảo Lương')
    expect(r.slip.storeAddress).toBe('236 Bảo Lương')
    expect(r.slip.items[0].toppings).toEqual([{ name: 'Đá', price: 0 }])
  })

  it('lọc đơn theo store_id của caller', async () => {
    await load({ orderId: 'o1' })
    expect(filters).toContainEqual({ table: 'orders', col: 'store_id', val: 'store-1' })
    expect(filters).toContainEqual({ table: 'orders', col: 'id', val: 'o1' })
  })

  it('đơn không thuộc quán: "Không tìm thấy đơn của quán này."', async () => {
    cfg.orderOne = ok(null)
    expect(await load({ orderId: 'o-khac' })).toEqual({ ok: false, error: 'Không tìm thấy đơn của quán này.' })
  })

  it('lỗi DB khi đọc đơn: trả lỗi thật, không nhầm với "không tìm thấy"', async () => {
    cfg.orderOne = err('network down')
    expect(await load({ orderId: 'o1' })).toEqual({ ok: false, error: 'network down', transient: true })
  })

  it('lỗi DB khi đọc món: trả lỗi, không ra phiếu rỗng', async () => {
    cfg.items = err('timeout')
    expect(await load({ orderId: 'o1' })).toEqual({ ok: false, error: 'timeout', transient: true })
  })

  it('lỗi DB khi đọc bàn của phiên: trả lỗi', async () => {
    cfg.sessionTables = err('boom bàn')
    expect(await load({ orderId: 'o1' })).toEqual({ ok: false, error: 'boom bàn', transient: true })
  })

  it('lỗi DB khi đọc đơn của phiên: trả lỗi, KHÔNG ra tạm tính 0đ', async () => {
    cfg.orderMany = err('boom phiên')
    const r = await load({ orderId: 'o1' })
    expect(r).toEqual({ ok: false, error: 'boom phiên', transient: true })
  })

  it('đơn đã huỷ: {ok:false,"Đơn đã huỷ"}, không phải lỗi tạm thời', async () => {
    cfg.orderOne = ok({ ...order, status: 'cancelled' })
    expect(await load({ orderId: 'o1' })).toEqual({ ok: false, error: 'Đơn đã huỷ' })
  })

  it('đơn không có phiên: lấy tên bàn từ table_id, tạm tính = tổng đơn, không đọc session_tables', async () => {
    cfg.orderOne = ok({ ...order, session_id: null })
    const r = await load({ orderId: 'o1' })
    expect(r.ok && r.slip.tableLabel).toBe('Bàn X')
    expect(r.ok && r.slip.sessionTotal).toBe(150000)
  })

  it('lỗi đọc bảng stores thì giữ fallback "Quán" như cũ', async () => {
    cfg.store = err('stores lỗi')
    const r = await load({ orderId: 'o1' })
    expect(r.ok && r.slip.storeName).toBe('Quán')
  })
})

describe('loadOrderSlip — nhánh đặt trước', () => {
  const job = (over: Record<string, unknown> = {}) => ({
    id: 'pj1', store_id: 'store-1', kind: 'original', revision: 2, requested_at: '2026-11-05T09:00:00Z',
    snapshot: {
      total_amount: 200000, note: 'ghi chú', table_numbers: ['Bàn 1', 'Bàn 2'],
      items: [
        { item_name: 'Gà nướng', quantity: 1, item_price: 120000, menu_item_id: 'm9', selected_toppings: [{ name: 'Sốt', price: 0 }] },
        { name: 'Cơm', quantity: 2, price: 40000 },
      ],
    },
    ...over,
  })
  beforeEach(() => {
    filters.length = 0
    cfg.rpc = ok(job())
    cfg.store = ok({ name: 'Quán A', phone: null, address: null })
  })

  it('key = chỉ số trong snapshot, menuItemId từ snapshot (thiếu thì null)', async () => {
    const r = await load({ preorderJobId: 'pj1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.slip.items.map((i) => [i.key, i.menuItemId, i.name])).toEqual([
      ['0', 'm9', 'Gà nướng'],
      ['1', null, 'Cơm'],
    ])
    expect(r.slip.tableLabel).toBe('Bàn 1, Bàn 2')
    expect(r.slip.preorderRevision).toBe(2)
    expect(r.slip.orderSource).toBe('reservation_preorder')
    expect(client.rpc).toHaveBeenCalledWith('get_reservation_preorder_print_job', { p_print_job_id: 'pj1' })
  })

  it('store_id của phiếu khác quán caller: từ chối, không dựng phiếu', async () => {
    cfg.rpc = ok(job({ store_id: 'store-khac' }))
    expect(await load({ preorderJobId: 'pj1' })).toEqual({ ok: false, error: 'Không tìm thấy phiếu in của quán này.' })
  })

  it('RPC không trả store_id: từ chối', async () => {
    cfg.rpc = ok(job({ store_id: undefined }))
    expect((await load({ preorderJobId: 'pj1' })).ok).toBe(false)
  })

  it('RPC lỗi: trả đúng câu lỗi', async () => {
    cfg.rpc = err('Chỉ chủ quán được xem phiếu in')
    expect(await load({ preorderJobId: 'pj1' })).toEqual({ ok: false, error: 'Chỉ chủ quán được xem phiếu in', transient: true })
  })
})
