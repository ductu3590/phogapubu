import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { SupplierDetail, SupplierDoc, SupplierSummary } from '@/lib/suppliers'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/actions/suppliers', () => ({
  paySupplier: vi.fn(), voidSupplierPayment: vi.fn(), saveSupplier: vi.fn(), setSupplierActive: vi.fn(),
  loadSupplierDetail: vi.fn(async () => ({ ok: false, error: 'x' })),
}))
vi.mock('@/lib/actions/debts', () => ({
  collectDebt: vi.fn(), voidDebtPayment: vi.fn(), saveDebtCustomer: vi.fn(), setDebtCustomerActive: vi.fn(),
  loadDebtCustomerDetail: vi.fn(async () => ({ ok: false, error: 'x' })),
}))

const { SupplierDrawerBody } = await import('./supplier-drawer')
const { SupplierPayForm } = await import('./supplier-pay-dialog')
const { default: SuppliersView } = await import('./suppliers-view')
const { default: DebtsTabs } = await import('./debts-tabs')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const D = '44444444-4444-4444-8444-444444444444'

const doc = (id: string, docNo: string, docDate: string, total: number, outstanding: number): SupplierDoc => ({
  id, docNo, docDate, createdAt: `${docDate}T02:00:00+00:00`, totalAmount: total, paidAmount: total - outstanding, outstanding,
})
const summary = (over: Partial<SupplierSummary> = {}): SupplierSummary => ({
  id: A, name: 'Đại lý bia Hà', phone: '0912345678', note: null, isActive: true, outstanding: 7_200_000, openDocs: 2,
  oldestOpenDate: '2026-11-02', ...over,
})
const detail = (): SupplierDetail => ({
  supplier: summary(),
  documents: [
    doc(B, 'PN-0003', '2026-11-02', 5_000_000, 3_000_000),
    doc(C, 'PN-0005', '2026-11-06', 4_200_000, 4_200_000),
    doc(D, 'PN-0001', '2026-10-20', 1_000_000, 0),
  ],
  payments: [{
    id: 'p1', amount: 2_000_000, method: 'bank', note: 'CK VCB', businessDate: '2026-11-10', createdAt: '2026-11-10T03:00:00Z',
    createdByName: 'Quản lý Mai', voidedAt: null, voidedByName: null, voidReason: null,
    allocations: [{ documentId: D, docNo: 'PN-0001', amount: 1_000_000 }, { documentId: B, docNo: 'PN-0003', amount: 1_000_000 }],
  }],
})
const noop = vi.fn()
const body = (selected: string[] = []) => renderToStaticMarkup(
  <SupplierDrawerBody detail={detail()} selected={selected} busy={false} onToggle={noop} onToggleAll={noop}
    onPaySelected={noop} onPay={noop} onVoid={noop} onEdit={noop} onToggleActive={noop} />)
