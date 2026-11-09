import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DocSummary, DraftLine, StockRow } from '@/lib/inventory'

vi.mock('@/lib/actions/inventory', () => ({
  loadInventoryDocuments: vi.fn(async () => ({ ok: true, documents: [], suppliers: [] })),
  loadInventoryDocument: vi.fn(),
  postInventoryDocument: vi.fn(),
  voidInventoryDocument: vi.fn(),
  loadInventoryStock: vi.fn(),
}))

const { ToastProvider } = await import('@/components/ui/toast')
const { DocumentList } = await import('./documents-tab')
const { default: LinesEditor } = await import('./lines-editor')
const { default: ReceiptForm } = await import('./receipt-form')
const { default: WriteoffForm } = await import('./writeoff-form')
const { addDaysIso } = await import('./document-form')

const html = (el: ReactElement) => renderToStaticMarkup(<ToastProvider>{el}</ToastProvider>)

const items: StockRow[] = [
  { id: 'thit', name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient', sku: null, minStock: null, isActive: true, qty: 0,
    lastUnitCost: 120000, stockValue: 0 },
  { id: 'bia', name: 'Bia Hà Nội lon', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: true, qty: 0,
    lastUnitCost: 10000, stockValue: 0 },
  { id: 'cu', name: 'Bia cũ', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: false, qty: 0,
    lastUnitCost: null, stockValue: 0 },
]
const lines: DraftLine[] = [
  { inventoryItemId: 'thit', qty: '2,5', unitCost: '126.000', countedQty: '' },
  { inventoryItemId: 'bia', qty: '24', unitCost: '10.500', countedQty: '' },
]

const doc = (over: Partial<DocSummary>): DocSummary => ({
  id: 'd1', kind: 'receipt', docNo: 'PN-0001', docDate: '2026-11-09', effectiveAt: '2026-11-09T03:00:00Z',
  supplierName: 'Đại lý Hà Nội', note: null, totalAmount: 567000, paidStatus: 'paid', paidMethod: 'cash',
  status: 'posted', lineCount: 2, createdAt: '2026-11-09T03:00:00Z', createdByName: 'Chị Lan', voidedAt: null,
  voidReason: null, cashBookEntryId: null, ...over,
})

/** Thuộc tính disabled thật (không phải lớp Tailwind `disabled:…`). */
const DISABLED = /\sdisabled(?:="")?[\s>]/

/** Thẻ <button> chứa chữ `label` (để kiểm disabled). */
const buttonWith = (markup: string, label: string) => {
  const end = markup.lastIndexOf(`>${label}<`)
  expect(end, `không thấy nút "${label}"`).toBeGreaterThan(-1)
  const start = markup.lastIndexOf('<button', end)
  return markup.slice(start, markup.indexOf('>', start) + 1)
}

