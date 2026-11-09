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

const { collectDebt, voidDebtPayment, saveDebtCustomer, setDebtCustomerActive, loadDebtCustomerDetail } = await import('./debts')
const { loadDebtList, loadDebtShiftSummary } = await import('./debt-reads')

const C = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const R = '33333333-3333-4333-8333-333333333333'
const base = { customerId: C, amount: 350_000, method: 'cash' as const, billPaymentIds: null, note: null, clientRequestId: R }
const CASHIER_DENIED = 'Chỉ chủ quán hoặc thu ngân mới thao tác được ở đây'
const BACK_OFFICE_DENIED = 'Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('collectDebt', () => {
  it('collectDebt gửi đúng tham số, đọc kết quả', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, debt_payment_id: 'dp1',
      allocations: [{ bill_payment_id: B, amount: '200000' }], remaining_debt: '300000' }, error: null })
    expect(await collectDebt(base)).toEqual({ ok: true, already: false, debtPaymentId: 'dp1',
      allocations: [{ billPaymentId: B, amount: 200_000 }], remaining: 300_000 })
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_collect', { p_customer_id: C, p_amount: 350_000, p_method: 'cash',
      p_allocations: null, p_note: null, p_client_request_id: R })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/debts')

    await collectDebt({ ...base, method: 'bank', billPaymentIds: [B], note: '  trả tháng 11  ' })
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_collect', { p_customer_id: C, p_amount: 350_000, p_method: 'bank',
      p_allocations: [B], p_note: 'trả tháng 11', p_client_request_id: R })
    expect(mocks.requirePosOperatorStoreId).toHaveBeenCalled()
  })

  it('collectDebt chặn số tiền ≤ 0, mã sai, phục vụ; lỗi RPC trả nguyên văn', async () => {
    for (const amount of [0, -1, 1.5, Number.NaN, 2_000_000_001]) {
      expect(await collectDebt({ ...base, amount })).toEqual({ ok: false, error: 'Số tiền không hợp lệ' })
    }
    expect(await collectDebt({ ...base, clientRequestId: 'x' })).toEqual({ ok: false, error: 'Mã thu nợ không hợp lệ' })
    expect(await collectDebt({ ...base, customerId: 'x' })).toEqual({ ok: false, error: 'Mã khách không hợp lệ' })
    expect(await collectDebt({ ...base, billPaymentIds: ['x'] })).toEqual({ ok: false, error: 'Danh sách bill không hợp lệ' })
    expect(await collectDebt({ ...base, billPaymentIds: [] })).toEqual({ ok: false, error: 'Chọn ít nhất một bill' })
    expect(await collectDebt({ ...base, method: 'wallet' as never })).toEqual({ ok: false, error: 'Phương thức không hợp lệ' })
    expect(await collectDebt({ ...base, note: 'x'.repeat(501) })).toEqual({ ok: false, error: 'Ghi chú quá dài' })
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error(CASHIER_DENIED))
    expect(await collectDebt(base)).toEqual({ ok: false, error: CASHIER_DENIED })
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Số tiền trả vượt số nợ: còn nợ 150.000đ' } })
    expect(await collectDebt(base)).toEqual({ ok: false, error: 'Số tiền trả vượt số nợ: còn nợ 150.000đ' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect(await collectDebt(base)).toEqual({ ok: false, error: 'Không nhận được kết quả thu nợ, tải lại trang để kiểm tra' })
  })

  it('already: trả phân bổ đã lưu', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: true, debt_payment_id: 'dp1', allocations: [], remaining_debt: 0 }, error: null })
    expect(await collectDebt(base)).toEqual({ ok: true, already: true, debtPaymentId: 'dp1', allocations: [], remaining: 0 })
  })
})

