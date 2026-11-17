import { describe, expect, it } from 'vitest'
import {
  allocateSupplierPayment, filterSuppliers, parseSupplierDetail, parseSupplierList, selectedOutstanding,
  supplierDocHref, type SupplierDoc, type SupplierSummary,
} from './suppliers'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const doc = (id: string, outstanding: number, docDate = '2026-11-02', createdAt = '2026-11-02T02:00:00+00:00'): SupplierDoc => ({
  id, docNo: `PN-${id.slice(0, 4)}`, docDate, createdAt, totalAmount: outstanding + 1000, paidAmount: 1000, outstanding,
})
const sup = (over: Partial<SupplierSummary>): SupplierSummary => ({
  id: A, name: 'Đại lý bia Hà', phone: '0912345678', note: null, isActive: true, outstanding: 0, openDocs: 0,
  oldestOpenDate: null, ...over,
})

describe('parseSupplierList', () => {
  it('đổi tên trường, bỏ dòng hỏng', () => {
    expect(parseSupplierList([
      { id: A, name: 'Đại lý bia Hà', phone: '0912345678', note: null, is_active: true, outstanding: 7200000, open_docs: 2,
        oldest_open_date: '2026-11-02' },
      { id: null, name: 'x' },
      'rác',
    ])).toEqual([sup({ outstanding: 7200000, openDocs: 2, oldestOpenDate: '2026-11-02' })])
    expect(parseSupplierList(null)).toEqual([])
  })
})

describe('parseSupplierDetail', () => {
  it('đọc NCC + phiếu + lịch sử trả có phân bổ', () => {
    const d = parseSupplierDetail({
      supplier: { id: A, name: 'Đại lý bia Hà', phone: null, note: 'giao thứ 2', is_active: false, outstanding: 4200000,
        open_docs: 1, oldest_open_date: '2026-11-06' },
      documents: [{ id: B, doc_no: 'PN-0003', doc_date: '2026-11-02', created_at: 't1', total_amount: 5000000,
        paid_amount: 5000000, outstanding: 0 }],
      payments: [{ id: C, amount: 3000000, method: 'bank', note: null, business_date: '2026-11-17', created_at: 't2',
        created_by_name: 'Quản lý', voided_at: null, voided_by_name: null, void_reason: null,
        allocations: [{ document_id: B, doc_no: 'PN-0003', amount: 3000000 }] }],
    })
    expect(d?.supplier.isActive).toBe(false)
    expect(d?.documents).toEqual([{ id: B, docNo: 'PN-0003', docDate: '2026-11-02', createdAt: 't1', totalAmount: 5000000,
      paidAmount: 5000000, outstanding: 0 }])
    expect(d?.payments[0]).toEqual({ id: C, amount: 3000000, method: 'bank', note: null, businessDate: '2026-11-17',
      createdAt: 't2', createdByName: 'Quản lý', voidedAt: null, voidedByName: null, voidReason: null,
      allocations: [{ documentId: B, docNo: 'PN-0003', amount: 3000000 }] })
    expect(parseSupplierDetail({ documents: [] })).toBeNull()
  })
})

describe('allocateSupplierPayment', () => {
  const docs = [doc(B, 4200000, '2026-11-06'), doc(A, 3000000, '2026-11-02'), doc(C, 0)]
  it('cũ nhất trước trong các phiếu chọn: 3tr + 4,2tr, trả 4tr → 3tr rồi 1tr', () => {
    expect(allocateSupplierPayment(docs, 4000000, [B, A])).toEqual({
      allocations: [{ documentId: A, amount: 3000000 }, { documentId: B, amount: 1000000 }], error: null })
  })
  it('null = mọi phiếu còn nợ; vượt tổng → lỗi; 0đ → lỗi; mảng rỗng → lỗi; phiếu hết nợ → lỗi tải lại', () => {
    expect(allocateSupplierPayment(docs, 7200000, null).allocations.length).toBe(2)
    expect(allocateSupplierPayment(docs, 7200001, null).error).toBe('Số tiền vượt số còn nợ (7.200.000đ)')
    expect(allocateSupplierPayment(docs, 0, null).error).toBe('Nhập số tiền trả')
    expect(allocateSupplierPayment(docs, 1000, []).error).toBe('Chọn ít nhất một phiếu')
    expect(allocateSupplierPayment(docs, 1000, [C]).error).toBe('Danh sách phiếu đã thay đổi, tải lại trang')
  })
  it('cùng ngày phiếu: theo giờ tạo', () => {
    const same = [doc(B, 100, '2026-11-02', '2026-11-02T05:00:00+00:00'), doc(A, 100, '2026-11-02', '2026-11-02T03:00:00+00:00')]
    expect(allocateSupplierPayment(same, 150, null).allocations).toEqual([
      { documentId: A, amount: 100 }, { documentId: B, amount: 50 }])
  })
})

describe('selectedOutstanding / filterSuppliers / supplierDocHref', () => {
  it('cộng số còn nợ các phiếu được chọn', () => {
    expect(selectedOutstanding([doc(A, 3000000), doc(B, 4200000), doc(C, 1)], [A, B])).toBe(7200000)
  })
  it('lọc còn nợ + tìm không dấu theo tên hoặc SĐT', () => {
    const list = [sup({ id: A, outstanding: 5 }), sup({ id: B, name: 'Chợ Cốc Lếu', phone: null, outstanding: 0 })]
    expect(filterSuppliers(list, '', { onlyOpen: true }).map((s) => s.id)).toEqual([A])
    expect(filterSuppliers(list, 'coc leu', { onlyOpen: false }).map((s) => s.id)).toEqual([B])
    expect(filterSuppliers(list, '+84 912', { onlyOpen: false }).map((s) => s.id)).toEqual([A])
  })
  it('link mở phiếu ở trang Kho', () => {
    expect(supplierDocHref(A)).toBe(`/admin/inventory?doc=${A}`)
  })
})
