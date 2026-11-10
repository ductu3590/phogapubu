import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CashBookCategory, CashBookEntry, CashBookTotals, CashbookFilters } from '@/lib/cash-book'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/actions/cash-book', () => ({
  createCashBookEntry: vi.fn(), voidCashBookEntry: vi.fn(), saveCashBookCategory: vi.fn(), setCashBookCategoryActive: vi.fn(),
}))

const { default: CashbookView, CashbookTotalsCards, CashbookEntries } = await import('./cashbook-view')
const { EntryForm } = await import('./entry-form-dialog')
const { CategoryList, CategoryCreateForm } = await import('./categories-dialog')

const noop = () => {}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const disabledOf = (html: string, label: string): boolean | null => {
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (text(m[2]).includes(label)) return /\sdisabled=""/.test(m[1])
  }
  return null
}

const cat = (over: Partial<CashBookCategory>): CashBookCategory => ({
  id: 'c', kind: 'payment', name: 'Đá', reportGroup: 'operating_expense', isSystem: false, isActive: true,
  requiresNote: false, sortOrder: 10, ...over,
})
const categories = [
  cat({ id: 'nhap', name: 'Nhập hàng', reportGroup: 'inventory_purchase', isSystem: true, sortOrder: 10 }),
  cat({ id: 'da', name: 'Đá', sortOrder: 40 }),
  cat({ id: 'khac', name: 'Khác', requiresNote: true, sortOrder: 80 }),
  cat({ id: 'an', name: 'Thuê loa', isActive: false, sortOrder: 90 }),
  cat({ id: 'nop', kind: 'receipt', name: 'Nộp thêm vào két', reportGroup: 'cash_transfer', sortOrder: 10 }),
  cat({ id: 'thukhac', kind: 'receipt', name: 'Thu khác', reportGroup: 'other_income', requiresNote: true, sortOrder: 20 }),
]
const entry = (over: Partial<CashBookEntry>): CashBookEntry => ({
  id: 'e', kind: 'payment', method: 'cash', categoryId: 'da', categoryName: 'Đá', reportGroup: 'operating_expense',
  amount: 50000, note: null, counterparty: null, businessDate: '2026-11-09', createdAt: '2026-11-09T05:00:00Z',
  createdByName: 'Lan', cashShiftId: 'sh1', shiftOpenedAt: '2026-11-09T01:00:00Z', source: 'manual', sourceRef: null,
  voidedAt: null, voidedByName: null, voidReason: null, ...over,
})
const totals: CashBookTotals = {
  receiptCash: 100000, receiptBank: 200000, paymentCash: 30000, paymentBank: 500000,
  receiptTotal: 300000, paymentTotal: 530000, net: -230000,
}
const filters: CashbookFilters = { from: '2026-11-09', to: '2026-11-09', kind: null, method: null, categoryId: null }
const view = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(CashbookView, {
  list: { entries: [entry({})], totals, truncated: false }, categories, filters, today: '2026-11-09', inModal: true,
  canManage: true, ...over,
}))