describe('voidDebtPayment', () => {
  it('voidDebtPayment: lý do rỗng không gọi RPC', async () => {
    expect(await voidDebtPayment({ paymentId: C, reason: '   ' })).toEqual({ ok: false, error: 'Nhập lý do huỷ' })
    expect(await voidDebtPayment({ paymentId: C, reason: 'x'.repeat(301) })).toEqual({ ok: false, error: 'Lý do quá dài' })
    expect(await voidDebtPayment({ paymentId: 'x', reason: 'nhầm' })).toEqual({ ok: false, error: 'Mã lần thu nợ không hợp lệ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('back office; gửi lý do đã trim; thu ngân bị chặn trước RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: true }, error: null })
    expect(await voidDebtPayment({ paymentId: C, reason: ' nhầm khách ' })).toEqual({ ok: true, already: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_payment_void', { p_id: C, p_reason: 'nhầm khách' })
    expect(mocks.requireBackOfficeStoreId).toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/debts')
    mocks.rpc.mockClear()
    mocks.requireBackOfficeStoreId.mockRejectedValueOnce(new Error(BACK_OFFICE_DENIED))
    expect(await voidDebtPayment({ paymentId: C, reason: 'nhầm' })).toEqual({ ok: false, error: BACK_OFFICE_DENIED })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('saveDebtCustomer', () => {
  const input = { customerId: null, name: '  Cty Hoà Bình ', phone: '+84 912 345 678', kind: 'company' as const, note: '  ' }
  it('saveDebtCustomer: SĐT sai không gọi RPC; thu ngân bị chặn trước RPC', async () => {
    expect(await saveDebtCustomer({ ...input, phone: '12ab' })).toEqual({ ok: false, error: 'SĐT không hợp lệ' })
    expect(await saveDebtCustomer({ ...input, name: '  ' })).toEqual({ ok: false, error: 'Nhập tên khách' })
    expect(await saveDebtCustomer({ ...input, kind: 'vip' as never })).toEqual({ ok: false, error: 'Loại khách không hợp lệ' })
    expect(await saveDebtCustomer({ ...input, note: 'x'.repeat(501) })).toEqual({ ok: false, error: 'Ghi chú quá dài' })
    expect(await saveDebtCustomer({ ...input, customerId: 'x' })).toEqual({ ok: false, error: 'Mã khách không hợp lệ' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.requireBackOfficeStoreId.mockRejectedValueOnce(new Error(BACK_OFFICE_DENIED))
    expect(await saveDebtCustomer(input)).toEqual({ ok: false, error: BACK_OFFICE_DENIED })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('storeId lấy từ operator; tên / SĐT / ghi chú chuẩn hoá', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, customer_id: C }, error: null })
    expect(await saveDebtCustomer(input)).toEqual({ ok: true, customerId: C })
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_customer_upsert', { p_store_id: 'store-1', p_customer_id: null,
      p_name: 'Cty Hoà Bình', p_phone: '0912345678', p_kind: 'company', p_note: null })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/debts')
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SĐT 0912345678 đã có khách Anh A, chọn khách đó' } })
    expect(await saveDebtCustomer({ ...input, customerId: C })).toEqual({ ok: false, error: 'SĐT 0912345678 đã có khách Anh A, chọn khách đó' })
  })
})

describe('setDebtCustomerActive + đọc', () => {
  it('setDebtCustomerActive: back office, đọc is_active', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, is_active: false }, error: null })
    expect(await setDebtCustomerActive(C, false)).toEqual({ ok: true, isActive: false })
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_customer_set_active', { p_customer_id: C, p_active: false })
    expect(mocks.requireBackOfficeStoreId).toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Khách còn nợ 90.000đ, không ngừng được' } })
    expect(await setDebtCustomerActive(C, false)).toEqual({ ok: false, error: 'Khách còn nợ 90.000đ, không ngừng được' })
    expect(await setDebtCustomerActive('x', true)).toEqual({ ok: false, error: 'Mã khách không hợp lệ' })
  })
  it('loadDebtCustomerDetail: POS, đọc chi tiết; rác → lỗi', async () => {
    mocks.rpc.mockResolvedValue({ data: { customer: { id: C, name: 'A' }, bills: [], payments: [] }, error: null })
    const r = await loadDebtCustomerDetail(C)
    expect(r.ok && r.detail.customer.id).toBe(C)
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_customer_detail', { p_customer_id: C })
    expect(mocks.requirePosOperatorStoreId).toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
    expect(await loadDebtCustomerDetail(C)).toEqual({ ok: false, error: 'Không đọc được khách nợ' })
    mocks.requirePosOperatorStoreId.mockRejectedValueOnce(new Error(CASHIER_DENIED))
    expect(await loadDebtCustomerDetail(C)).toEqual({ ok: false, error: CASHIER_DENIED })
  })
  it('loadDebtList / loadDebtShiftSummary', async () => {
    mocks.rpc.mockResolvedValue({ data: { customers: [{ id: C, name: 'A', outstanding: 5 }] }, error: null })
    const r = await loadDebtList('store-1', true)
    expect(r.ok && r.customers.map((c) => c.outstanding)).toEqual([5])
    expect(mocks.rpc).toHaveBeenLastCalledWith('debt_list', { p_store_id: 'store-1', p_only_open: true })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Chỉ chủ quán, quản lý hoặc thu ngân được xem / thu nợ' } })
    expect(await loadDebtList('store-1', false)).toEqual({ ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được xem / thu nợ' })
    mocks.rpc.mockResolvedValue({ data: { debt_recorded: 1, debt_cash: 2, debt_bank: 3 }, error: null })
    expect(await loadDebtShiftSummary('shift-1')).toEqual({ debtRecorded: 1, debtCash: 2, debtBank: 3 })
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_debt_shift_summary', { p_shift_id: 'shift-1' })
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Không có quyền xem ca này' } })
    expect(await loadDebtShiftSummary('shift-1')).toBeNull()
  })
})
