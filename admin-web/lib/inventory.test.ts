import { describe, it, expect } from 'vitest'
import {
  DOC_KIND_LABEL,
  KIND_LABEL,
  buildDocumentLines,
  filterStockRows,
  formatQty,
  lineAmount,
  parseDocument,
  parseDocuments,
  parseLedger,
  parseMenuStock,
  parseQty,
  parseStockLevels,
  qtyWarning,
  receiptTotal,
  stockStatus,
  type DraftLine,
  type StockRow,
} from './inventory'

// Số lượng kho KHÁC tiền: kho không có dấu ngăn nghìn, "1,5" và "1.5" đều là một rưỡi (kg thịt).
// Tiền (đơn giá) vẫn đi qua parseVnd: "10.500" là mười nghìn rưỡi, không phải 10,5.

describe('parseQty', () => {
  it('dấu phẩy và dấu chấm đều là thập phân', () => {
    expect(parseQty('1,5')).toBe(1.5)
    expect(parseQty('1.5')).toBe(1.5)
    expect(parseQty('1.500')).toBe(1.5)
    expect(parseQty(' 24 ')).toBe(24)
    expect(parseQty('0,125')).toBe(0.125)
    expect(parseQty('2 4')).toBe(24)
    expect(parseQty('999999,999')).toBe(999999.999)
  })

  it('chặn rỗng, 0, âm, chữ, quá 3 số lẻ, hai dấu, quá trần', () => {
    for (const s of ['', '   ', '0', '0,000', '-1', 'abc', '1,2345', '1.2.3', '1,000,5', '1000000', ',5', '5,', '1e3', '+2']) {
      expect(parseQty(s), s).toBeNull()
    }
  })
})

describe('qtyWarning', () => {
  it('nhắc khi dấu chấm/phẩy đứng trước đúng 3 chữ số (dễ là ngăn nghìn) hoặc SL ≥ 1000', () => {
    expect(qtyWarning('1.500')).toMatch(/1,5/)
    expect(qtyWarning('80.000')).toMatch(/80/)
    expect(qtyWarning('1500')).toMatch(/1\.500/)
  })
  it('không nhắc với số thường hoặc ô sai', () => {
    for (const s of ['1,5', '24', '0,125', '', 'abc', '999']) expect(qtyWarning(s), s).toBeNull()
  })
})

it('formatQty', () => {
  expect(formatQty(1.5)).toBe('1,5')
  expect(formatQty(1200)).toBe('1.200')
  expect(formatQty(-3)).toBe('-3')
  expect(formatQty(0.125)).toBe('0,125')
  expect(formatQty(2.0004)).toBe('2')
})

it('stockStatus: âm, dưới mức tối thiểu, bằng mức tối thiểu là ok, không đặt mức', () => {
  expect(stockStatus(-1, null)).toBe('negative')
  expect(stockStatus(-1, 10)).toBe('negative')
  expect(stockStatus(9, 10)).toBe('low')
  expect(stockStatus(10, 10)).toBe('ok')
  expect(stockStatus(0, null)).toBe('ok')
  expect(stockStatus(0, 0)).toBe('ok')
})

it('lineAmount khớp SQL round: 2,5 × 126.000 = 315.000; 0,333 × 10.001 = 3.330; receiptTotal 567.000', () => {
  expect(lineAmount(2.5, 126000)).toBe(315000)
  expect(lineAmount(0.333, 10001)).toBe(3330)
  expect(lineAmount(24, 10500)).toBe(252000)
  // Nửa lên như SQL round(numeric): 0,5 × 3 = 1,5 → 2; 1,333 × 10.001 = 13.331,333 → 13.331.
  expect(lineAmount(0.5, 3)).toBe(2)
  expect(lineAmount(1.333, 10001)).toBe(13331)
  // 0,1 × 3 trong số thực là 0,30000000000000004 — vẫn phải ra đúng 0 (0,3 → 0).
  expect(lineAmount(0.1, 3)).toBe(0)
  expect(lineAmount(0.005, 100)).toBe(1) // 0,5 → 1
  // Trần: 999.999,999 × 100.000.000 vượt Number an toàn, vẫn đúng tới đồng.
  expect(lineAmount(999999.999, 100000000)).toBe(99999999900000)
  expect(receiptTotal([{ qty: 2.5, unitCost: 126000 }, { qty: 24, unitCost: 10500 }])).toBe(567000)
  expect(receiptTotal([])).toBe(0)
})