describe('Sổ thu chi', () => {
  it('ô tổng: Tổng thu, Tổng chi, Chênh lệch, mỗi ô tách TM / CK', () => {
    const t = text(renderToStaticMarkup(createElement(CashbookTotalsCards, { totals })))
    for (const s of ['Tổng thu', '300.000đ', 'TM 100.000đ', 'CK 200.000đ', 'Tổng chi', '530.000đ', 'TM 30.000đ',
      'CK 500.000đ', 'Chênh lệch', '−230.000đ', 'TM +70.000đ', 'CK −300.000đ']) {
      expect(t).toContain(s)
    }
  })

  it('phiếu đã huỷ: gạch ngang, có lý do huỷ, không có nút Huỷ', () => {
    const html = renderToStaticMarkup(createElement(CashbookEntries, {
      entries: [entry({ voidedAt: '2026-11-09T06:00:00Z', voidedByName: 'Chủ', voidReason: 'ghi nhầm' })],
      canManage: true, onVoid: noop,
    }))
    expect(html).toContain('line-through')
    expect(text(html)).toContain('ghi nhầm')
    expect(disabledOf(html, 'Huỷ')).toBeNull()
  })

  it('phiếu nguồn kho: nhãn Phiếu nhập kho, không có nút Huỷ, có chữ Huỷ ở trang Kho', () => {
    const html = renderToStaticMarkup(createElement(CashbookEntries, {
      entries: [entry({ source: 'inventory_receipt', sourceRef: 'doc1', categoryName: 'Nhập hàng', method: 'bank', cashShiftId: null })],
      canManage: true, onVoid: noop,
    }))
    expect(text(html)).toContain('Phiếu nhập kho')
    expect(text(html)).toContain('Huỷ ở trang Kho')
    expect(disabledOf(html, 'Huỷ phiếu')).toBeNull()
    // Phiếu thường của chủ quán thì có nút Huỷ phiếu.
    const normal = renderToStaticMarkup(createElement(CashbookEntries, { entries: [entry({})], canManage: true, onVoid: noop }))
    expect(disabledOf(normal, 'Huỷ phiếu')).toBe(false)
  })

  it('trống: Chưa có phiếu nào trong khoảng này', () => {
    expect(text(renderToStaticMarkup(createElement(CashbookEntries, { entries: [], canManage: true, onVoid: noop }))))
      .toContain('Chưa có phiếu nào trong khoảng này')
  })

  it('truncated: báo Chỉ hiện 2000 phiếu mới nhất, thu hẹp bộ lọc', () => {
    expect(text(view({ list: { entries: [entry({})], totals, truncated: true } }))).toContain('Chỉ hiện 2000 phiếu mới nhất, thu hẹp bộ lọc')
    expect(text(view())).not.toContain('Chỉ hiện 2000 phiếu')
  })

  it('chủ quán / quản lý: có + Phiếu thu, + Phiếu chi, Danh mục, Xuất Excel theo bộ lọc', () => {
    const html = view()
    for (const s of ['Phiếu thu', 'Phiếu chi', 'Danh mục']) expect(disabledOf(html, s)).toBe(false)
    expect(html).toContain('href="/admin/cashbook/export?from=2026-11-09&amp;to=2026-11-09"')
    expect(text(html)).toContain('Xuất Excel')
  })

  it('thu ngân: thấy sổ (phiếu của mình), không có nút Thêm phiếu / Huỷ / Danh mục', () => {
    const html = view({ canManage: false })
    for (const s of ['Phiếu thu', 'Phiếu chi', 'Danh mục', 'Huỷ phiếu']) expect(disabledOf(html, s)).toBeNull()
    expect(text(html)).toContain('Đá')
    expect(text(html)).toContain('Phiếu do bạn ghi')
  })

  it('bộ lọc: ô ngày max = hôm nay, chip loại + phương thức, danh mục', () => {
    const html = view({ filters: { ...filters, kind: 'payment', method: 'cash' } })
    expect(html.match(/type="date"[^>]*max="2026-11-09"|max="2026-11-09"[^>]*type="date"/g)?.length).toBe(2)
    expect(html).toMatch(/aria-selected="true"[^>]*>Chi</)
    expect(html).toMatch(/aria-selected="true"[^>]*>Tiền mặt</)
    expect(text(html)).toContain('Tất cả danh mục')
  })

  it('form: Phiếu chi mặc định Tiền mặt; danh mục cần ghi chú thì ô ghi chú bắt buộc', () => {
    const form = (over: Record<string, unknown>) => renderToStaticMarkup(createElement(EntryForm, {
      kind: 'payment', categories, method: 'cash', onMethod: noop, amountText: '50.000', onAmount: noop, categoryId: 'da',
      onCategory: noop, counterparty: '', onCounterparty: noop, note: '', onNote: noop, error: null, busy: false,
      locked: false, notice: null, onSubmit: noop, onCancel: noop, ...over,
    }))
    const html = form({})
    expect(html).toMatch(/aria-checked="true"[^>]*>Tiền mặt</)
    expect(text(html)).toContain('Người nộp / Người nhận')
    expect(html).not.toContain('Nhập hàng') // danh mục hệ thống không ghi tay
    expect(html).not.toContain('Thuê loa') // danh mục đã ẩn
    expect(html).not.toMatch(/type="date"/)
    expect(disabledOf(html, 'Ghi phiếu chi')).toBe(false)
    const needNote = form({ categoryId: 'khac' })
    expect(text(needNote)).toContain('Danh mục này cần ghi chú')
    expect(disabledOf(needNote, 'Ghi phiếu chi')).toBe(true)
    expect(disabledOf(form({ categoryId: 'khac', note: 'mua chổi' }), 'Ghi phiếu chi')).toBe(false)
    expect(disabledOf(form({ amountText: '' }), 'Ghi phiếu chi')).toBe(true)
    expect(text(form({ kind: 'receipt', categoryId: 'nop' }))).toContain('Ghi phiếu thu')
  })

  it('danh mục: dòng hệ thống không có nút Đổi tên / Ẩn; chọn nhóm không có Nhập hàng', () => {
    const list = renderToStaticMarkup(createElement(CategoryList, {
      categories: categories.filter((c) => c.kind === 'payment'), busyId: null, onRename: noop, onToggle: noop,
    }))
    // Dòng Nhập hàng: nhãn Hệ thống, không nút.
    const row = list.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*Nhập hàng(?:(?!<\/li>)[\s\S])*<\/li>/)?.[0] ?? ''
    expect(text(row)).toContain('Hệ thống')
    expect(row).not.toContain('Đổi tên')
    expect(row).not.toContain('Ẩn')
    // Dòng thường có Đổi tên + Ẩn; dòng đã ẩn có Hiện lại.
    expect(disabledOf(list, 'Đổi tên')).toBe(false)
    expect(text(list)).toContain('Hiện lại')
    const create = renderToStaticMarkup(createElement(CategoryCreateForm, { kind: 'payment', busy: false, onCreate: noop }))
    expect(create).not.toContain('Nhập hàng')
    expect(create).toMatch(/<option[^>]*selected=""[^>]*>Chi phí vận hành|<option[^>]*>Chi phí vận hành/)
    const createReceipt = renderToStaticMarkup(createElement(CategoryCreateForm, { kind: 'receipt', busy: false, onCreate: noop }))
    expect(createReceipt).toContain('Thu khác')
    expect(createReceipt).not.toContain('Chi phí vận hành')
  })
})
