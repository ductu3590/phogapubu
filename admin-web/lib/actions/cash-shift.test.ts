import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requirePosOperatorStoreId: vi.fn(async () => 'store-1'),
  requireStoreOwnerStoreId: vi.fn(async () => 'store-1'),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({
  requirePosOperatorStoreId: mocks.requirePosOperatorStoreId,
  requireStoreOwnerStoreId: mocks.requireStoreOwnerStoreId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { openCashShift, closeCashShift, continueStaleShift, saveRequireCashShift } = await import('./cash-shift')

const closeRaw = {
  ok: true, already: false, shift_id: 'sh-1', opening_cash: 500000, cash_sales: 300000, cash_receipts: 100000,
  cash_payments: 50000, debt_cash: 0, expected_cash: 850000, counted_cash: 840000, difference: -10000,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openCashShift', () => {
  it('số âm, NaN, lẻ, quá 2 tỉ: không gọi RPC', async () => {
    for (const openingCash of [-1, Number.NaN, 1.5, 2000000001, Number.POSITIVE_INFINITY]) {
      await expect(openCashShift({ openingCash, note: null })).resolves.toEqual({ ok: false, error: 'Số tiền không hợp lệ' })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('lỗi quyền: {ok:false}, không ném, không gọi RPC', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'))
    await expect(openCashShift({ openingCash: 0, note: null })).resolves.toEqual({
      ok: false, error: 'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('RPC lỗi: trả nguyên message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Đã có ca đang mở' } })
    await expect(openCashShift({ openingCash: 0, note: null })).resolves.toEqual({ ok: false, error: 'Đã có ca đang mở' })
  })
  it('thành công: gọi open_cash_shift với quán của operator', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, shift_id: 'sh-1' }, error: null })
    await expect(openCashShift({ openingCash: 500000, note: 'đầu ca' })).resolves.toEqual({ ok: true, shiftId: 'sh-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('open_cash_shift', { p_store_id: 'store-1', p_opening_cash: 500000, p_note: 'đầu ca' })
  })
})

describe('closeCashShift', () => {
  it('số đếm âm hoặc NaN, thiếu ca: không gọi RPC', async () => {
    for (const countedCash of [-5, Number.NaN]) {
      await expect(closeCashShift({ shiftId: 'sh-1', countedCash, note: null })).resolves.toEqual({
        ok: false, error: 'Số tiền không hợp lệ',
      })
    }
    await expect(closeCashShift({ shiftId: '', countedCash: 0, note: null })).resolves.toEqual({
      ok: false, error: 'Không tìm thấy ca',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('thành công: kèm result camelCase', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: closeRaw, error: null })
    const r = await closeCashShift({ shiftId: 'sh-1', countedCash: 840000, note: null })
    expect(r).toEqual({
      ok: true,
      result: {
        shiftId: 'sh-1', already: false, openingCash: 500000, cashSales: 300000, cashReceipts: 100000, cashPayments: 50000,
        debtCash: 0, expectedCash: 850000, countedCash: 840000, difference: -10000,
      },
    })
    expect(mocks.rpc).toHaveBeenCalledWith('close_cash_shift', { p_shift_id: 'sh-1', p_counted_cash: 840000, p_note: null })
  })
  it('RPC lỗi: trả nguyên message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Ca đã đóng' } })
    await expect(closeCashShift({ shiftId: 'sh-1', countedCash: 1, note: null })).resolves.toEqual({ ok: false, error: 'Ca đã đóng' })
  })
  it('lỗi quyền: {ok:false}', async () => {
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error('Không có quyền'))
    await expect(closeCashShift({ shiftId: 'sh-1', countedCash: 1, note: null })).resolves.toEqual({ ok: false, error: 'Không có quyền' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('continueStaleShift', () => {
  it('thành công trả already', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, already: true }, error: null })
    await expect(continueStaleShift('sh-1')).resolves.toEqual({ ok: true, already: true })
    expect(mocks.rpc).toHaveBeenCalledWith('continue_stale_shift', { p_shift_id: 'sh-1' })
  })
  it('RPC lỗi: trả nguyên message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Ca đã đóng' } })
    await expect(continueStaleShift('sh-1')).resolves.toEqual({ ok: false, error: 'Ca đã đóng' })
  })
})

describe('saveRequireCashShift', () => {
  it('không phải chủ quán: {ok:false}, không gọi RPC', async () => {
    mocks.requireStoreOwnerStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán mới thao tác được ở đây'))
    await expect(saveRequireCashShift(true)).resolves.toEqual({ ok: false, error: 'Chỉ chủ quán mới thao tác được ở đây' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
  it('RPC lỗi: trả nguyên message, không revalidate', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Còn ca đang mở, kết ca trước khi tắt' } })
    await expect(saveRequireCashShift(false)).resolves.toEqual({ ok: false, error: 'Còn ca đang mở, kết ca trước khi tắt' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
  it('thành công: gọi set_require_cash_shift, revalidate /admin layout', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, require_cash_shift: true }, error: null })
    await expect(saveRequireCashShift(true)).resolves.toEqual({ ok: true, requireCashShift: true })
    expect(mocks.rpc).toHaveBeenCalledWith('set_require_cash_shift', { p_store_id: 'store-1', p_enabled: true })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin', 'layout')
  })
})