const stock = (over: Partial<StockRow>): StockRow => ({
  id: 'x', name: 'x', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: true, qty: 0,
  lastUnitCost: null, stockValue: 0, ...over,
})

it('filterStockRows: "bia ha noi" ra "Bia Hà Nội lon"; lọc loại; ẩn hàng ngừng dùng mặc định', () => {
  const rows = [
    stock({ id: '1', name: 'Bia Hà Nội lon', sku: 'BHN' }),
    stock({ id: '2', name: 'Thịt ba chỉ', kind: 'ingredient', sku: 'TBC-01' }),
    stock({ id: '3', name: 'Bia Sài Gòn lon', isActive: false }),
    stock({ id: '4', name: 'Đá viên', kind: 'ingredient' }),
  ]
  const ids = (r: StockRow[]) => r.map((x) => x.id)
  expect(ids(filterStockRows(rows, { query: 'bia ha noi', kind: 'all', showInactive: false }))).toEqual(['1'])
  expect(ids(filterStockRows(rows, { query: '', kind: 'all', showInactive: false }))).toEqual(['1', '2', '4'])
  expect(ids(filterStockRows(rows, { query: '', kind: 'all', showInactive: true }))).toEqual(['1', '2', '3', '4'])
  expect(ids(filterStockRows(rows, { query: '', kind: 'ingredient', showInactive: false }))).toEqual(['2', '4'])
  expect(ids(filterStockRows(rows, { query: 'tbc', kind: 'all', showInactive: false }))).toEqual(['2'])
  expect(ids(filterStockRows(rows, { query: 'da vien', kind: 'all', showInactive: false }))).toEqual(['4'])
  expect(ids(filterStockRows(rows, { query: '  BIA  ', kind: 'goods', showInactive: true }))).toEqual(['1', '3'])
})

const draft = (over: Partial<DraftLine>): DraftLine => ({ inventoryItemId: '', qty: '', unitCost: '', countedQty: '', ...over })

describe('buildDocumentLines', () => {
  it('receipt: thiếu đơn giá lỗi; "10.500" đơn giá → 10500; trùng hàng lỗi', () => {
    expect(buildDocumentLines('receipt', [draft({ inventoryItemId: 'a', qty: '24' })])).toEqual({
      ok: false, error: 'Dòng 1: Đơn giá không hợp lệ' })
    expect(buildDocumentLines('receipt', [
      draft({ inventoryItemId: 'a', qty: '24', unitCost: '10.500' }),
      draft({}), // dòng trống chưa chọn hàng bị bỏ
      draft({ inventoryItemId: 'b', qty: '2,5', unitCost: '126.000' }),
    ])).toEqual({ ok: true, lines: [
      { inventoryItemId: 'a', qty: 24, unitCost: 10500 },
      { inventoryItemId: 'b', qty: 2.5, unitCost: 126000 },
    ] })
    // Đơn giá "80.000" là tám mươi nghìn, không phải 80.
    const r = buildDocumentLines('receipt', [draft({ inventoryItemId: 'a', qty: '1', unitCost: '80.000' })])
    expect(r.ok && r.lines[0].unitCost).toBe(80000)
    expect(buildDocumentLines('receipt', [
      draft({ inventoryItemId: 'a', qty: '1', unitCost: '1' }),
      draft({ inventoryItemId: 'a', qty: '2', unitCost: '1' }),
    ])).toEqual({ ok: false, error: 'Một hàng chỉ một dòng trong phiếu' })
    expect(buildDocumentLines('receipt', [draft({ inventoryItemId: 'a', qty: '0', unitCost: '1' })]))
      .toEqual({ ok: false, error: 'Dòng 1: Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân' })
    expect(buildDocumentLines('receipt', [draft({ inventoryItemId: 'a', qty: '1', unitCost: '100.000.001' })]))
      .toEqual({ ok: false, error: 'Dòng 1: Đơn giá không hợp lệ' })
    expect(buildDocumentLines('receipt', [draft({ inventoryItemId: 'a', qty: '1', unitCost: '0' })]))
      .toEqual({ ok: true, lines: [{ inventoryItemId: 'a', qty: 1, unitCost: 0 }] })
  })

  it('count: ô đếm rỗng bị bỏ, "0" giữ; withCost đọc đơn giá', () => {
    const drafts = [
      draft({ inventoryItemId: 'a', countedQty: '' }),
      draft({ inventoryItemId: 'b', countedQty: '0' }),
      draft({ inventoryItemId: 'c', countedQty: '1,5', unitCost: '120.000' }),
    ]
    expect(buildDocumentLines('count', drafts)).toEqual({ ok: true, lines: [
      { inventoryItemId: 'b', countedQty: 0 },
      { inventoryItemId: 'c', countedQty: 1.5 },
    ] })
    expect(buildDocumentLines('count', drafts, { withCost: true })).toEqual({ ok: true, lines: [
      { inventoryItemId: 'b', countedQty: 0, unitCost: null },
      { inventoryItemId: 'c', countedQty: 1.5, unitCost: 120000 },
    ] })
    expect(buildDocumentLines('count', [draft({ inventoryItemId: 'a', countedQty: '-1' })]))
      .toEqual({ ok: false, error: 'Dòng 1: Số lượng đếm phải từ 0, tối đa 3 chữ số thập phân' })
    expect(buildDocumentLines('count', [draft({ inventoryItemId: 'a', countedQty: '1', unitCost: 'abc' })], { withCost: true }))
      .toEqual({ ok: false, error: 'Dòng 1: Đơn giá không hợp lệ' })
    expect(buildDocumentLines('count', [draft({ inventoryItemId: 'a', countedQty: '' })]))
      .toEqual({ ok: false, error: 'Phiếu cần ít nhất một dòng' })
  })

  it('writeoff: SL "abc" → lỗi có tên dòng', () => {
    expect(buildDocumentLines('writeoff', [
      draft({ inventoryItemId: 'a', qty: '1' }),
      draft({ inventoryItemId: 'b', qty: 'abc' }),
    ])).toEqual({ ok: false, error: 'Dòng 2: Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân' })
    expect(buildDocumentLines('writeoff', [draft({ inventoryItemId: 'a', qty: '2', unitCost: '5.000' })]))
      .toEqual({ ok: true, lines: [{ inventoryItemId: 'a', qty: 2 }] })
    expect(buildDocumentLines('writeoff', [])).toEqual({ ok: false, error: 'Phiếu cần ít nhất một dòng' })
  })
})