const button = (html: string, label: string) => new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}(?:(?!</button>).)*</button>`).test(html)

describe('SupplierDrawerBody', () => {
  it('phiếu còn nợ có ô tích từng dòng + Chọn tất cả; số phiếu là link sang Kho', () => {
    const html = body()
    expect(html).toContain('Phiếu còn nợ (2)')
    expect(html.match(/type="checkbox"/g)?.length).toBe(3) // 2 phiếu + Chọn tất cả
    expect(html).toContain('Chọn tất cả')
    expect(html).toContain(`href="/admin/inventory?doc=${B}"`)
    for (const t of ['PN-0003', '02/11/2026', '5.000.000đ', '3.000.000đ', 'PN-0005', '4.200.000đ', '7.200.000đ']) expect(html).toContain(t)
    expect(html.indexOf('PN-0003')).toBeLessThan(html.indexOf('PN-0005'))
  })
  it('không tích → không có thanh trả nhanh; tích 2 phiếu → "Đã chọn 2 phiếu · 7.200.000đ" + nút', () => {
    expect(body()).not.toContain('Trả các phiếu đã chọn')
    const html = body([B, C])
    expect(html).toContain('Đã chọn 2 phiếu · 7.200.000đ')
    expect(button(html, 'Trả các phiếu đã chọn')).toBe(true)
  })
  it('"Đã trả hết (1)" chỉ gồm phiếu hết nợ; lịch sử trả hiện số phiếu + ghi chú + nút Huỷ', () => {
    const html = body()
    expect(html).toContain('Đã trả hết (1)')
    expect(html).toContain('PN-0001, PN-0003')
    expect(html).toContain('CK VCB')
    expect(html).toContain('Quản lý Mai')
    expect(html.match(/<button[^>]*><span[^>]*>Huỷ<\/span><\/button>/g)?.length).toBe(1)
  })
  it('nút Trả nợ, Sửa NCC, Ngừng theo dõi', () => {
    const html = body()
    for (const l of ['Trả nợ', 'Sửa NCC', 'Ngừng theo dõi']) expect(button(html, l)).toBe(true)
  })
})

describe('SupplierPayForm', () => {
  const form = (over: Partial<Parameters<typeof SupplierPayForm>[0]> = {}) => renderToStaticMarkup(
    <SupplierPayForm docs={detail().documents} amountText="4.000.000" onAmount={noop} method="bank" onMethod={noop} note=""
      onNote={noop} selected={[B, C]} onSelected={noop} error={null} busy={false} locked={false} onSubmit={noop} onCancel={noop}
      {...over} />)
  it('xem trước số tiền trả từng phiếu (cũ nhất trước), nút Xác nhận trả', () => {
    const html = form()
    expect(html).toContain('Dự kiến trả cho từng phiếu')
    expect(html).toMatch(/PN-0003(?:(?!PN-0005).)*3\.000\.000đ/)
    expect(html).toMatch(/PN-0005(?:(?!Ghi chú).)*1\.000\.000đ/)
    expect(button(html, 'Xác nhận trả')).toBe(true)
    expect(html).toContain('phiếu chi')
  })
  it('vượt số còn nợ → báo lỗi, nút Xác nhận trả tắt', () => {
    const html = form({ amountText: '9.000.000' })
    expect(html).toContain('Số tiền vượt số còn nợ (7.200.000đ)')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Xác nhận trả/)
  })
})

describe('SuppliersView + DebtsTabs', () => {
  it('thẻ Tổng phải trả, NCC đang nợ; nút + Thêm NCC; tìm + Chỉ NCC còn nợ', () => {
    const html = renderToStaticMarkup(<SuppliersView suppliers={[summary(), summary({ id: B, name: 'Chợ', outstanding: 0, openDocs: 0 })]} />)
    for (const t of ['Tổng phải trả', 'NCC đang nợ', '7.200.000đ', '1 NCC', '+ Thêm NCC', 'Chỉ NCC còn nợ', 'Đại lý bia Hà']) {
      expect(html).toContain(t)
    }
    // Mặc định chỉ NCC còn nợ.
    expect(html).not.toContain('>Chợ<')
  })
  it('chủ quán / quản lý thấy hai tab; thu ngân (không có tab NCC) không có tab', () => {
    const both = renderToStaticMarkup(<DebtsTabs initialTab="suppliers" customers={<p>KH</p>} suppliers={<p>NCCVIEW</p>} />)
    expect(both).toContain('Khách hàng')
    expect(both).toContain('Nhà cung cấp')
    expect(both).toContain('NCCVIEW')
    expect(both).not.toContain('<p>KH</p>')
    const cashier = renderToStaticMarkup(<DebtsTabs initialTab="suppliers" customers={<p>KH</p>} suppliers={null} />)
    expect(cashier).not.toContain('Nhà cung cấp')
    expect(cashier).toContain('<p>KH</p>')
  })
})

describe('Hộp trả nợ đóng → ngăn kéo tải lại (review #1)', () => {
  it('đóng hộp (kể cả sau lỗi "tải lại trang") luôn tải lại chi tiết NCC; trả xong thì bỏ tích + báo + tải lại', async () => {
    const { payDialogHandlers } = await import('./supplier-drawer')
    const setPaying = vi.fn(); const reload = vi.fn(); const clearSelected = vi.fn(); const setNotice = vi.fn()
    const h = payDialogHandlers({ setPaying, reload, clearSelected, setNotice })
    h.onClose()
    expect(setPaying).toHaveBeenLastCalledWith(undefined)
    expect(reload).toHaveBeenCalledTimes(1)
    h.onDone('Đã trả')
    expect(clearSelected).toHaveBeenCalled()
    expect(setNotice).toHaveBeenLastCalledWith('Đã trả')
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