describe('Kho — phiếu nhập / xuất huỷ', () => {
  it('danh sách: phiếu huỷ gạch ngang + nhãn "Đã huỷ"; phiếu nhập hiện tổng tiền và "Đã trả · Tiền mặt" / "Chưa trả"', () => {
    const markup = html(<DocumentList kind="receipt" documents={[
      doc({}),
      doc({ id: 'd2', docNo: 'PN-0002', paidStatus: 'unpaid', paidMethod: null, totalAmount: 120000 }),
      doc({ id: 'd3', docNo: 'PN-0003', paidMethod: 'bank', status: 'voided', voidReason: 'Nhập nhầm' }),
    ]} onOpen={vi.fn()} />)
    expect(markup).toContain('567.000đ')
    expect(markup).toContain('Đã trả · Tiền mặt')
    expect(markup).toContain('Chưa trả')
    expect(markup).toContain('Đã trả · Chuyển khoản')
    expect(markup).toContain('Đã huỷ')
    // Số phiếu đã huỷ bị gạch ngang (ở cả thẻ mobile lẫn bảng).
    expect(markup).toMatch(/line-through[^>]*>PN-0003</)
    expect(markup).not.toMatch(/line-through[^>]*>PN-0001</)
    expect(markup).toContain('Chị Lan')
    expect(markup).toContain('09/11/2026')
  })

  it('danh sách phiếu huỷ: hiện lý do thay nhà cung cấp, không có cột tiền', () => {
    const markup = html(<DocumentList kind="writeoff" documents={[
      doc({ kind: 'writeoff', docNo: 'PX-0001', supplierName: null, note: 'Vỡ 2 két', totalAmount: 0, paidStatus: null, paidMethod: null }),
    ]} onOpen={vi.fn()} />)
    expect(markup).toContain('Vỡ 2 két')
    expect(markup).not.toContain('Chưa trả')
    expect(markup).not.toContain('Tổng tiền')
  })

  it('LinesEditor receipt: thành tiền dòng 2,5 × 126.000 hiện "315.000đ"; tổng 567.000đ', () => {
    const markup = html(<LinesEditor kind="receipt" items={items} drafts={lines} onChange={vi.fn()} />)
    expect(markup).toContain('315.000đ')
    expect(markup).toContain('252.000đ')
    expect(markup).toContain('567.000đ')
    // Chỉ hàng đang dùng được chọn; nhóm theo loại.
    expect(markup).not.toContain('Bia cũ')
    expect(markup).toContain('label="Bán nguyên"')
    expect(markup).toContain('label="Nguyên liệu"')
  })

  it('LinesEditor: ô số lượng nào cũng có chữ cảnh báo qtyWarning ngay dưới', () => {
    const markup = html(<LinesEditor kind="writeoff" items={items} onChange={vi.fn()} drafts={[
      { inventoryItemId: 'bia', qty: '1.500', unitCost: '', countedQty: '' },
      { inventoryItemId: 'thit', qty: '1500', unitCost: '', countedQty: '' },
    ]} />)
    expect(markup).toContain('Đang hiểu là 1,5')
    expect(markup).toContain('Số lượng lớn: 1.500')
    expect(markup).not.toContain('Đơn giá') // phiếu huỷ không có giá
  })

  it('ReceiptForm: chọn Đã trả mà chưa chọn TM/CK → nút Lưu tắt, chữ "Chọn phương thức trả tiền"', () => {
    const markup = html(<ReceiptForm today="2026-11-09" items={items} suppliers={['Đại lý Hà Nội']} onClose={vi.fn()}
      onSaved={vi.fn()} initial={{ paidStatus: 'paid', paidMethod: null, drafts: lines }} />)
    expect(markup).toContain('Chọn phương thức trả tiền')
    expect(buttonWith(markup, 'Lưu')).toMatch(DISABLED)
    // Gợi ý nhà cung cấp cũ.
    expect(markup).toContain('<option value="Đại lý Hà Nội">')
    // Mig 118 chưa có sổ thu chi: không hứa phiếu chi đã tạo.
    expect(markup).not.toContain('đã tạo phiếu chi')

    const ok = html(<ReceiptForm today="2026-11-09" items={items} suppliers={[]} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ paidStatus: 'paid', paidMethod: 'cash', drafts: lines }} />)
    expect(buttonWith(ok, 'Lưu')).not.toMatch(DISABLED)
    expect(ok).not.toContain('Chọn phương thức trả tiền')
  })

  it('WriteoffForm: chưa có lý do → nút Lưu tắt', () => {
    const drafts = [{ inventoryItemId: 'bia', qty: '2', unitCost: '', countedQty: '' }]
    const markup = html(<WriteoffForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ note: '   ', drafts }} />)
    expect(buttonWith(markup, 'Lưu')).toMatch(DISABLED)
    const ok = html(<WriteoffForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ note: 'Vỡ 2 lon', drafts }} />)
    expect(buttonWith(ok, 'Lưu')).not.toMatch(DISABLED)
  })

  it('ngày phiếu: min = today − 7, max = today', () => {
    expect(addDaysIso('2026-11-09', -7)).toBe('2026-11-02')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
    for (const markup of [
      html(<ReceiptForm today="2026-11-09" items={items} suppliers={[]} onClose={vi.fn()} onSaved={vi.fn()} />),
      html(<WriteoffForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()} />),
    ]) {
      const input = markup.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? ''
      expect(input).toContain('min="2026-11-02"')
      expect(input).toContain('max="2026-11-09"')
      expect(input).toContain('value="2026-11-09"')
    }
  })
})