it('parseStockLevels nhận số dạng chuỗi hoặc số; dòng thiếu id hoặc số hỏng bị bỏ', () => {
  const rows = parseStockLevels({ at: '2026-11-09T00:00:00Z', items: [
    { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods', sku: null, min_stock: '24', is_active: true, qty: '66',
      last_unit_cost: 10000, stock_value: '660000' },
    { id: 'b', name: 'Thịt', unit: 'kg', kind: 'ingredient', sku: 'T1', min_stock: null, is_active: false, qty: -1.5,
      last_unit_cost: null, stock_value: 0 },
    { name: 'thiếu id', unit: 'lon', kind: 'goods', qty: 1 },
    { id: 'c', name: 'SL hỏng', unit: 'lon', kind: 'goods', qty: 'abc' },
    { id: 'd', name: 'Loại lạ', unit: 'lon', kind: 'other', qty: 1 },
    null,
  ] })
  expect(rows).toEqual([
    { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods', sku: null, minStock: 24, isActive: true, qty: 66,
      lastUnitCost: 10000, stockValue: 660000 },
    { id: 'b', name: 'Thịt', unit: 'kg', kind: 'ingredient', sku: 'T1', minStock: null, isActive: false, qty: -1.5,
      lastUnitCost: null, stockValue: 0 },
  ])
  expect(parseStockLevels(null)).toEqual([])
  expect(parseStockLevels({ items: 'x' })).toEqual([])
})

