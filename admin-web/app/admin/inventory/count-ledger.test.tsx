import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Ledger, StockRow } from '@/lib/inventory'

vi.mock('@/lib/actions/inventory', () => ({
  loadInventoryStock: vi.fn(async () => ({ ok: true, rows: [] })),
  postInventoryDocument: vi.fn(),
  loadItemLedger: vi.fn(),
  loadInventoryDocuments: vi.fn(),
  saveInventoryItem: vi.fn(),
  setInventoryItemActive: vi.fn(),
  loadInventoryDocument: vi.fn(),
  voidInventoryDocument: vi.fn(),
}))

const { ToastProvider } = await import('@/components/ui/toast')
const { default: CountForm, countBlocker } = await import('./count-form')
const { LedgerView } = await import('./ledger-dialog')
const { default: InventoryTabs } = await import('./inventory-tabs')

const html = (el: ReactElement) => renderToStaticMarkup(<ToastProvider>{el}</ToastProvider>)

const items: StockRow[] = [
  { id: 'bia', name: 'Bia Hà Nội lon', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: true, qty: 66,
    lastUnitCost: 10000, stockValue: 660000 },
  { id: 'thit', name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient', sku: null, minStock: null, isActive: true, qty: 5,
    lastUnitCost: 120000, stockValue: 600000 },
  { id: 'cu', name: 'Bia cũ', unit: 'lon', kind: 'goods', sku: null, minStock: null, isActive: false, qty: 3,
    lastUnitCost: null, stockValue: 0 },
]

/** Đoạn markup của một hàng (từ tên hàng tới hàng kế tiếp / hết danh sách). */
function rowOf(markup: string, name: string, nextName?: string) {
  const start = markup.indexOf(name)
  expect(start, `không thấy ${name}`).toBeGreaterThan(-1)
  const end = nextName ? markup.indexOf(nextName, start) : markup.indexOf('</ol>', start)
  return markup.slice(start, end)
}

const DISABLED = /\sdisabled(?:="")?[\s>]/
const saveButton = (markup: string) => {
  const end = markup.lastIndexOf('>Lưu<')
  const start = markup.lastIndexOf('<button', end)
  return markup.slice(start, markup.indexOf('>', start) + 1)
}

describe('CountForm', () => {
  it('CountForm: điền sẵn tồn máy mọi hàng đang dùng; gõ đếm 60 cạnh máy 66 → chênh "-6" màu đỏ; ô trống → "Không kiểm"', () => {
    const markup = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ counts: { bia: { counted: '60', cost: '' } } }} />)
    const bia = rowOf(markup, 'Bia Hà Nội lon', 'Thịt ba chỉ')
    expect(bia).toContain('66')
    expect(bia).toMatch(/text-critical[^>]*>-6</)
    expect(rowOf(markup, 'Thịt ba chỉ')).toContain('Không kiểm')
    expect(markup).not.toContain('Bia cũ') // hàng ngừng dùng không kiểm
    // Ngày cố định hôm nay (chữ, không có ô chọn ngày) + chú thích tồn máy.
    expect(markup).toContain('09/11/2026')
    expect(markup).not.toMatch(/<input[^>]*type="date"/)
    expect(markup).toContain('số chốt tính theo lúc bấm Lưu')
  })

  it('CountForm: thừa → "+2" màu xanh; khớp → "Khớp"; mọi ô đếm có qtyWarning ngay dưới', () => {
    const markup = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ counts: { bia: { counted: '68', cost: '' }, thit: { counted: '1.500', cost: '' } } }} />)
    expect(rowOf(markup, 'Bia Hà Nội lon', 'Thịt ba chỉ')).toMatch(/text-success[^>]*>\+2</)
    expect(rowOf(markup, 'Thịt ba chỉ')).toContain('Đang hiểu là 1,5')
    const same = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ counts: { bia: { counted: '66', cost: '' } } }} />)
    expect(rowOf(same, 'Bia Hà Nội lon', 'Thịt ba chỉ')).toContain('Khớp')
  })

  it('CountForm: lọc Bán nguyên chỉ còn hàng goods; bật "Kiểm đầu kỳ" hiện cột Giá vốn', () => {
    const goods = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()} initial={{ kind: 'goods' }} />)
    expect(goods).toContain('Bia Hà Nội lon')
    expect(goods).not.toContain('Thịt ba chỉ')
    expect(goods).not.toContain('id="inv-count-cost-bia"')

    const opening = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ withCost: true, counts: { bia: { counted: '60', cost: '10.200' } } }} />)
    expect(opening).toContain('Giá vốn')
    expect(opening).toContain('id="inv-count-cost-bia"')
    expect(opening).toContain('value="10.200"')
  })

  it('CountForm: không ô nào có số → nút Lưu tắt', () => {
    const empty = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(saveButton(empty)).toMatch(DISABLED)
    expect(empty).toContain('Nhập số đếm ít nhất một hàng')
    const one = html(<CountForm today="2026-11-09" items={items} onClose={vi.fn()} onSaved={vi.fn()}
      initial={{ counts: { thit: { counted: '0', cost: '' } } }} />)
    expect(saveButton(one)).not.toMatch(DISABLED) // đếm 0 là số hợp lệ
    expect(countBlocker({})).toBe('Nhập số đếm ít nhất một hàng')
    expect(countBlocker({ a: { counted: '  ', cost: '' } })).toBe('Nhập số đếm ít nhất một hàng')
  })
})

