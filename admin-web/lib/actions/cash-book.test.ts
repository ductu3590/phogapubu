import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
  requireBackOfficeStoreId: vi.fn(async () => 'store-1'),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
  requireBackOfficeStoreId: mocks.requireBackOfficeStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { createCashBookEntry, voidCashBookEntry, saveCashBookCategory, setCashBookCategoryActive } = await import('./cash-book')

const REQ = '11111111-2222-3333-4444-555555555555'
const input = {
  kind: 'payment' as const, method: 'cash' as const, categoryId: 'cat-1', amount: 10000, note: 'đá', counterparty: null,
  source: 'pos_drawer' as const, clientRequestId: REQ,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createCashBookEntry', () => {
  it('thiếu clientRequestId: không gọi RPC', async () => {
    for (const clientRequestId of ['', '   ']) {
      await expect(createCashBookEntry({ ...input, clientRequestId })).resolves.toEqual({
        ok: false, error: 'Thiếu mã chống ghi trùng',
      })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('số tiền 0, âm, NaN, lẻ, quá 2 tỉ: không gọi RPC', async () => {
    for (const amount of [0, -1, Number.NaN, 1.5, 2000000001]) {
      await expect(createCashBookEntry({ ...input, amount })).resolves.toEqual({
        ok: false, error: 'Số tiền phải từ 1đ đến 2.000.000.000đ',
      })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('thiếu danh mục: không gọi RPC', async () => {
    await expect(createCashBookEntry({ ...input, categoryId: '' })).resolves.toEqual({ ok: false, error: 'Chọn danh mục' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('lỗi quyền: {ok:false}, không ném', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    await expect(createCashBookEntry(input)).resolves.toEqual({
      ok: false, error: 'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('RPC lỗi: trả nguyên message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Chưa mở ca' } })
    await expect(createCashBookEntry(input)).resolves.toEqual({ ok: false, error: 'Chưa mở ca' })
  })
  it('thành công: gọi cash_book_create đúng tham số, trả id + already', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, already: true, id: 'e1', cash_shift_id: 'sh-1', business_date: '2026-11-09' }, error: null,
    })
    await expect(createCashBookEntry(input)).resolves.toEqual({ ok: true, id: 'e1', already: true })
    expect(mocks.rpc).toHaveBeenCalledWith('cash_book_create', {
      p_kind: 'payment', p_method: 'cash', p_category_id: 'cat-1', p_amount: 10000, p_note: 'đá', p_counterparty: null,
      p_client_request_id: REQ, p_source: 'pos_drawer',
    })
  })
})

describe('voidCashBookEntry', () => {
  it('lý do rỗng: không gọi RPC', async () => {
    await expect(voidCashBookEntry({ id: 'e1', reason: '   ' })).resolves.toEqual({ ok: false, error: 'Cần ghi lý do huỷ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('thu ngân (không phải hậu cần): {ok:false}, không gọi RPC', async () => {
    mocks.requireBackOfficeStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'))
    await expect(voidCashBookEntry({ id: 'e1', reason: 'nhầm' })).resolves.toEqual({
      ok: false, error: 'Chỉ chủ quán hoặc quản lý mới thao tác được ở đây',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('thành công', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, already: false }, error: null })
    await expect(voidCashBookEntry({ id: 'e1', reason: 'nhầm' })).resolves.toEqual({ ok: true, already: false })
    expect(mocks.rpc).toHaveBeenCalledWith('cash_book_void', { p_id: 'e1', p_reason: 'nhầm' })
  })
  it('RPC lỗi: trả nguyên message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Ca của phiếu này đã kết, không huỷ được' } })
    await expect(voidCashBookEntry({ id: 'e1', reason: 'nhầm' })).resolves.toEqual({
      ok: false, error: 'Ca của phiếu này đã kết, không huỷ được',
    })
  })
})

describe('danh mục', () => {
  it('saveCashBookCategory: tên rỗng không gọi RPC; thành công trả id', async () => {
    await expect(saveCashBookCategory({ id: null, kind: 'payment', name: '  ', reportGroup: null })).resolves.toEqual({
      ok: false, error: 'Tên danh mục từ 1 đến 60 ký tự',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, id: 'c9' }, error: null })
    await expect(saveCashBookCategory({ id: null, kind: 'payment', name: 'Thuê loa', reportGroup: 'operating_expense' }))
      .resolves.toEqual({ ok: true, id: 'c9' })
    expect(mocks.rpc).toHaveBeenCalledWith('cash_book_save_category', {
      p_store_id: 'store-1', p_id: null, p_kind: 'payment', p_name: 'Thuê loa', p_report_group: 'operating_expense',
    })
  })
  it('saveCashBookCategory: thu ngân bị chặn, RPC lỗi trả message', async () => {
    mocks.requireBackOfficeStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'))
    await expect(saveCashBookCategory({ id: 'c1', kind: 'payment', name: 'X', reportGroup: null })).resolves.toEqual({
      ok: false, error: 'Chỉ chủ quán hoặc quản lý mới thao tác được ở đây',
    })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Danh mục đã có' } })
    await expect(saveCashBookCategory({ id: null, kind: 'payment', name: 'Đá', reportGroup: null })).resolves.toEqual({
      ok: false, error: 'Danh mục đã có',
    })
  })
  it('setCashBookCategoryActive', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await expect(setCashBookCategoryActive({ id: 'c1', active: false })).resolves.toEqual({ ok: true })
    expect(mocks.rpc).toHaveBeenCalledWith('cash_book_set_category_active', { p_id: 'c1', p_active: false })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Danh mục hệ thống không sửa được' } })
    await expect(setCashBookCategoryActive({ id: 'c1', active: false })).resolves.toEqual({
      ok: false, error: 'Danh mục hệ thống không sửa được',
    })
  })
})
