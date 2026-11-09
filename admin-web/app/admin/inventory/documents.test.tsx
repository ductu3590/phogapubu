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
const { orderedRange } = await import('./doc-format')
const { default: LinesEditor } = await import('./lines-editor')
const { default: ReceiptForm } = await import('./receipt-form')
const { default: WriteoffForm } = await import('./writeoff-form')
const { addDaysIso, DocumentFormShell, makeDocumentSubmit, savedToasts } = await import('./document-form')
const { escapeHandler } = await import('@/components/ui/dialog')

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
    // Mig 122b: không còn câu hứa "sẽ tự tạo khi có Sổ thu chi"; nói rõ lưu phiếu là ghi luôn phiếu chi.
    expect(markup).not.toContain('đã tạo phiếu chi')
    expect(markup).not.toContain('sẽ tự tạo khi có Sổ thu chi')
    expect(markup).toContain('Lưu phiếu sẽ ghi luôn một phiếu chi')

    const ok = html(<ReceiptForm today="2026-11-09" items={items} suppliers={[]} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ paidStatus: 'paid', paidMethod: 'cash', drafts: lines }} />)
    expect(buttonWith(ok, 'Lưu')).not.toMatch(DISABLED)
    expect(ok).not.toContain('Chọn phương thức trả tiền')
    expect(ok).toContain('quán bật ca thì cần mở ca trên POS trước')
    expect(ok).not.toContain('Ngày nhập khác hôm nay')
    // Ghi lùi ngày + trả tiền mặt: nói rõ tiền vẫn ra khỏi két hôm nay; chuyển khoản thì không có câu này.
    const back = html(<ReceiptForm today="2026-11-09" items={items} suppliers={[]} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ docDate: '2026-11-07', paidStatus: 'paid', paidMethod: 'cash', drafts: lines }} />)
    expect(back).toContain('Ngày nhập khác hôm nay: tiền mặt vẫn tính ra khỏi két hôm nay (ca đang mở)')
    const backBank = html(<ReceiptForm today="2026-11-09" items={items} suppliers={[]} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ docDate: '2026-11-07', paidStatus: 'paid', paidMethod: 'bank', drafts: lines }} />)
    expect(backBank).not.toContain('Ngày nhập khác hôm nay')
    // Mặc định "Chưa chọn" (KHO): chưa chọn trạng thái trả thì không có câu phiếu chi.
    const fresh = html(<ReceiptForm today="2026-11-09" items={items} suppliers={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(fresh).not.toContain('phiếu chi')
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

describe('Kho — sửa vòng 1 (review Task 7)', () => {
  it('lỗi lưu nằm ở CHÂN hộp cạnh nút Lưu (không khuất trên đầu thân hộp ở 375px)', () => {
    const markup = html(<DocumentFormShell title="Tạo phiếu nhập" dirty busy={false} blocker={null}
      error="Dòng 2: Đơn giá không hợp lệ" onClose={vi.fn()} onSave={vi.fn()}><p>THÂN</p></DocumentFormShell>)
    const footer = markup.slice(markup.indexOf('<footer'), markup.indexOf('</footer>'))
    expect(footer).toContain('Dòng 2: Đơn giá không hợp lệ')
    expect(footer).toContain('role="alert"')
    expect(footer).toContain('>Lưu<')
    const body = markup.slice(0, markup.indexOf('<footer'))
    expect(body).not.toContain('Đơn giá không hợp lệ')
    // Có cả lỗi lẫn lý do chưa lưu được thì hiện cả hai ở chân.
    const both = html(<DocumentFormShell title="x" dirty busy={false} blocker="Nhập lý do huỷ" error="Không có quyền"
      onClose={vi.fn()} onSave={vi.fn()}><p /></DocumentFormShell>)
    const f2 = both.slice(both.indexOf('<footer'), both.indexOf('</footer>'))
    expect(f2).toContain('Không có quyền')
    expect(f2).toContain('Nhập lý do huỷ')
  })

  it('gửi lại sau lần lưu thất bại dùng ĐÚNG clientRequestId cũ', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'Không kết nối được máy chủ' })
      .mockResolvedValueOnce({ ok: true, id: 'd1', docNo: 'PN-0004', replayed: true, beforeCountDocNo: null })
    const send = makeDocumentSubmit({ kind: 'receipt', today: '2026-11-09', clientRequestId: 'req-1', post })
    const header = { docDate: '2026-11-09', supplierName: null, note: null, paidStatus: 'unpaid' as const, paidMethod: null }
    expect(await send(header, lines)).toEqual({ ok: false, error: 'Không kết nối được máy chủ' })
    expect(await send(header, lines)).toMatchObject({ ok: true, docNo: 'PN-0004', replayed: true })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls.map((c) => c[0].clientRequestId)).toEqual(['req-1', 'req-1'])
    // Hôm nay gửi docDate null (server tự lấy ngày kinh doanh); ngày lùi gửi nguyên.
    expect(post.mock.calls[0][0].docDate).toBeNull()
    await send({ ...header, docDate: '2026-11-08' }, lines)
    expect(post.mock.calls[2][0]).toMatchObject({ docDate: '2026-11-08', clientRequestId: 'req-1' })
    // Dòng sai: báo lỗi, không gọi server.
    post.mockClear()
    expect(await send(header, [{ inventoryItemId: 'bia', qty: '0', unitCost: '1', countedQty: '' }]))
      .toEqual({ ok: false, error: 'Dòng 1: Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân' })
    expect(post).not.toHaveBeenCalled()
  })

  it('Esc ở hộp khoá (dismissible=false) gọi onEscape; hộp thường gọi onClose; không có onEscape thì không làm gì', () => {
    const close = vi.fn()
    const escape = vi.fn()
    expect(escapeHandler(true, close, escape)).toBe(close)
    expect(escapeHandler(false, close, escape)).toBe(escape)
    expect(escapeHandler(false, close)).toBeUndefined()
  })

  it('lọc ngày: ngày đầu sau ngày cuối thì đảo lại và báo', () => {
    expect(orderedRange('2026-11-09', '2026-11-01')).toEqual({ lo: '2026-11-01', hi: '2026-11-09', swapped: true })
    expect(orderedRange('2026-11-01', '2026-11-09')).toEqual({ lo: '2026-11-01', hi: '2026-11-09', swapped: false })
    expect(orderedRange('2026-11-09', '2026-11-09').swapped).toBe(false)
  })

  it('thẻ phiếu dưới md: cả thẻ là một nút (vùng chạm lớn, bàn phím mở được)', () => {
    const markup = html(<DocumentList kind="receipt" documents={[doc({})]} onOpen={vi.fn()} />)
    const mobile = markup.slice(markup.indexOf('md:hidden'), markup.indexOf('<table'))
    const btn = mobile.match(/<button[^>]*aria-label="Xem phiếu PN-0001"[^>]*>/)?.[0] ?? ''
    expect(btn).toContain('type="button"')
    expect(btn).toMatch(/\bw-full\b/)
    expect(btn).toMatch(/\bpy-3\b/)
    // Nội dung thẻ (số tiền, nhà cung cấp, trạng thái) nằm TRONG nút.
    const inside = mobile.slice(mobile.indexOf(btn), mobile.indexOf('</button>', mobile.indexOf(btn)))
    expect(inside).toContain('567.000đ')
    expect(inside).toContain('Đại lý Hà Nội')
    expect(inside).toContain('Đã trả · Tiền mặt')
  })
})

describe('Kho — toast sau khi lưu phiếu', () => {
  it('gửi lại trả phiếu đã lưu trước đó (replayed): báo rõ để kiểm tra lại nội dung, không báo "Đã lưu"', () => {
    expect(savedToasts({ docNo: 'PN-0004', replayed: true, beforeCountDocNo: null }))
      .toEqual([{ tone: 'info', title: 'Phiếu đã lưu trước đó: PN-0004 — kiểm tra lại nội dung' }])
    expect(savedToasts({ docNo: 'PN-0004', replayed: false, beforeCountDocNo: null }))
      .toEqual([{ tone: 'success', title: 'Đã lưu PN-0004' }])
    const back = savedToasts({ docNo: 'PN-0005', replayed: false, beforeCountDocNo: 'PK-0001' }, (n) => `Đã chốt ${n}`)
    expect(back[0]).toEqual({ tone: 'success', title: 'Đã chốt PN-0005' })
    expect(back[1].title).toBe('Phiếu ghi lùi ngày trước phiếu kiểm PK-0001 nên tồn hiện tại không đổi')
  })
})