describe('LedgerDialog', () => {
  const ledger: Ledger = {
    item: { id: 'thit', name: 'Thịt ba chỉ', unit: 'kg', kind: 'ingredient' },
    from: '2026-10-01', to: '2026-10-01', openingQty: 5, closingQty: 3,
    rows: [
      { at: '2026-10-01T03:00:00Z', businessDate: '2026-10-01', type: 'receipt', documentId: 'd1', docNo: 'PN-0001',
        qtyChange: 10, countedQty: null, balance: 15 },
      { at: '2026-10-01T15:00:00Z', businessDate: '2026-10-01', type: 'writeoff', documentId: 'd2', docNo: 'PX-0001',
        qtyChange: -1, countedQty: null, balance: 14 },
      { at: '2026-10-01T16:00:00Z', businessDate: '2026-10-01', type: 'count', documentId: 'd3', docNo: 'PK-0001',
        qtyChange: -11, countedQty: 3, balance: 3 },
      { at: '2026-10-01T19:00:00Z', businessDate: '2026-10-01', type: 'sales', documentId: null, docNo: null,
        qtyChange: -120, countedQty: null, balance: -117 },
    ],
  }

  it('LedgerDialog: dòng kiểm hiện "Đếm 3 (lệch -11)", tồn chạy 3; dòng bán "Bán ngày 01/10" −120', () => {
    const markup = html(<LedgerView ledger={ledger} onOpenDocument={vi.fn()} />)
    expect(markup).toContain('Tồn đầu kỳ')
    expect(markup).toContain('Tồn cuối kỳ')
    const count = markup.slice(markup.indexOf('PK-0001'), markup.indexOf('Bán ngày'))
    expect(count).toContain('Đếm 3 (lệch -11)')
    expect(count).toMatch(/>3</)
    const sales = markup.slice(markup.indexOf('Bán ngày 01/10'), markup.indexOf('Tồn cuối kỳ'))
    expect(sales).toMatch(/text-critical[^>]*>−120</)
    // Nhập + xanh lá có dấu.
    expect(markup).toMatch(/text-success[^>]*>\+10</)
    // Phiếu bấm được (mở chi tiết); dòng bán không có số phiếu.
    expect(markup).toContain('aria-label="Xem phiếu PN-0001"')
    expect(markup).not.toContain('Xem phiếu null')
  })

  it('kỳ không có biến động: chỉ tồn đầu + tồn cuối và một dòng chữ', () => {
    const markup = html(<LedgerView ledger={{ ...ledger, rows: [], openingQty: 4, closingQty: 4 }} onOpenDocument={vi.fn()} />)
    expect(markup).toContain('Không có nhập, bán, huỷ hay kiểm trong kỳ này')
  })
})

describe('nối thẻ kho vào tab Tồn kho', () => {
  it('chủ quán / quản lý: bấm hàng mở thẻ kho — trên mobile cả phần trên thẻ là một nút cao ≥ 44px', () => {
    const markup = html(<InventoryTabs canEdit today="2026-11-09" initialStock={items} />)
    const mobile = markup.slice(markup.indexOf('md:hidden'), markup.indexOf('<table'))
    const btn = mobile.match(/<button[^>]*aria-label="Xem thẻ kho Bia Hà Nội lon"[^>]*>/)?.[0] ?? ''
    expect(btn).toMatch(/\bmin-h-11\b/)
    const inside = mobile.slice(mobile.indexOf(btn), mobile.indexOf('</button>', mobile.indexOf(btn)))
    expect(inside).toContain('660.000đ')
    expect(inside).toContain('>66<')
    // Nút Sửa / Ngừng dùng không nằm trong nút mở thẻ kho.
    expect(inside).not.toContain('Ngừng dùng')
  })

  it('thu ngân: không có lối mở thẻ kho (RPC chỉ cho chủ quán + quản lý)', () => {
    const markup = html(<InventoryTabs canEdit={false} today="2026-11-09" initialStock={items} />)
    expect(markup).toContain('Bia Hà Nội lon')
    expect(markup).not.toContain('Xem thẻ kho')
  })

  it('chủ quán thấy 4 tab, có tab Kiểm kho', () => {
    const markup = html(<InventoryTabs canEdit today="2026-11-09" initialStock={items} />)
    for (const label of ['Tồn kho', 'Nhập hàng', 'Kiểm kho', 'Xuất huỷ']) expect(markup).toContain(`>${label}<`)
  })
})
