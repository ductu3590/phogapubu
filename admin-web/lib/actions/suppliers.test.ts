import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireBackOfficeStoreId: vi.fn(async () => 'store-1'),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/operator', () => ({ requireBackOfficeStoreId: mocks.requireBackOfficeStoreId }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const { paySupplier, voidSupplierPayment, saveSupplier, setSupplierActive, loadSupplierDetail } = await import('./suppliers')
const { loadSupplierList } = await import('./supplier-reads')

const S = '11111111-1111-4111-8111-111111111111'
const D = '22222222-2222-4222-8222-222222222222'
const R = '33333333-3333-4333-8333-333333333333'
const base = { supplierId: S, amount: 4_000_000, method: 'bank' as const, documentIds: [D], note: null, clientRequestId: R }

beforeEach(() => vi.clearAllMocks())

describe('paySupplier', () => {
  it('gửi đúng tham số, đọc kết quả', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false, supplier_payment_id: 'p1', cash_book_entry_id: 'e1',
      allocations: [{ document_id: D, doc_no: 'PN-0003', amount: 4000000 }], remaining: '3200000' }, error: null })
    expect(await paySupplier({ ...base, note: '  CK VCB ' })).toEqual({ ok: true, already: false, supplierPaymentId: 'p1',
      remaining: 3_200_000 })
    expect(mocks.rpc).toHaveBeenLastCalledWith('supplier_pay', { p_supplier_id: S, p_amount: 4_000_000, p_method: 'bank',
      p_document_ids: [D], p_note: 'CK VCB', p_client_request_id: R })
    expect(mocks.requireBackOfficeStoreId).toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/debts')
  })

  it('chặn đầu vào sai trước khi gọi RPC; lỗi RPC trả nguyên văn', async () => {
    for (const amount of [0, -1, 1.5, Number.NaN, 2_000_000_001]) {
      expect(await paySupplier({ ...base, amount })).toEqual({ ok: false, error: 'Số tiền không hợp lệ' })
    }
    expect(await paySupplier({ ...base, clientRequestId: 'x' })).toEqual({ ok: false, error: 'Mã trả nợ không hợp lệ' })
    expect(await paySupplier({ ...base, supplierId: 'x' })).toEqual({ ok: false, error: 'Mã nhà cung cấp không hợp lệ' })
    expect(await paySupplier({ ...base, documentIds: ['x'] })).toEqual({ ok: false, error: 'Danh sách phiếu không hợp lệ' })
    expect(await paySupplier({ ...base, documentIds: [] })).toEqual({ ok: false, error: 'Chọn ít nhất một phiếu' })
    expect(await paySupplier({ ...base, method: 'momo' as never })).toEqual({ ok: false, error: 'Phương thức không hợp lệ' })
    expect(await paySupplier({ ...base, note: 'x'.repeat(501) })).toEqual({ ok: false, error: 'Ghi chú quá dài' })
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Chưa mở ca' } })
    expect(await paySupplier(base)).toEqual({ ok: false, error: 'Chưa mở ca' })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect(await paySupplier(base)).toEqual({ ok: false, error: 'Không nhận được kết quả trả nợ, tải lại trang để kiểm tra' })
  })

  it('không phải chủ quán / quản lý → trả lỗi, không ném', async () => {
    mocks.requireBackOfficeStoreId.mockRejectedValueOnce(new Error('Chỉ chủ quán hoặc quản lý mới thao tác được ở đây'))
    expect(await paySupplier(base)).toEqual({ ok: false, error: 'Chỉ chủ quán hoặc quản lý mới thao tác được ở đây' })
  })
})

describe('các action khác', () => {
  it('voidSupplierPayment cần lý do', async () => {
    expect(await voidSupplierPayment({ paymentId: S, reason: '  ' })).toEqual({ ok: false, error: 'Nhập lý do huỷ' })
    mocks.rpc.mockResolvedValue({ data: { ok: true, already: false }, error: null })
    expect(await voidSupplierPayment({ paymentId: S, reason: ' trả nhầm ' })).toEqual({ ok: true, already: false })
    expect(mocks.rpc).toHaveBeenLastCalledWith('supplier_payment_void', { p_id: S, p_reason: 'trả nhầm' })
  })

  it('saveSupplier: quán lấy từ operator, SĐT chuẩn hoá, tên bắt buộc', async () => {
    expect(await saveSupplier({ supplierId: null, name: ' ', phone: null, note: null })).toEqual({ ok: false, error: 'Nhập tên nhà cung cấp' })
    expect(await saveSupplier({ supplierId: null, name: 'A', phone: '12', note: null })).toEqual({ ok: false, error: 'SĐT không hợp lệ' })
    mocks.rpc.mockResolvedValue({ data: { supplier_id: S }, error: null })
    expect(await saveSupplier({ supplierId: null, name: ' Đại lý Hà ', phone: '+84 912 345 678', note: '' }))
      .toEqual({ ok: true, supplierId: S })
    expect(mocks.rpc).toHaveBeenLastCalledWith('supplier_upsert', { p_store_id: 'store-1', p_supplier_id: null,
      p_name: 'Đại lý Hà', p_phone: '0912345678', p_note: null })
  })

  it('setSupplierActive + loadSupplierDetail + loadSupplierList', async () => {
    mocks.rpc.mockResolvedValue({ data: { is_active: false }, error: null })
    expect(await setSupplierActive(S, false)).toEqual({ ok: true, isActive: false })
    mocks.rpc.mockResolvedValue({ data: { supplier: { id: S, name: 'A', is_active: true }, documents: [], payments: [] }, error: null })
    const d = await loadSupplierDetail(S)
    expect(d.ok && d.detail.supplier.name).toBe('A')
    expect(await loadSupplierDetail('x')).toEqual({ ok: false, error: 'Mã nhà cung cấp không hợp lệ' })
    mocks.rpc.mockResolvedValue({ data: [{ id: S, name: 'A', is_active: true, outstanding: 5 }], error: null })
    const l = await loadSupplierList('store-1')
    expect(l.ok && l.suppliers[0].outstanding).toBe(5)
    expect(mocks.rpc).toHaveBeenLastCalledWith('supplier_list', { p_store_id: 'store-1' })
  })
})