describe('parseLedger, parseDocuments, parseDocument, parseMenuStock', () => {
  it('null/hỏng → giá trị rỗng an toàn', () => {
    expect(parseLedger(null)).toBeNull()
    expect(parseLedger({ rows: [] })).toBeNull() // thiếu item
    expect(parseDocuments(null)).toEqual({ documents: [], suppliers: [] })
    expect(parseDocuments({ documents: 'x', suppliers: [1, 'NCC', null] })).toEqual({ documents: [], suppliers: ['NCC'] })
    expect(parseDocument(null)).toBeNull()
    expect(parseDocument({ kind: 'receipt' })).toBeNull()
    expect(parseMenuStock(null)).toBeNull()
    expect(parseMenuStock({})).toEqual({ goods: [], links: [] })
  })

  const doc = {
    id: 'd1', kind: 'receipt', doc_no: 'PN-0001', doc_date: '2026-11-09', effective_at: '2026-11-09T03:00:00+00:00',
    supplier_name: 'Đại lý', note: null, total_amount: 567000, paid_status: 'paid', paid_method: 'bank', status: 'posted',
    line_count: 2, created_at: '2026-11-09T03:00:00+00:00', created_by_name: 'Chị Lan', voided_at: null, void_reason: null,
  }
  const summary = {
    id: 'd1', kind: 'receipt', docNo: 'PN-0001', docDate: '2026-11-09', effectiveAt: '2026-11-09T03:00:00+00:00',
    supplierName: 'Đại lý', note: null, totalAmount: 567000, paidStatus: 'paid', paidMethod: 'bank', status: 'posted',
    lineCount: 2, createdAt: '2026-11-09T03:00:00+00:00', createdByName: 'Chị Lan', voidedAt: null, voidReason: null,
  }

  it('parseDocuments đổi tên trường, bỏ phiếu hỏng', () => {
    expect(parseDocuments({ documents: [doc, { ...doc, id: null }, { ...doc, id: 'd2', kind: 'transfer' }], suppliers: ['Đại lý'] }))
      .toEqual({ documents: [summary], suppliers: ['Đại lý'] })
  })

  it('parseDocument kèm dòng; số dạng chuỗi', () => {
    const d = parseDocument({ ...doc, total_amount: '567000', lines: [
      { inventory_item_id: 'a', name: 'Thịt', unit: 'kg', qty: '2.500', unit_cost: 126000, counted_qty: null,
        system_qty: null, line_amount: 315000 },
      { inventory_item_id: null, name: 'hỏng' },
    ] })
    expect(d).toEqual({ ...summary, lines: [
      { inventoryItemId: 'a', name: 'Thịt', unit: 'kg', qty: 2.5, unitCost: 126000, countedQty: null, systemQty: null,
        lineAmount: 315000 },
    ] })
  })

  it('parseLedger', () => {
    const l = parseLedger({
      item: { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods' }, from: '2026-10-01', to: '2026-10-02',
      opening_qty: '100', closing_qty: 177,
      rows: [
        { at: '2026-10-01T03:00:00+00:00', business_date: '2026-10-01', type: 'receipt', document_id: 'd', doc_no: 'PN-0001',
          qty_change: 200, counted_qty: null, balance: 300 },
        { at: '2026-10-01T19:00:00+00:00', business_date: '2026-10-01', type: 'sales', document_id: null, doc_no: null,
          qty_change: '-120', counted_qty: null, balance: '178' },
        { at: 'x', type: 'teleport', qty_change: 1, balance: 1 },
      ],
    })
    expect(l).toEqual({
      item: { id: 'a', name: 'Bia', unit: 'lon', kind: 'goods' }, from: '2026-10-01', to: '2026-10-02',
      openingQty: 100, closingQty: 177,
      rows: [
        { at: '2026-10-01T03:00:00+00:00', businessDate: '2026-10-01', type: 'receipt', documentId: 'd', docNo: 'PN-0001',
          qtyChange: 200, countedQty: null, balance: 300 },
        { at: '2026-10-01T19:00:00+00:00', businessDate: '2026-10-01', type: 'sales', documentId: null, docNo: null,
          qtyChange: -120, countedQty: null, balance: 178 },
      ],
    })
  })

  it('parseMenuStock', () => {
    expect(parseMenuStock({
      goods: [{ id: 'a', name: 'Bia', unit: 'lon' }, { name: 'thiếu id' }],
      links: [
        { menu_item_id: 'm', variant_id: null, inventory_item_id: 'a', qty_per_sale: '24' },
        { menu_item_id: 'm', variant_id: 'v', inventory_item_id: 'a', qty_per_sale: 0.5 },
        { menu_item_id: 'm', inventory_item_id: 'a', qty_per_sale: 'x' },
      ],
    })).toEqual({
      goods: [{ id: 'a', name: 'Bia', unit: 'lon' }],
      links: [
        { menuItemId: 'm', variantId: null, inventoryItemId: 'a', qtyPerSale: 24 },
        { menuItemId: 'm', variantId: 'v', inventoryItemId: 'a', qtyPerSale: 0.5 },
      ],
    })
  })
})

it('nhãn', () => {
  expect(DOC_KIND_LABEL).toEqual({ receipt: 'Nhập hàng', count: 'Kiểm kho', writeoff: 'Xuất huỷ' })
  expect(KIND_LABEL).toEqual({ goods: 'Bán nguyên', ingredient: 'Nguyên liệu' })
})
