import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CashShiftCloseResult, CashShiftEntry, CashShiftState } from '@/lib/cash-shift'
import type { CashBookCategory } from '@/lib/cash-book'

vi.mock('@/lib/actions/cash-shift', () => ({
  openCashShift: vi.fn(), closeCashShift: vi.fn(), continueStaleShift: vi.fn(), saveRequireCashShift: vi.fn(),
}))
vi.mock('@/lib/actions/cash-book', () => ({ createCashBookEntry: vi.fn(), voidCashBookEntry: vi.fn() }))
vi.mock('@/lib/print/print-document', () => ({ printDocument: vi.fn() }))
const lock = vi.hoisted(() => ({ locked: false }))
vi.mock('@/components/pos-lock', () => ({ usePosLocked: () => lock.locked }))

const {
  ShiftButtons, ShiftPanelBody, CloseShiftForm, CloseShiftResult, ShiftStaleBanner, default: ShiftControls,
  decideShiftDialogs, isShiftAlreadyOpenError,
} = await import('./shift-controls')
const { CashDrawerForm, drawerAmount, drawerCategories, drawerCanSubmit } = await import('./cash-drawer-dialog')
const { isNoOpenShiftError, shouldClearNoShiftError } = await import('@/lib/cash-shift')

const noop = () => {}
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
// Nút (theo chữ trên nút) có thuộc tính disabled không; không thấy nút → null.
const disabledOf = (html: string, label: string): boolean | null => {
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (text(m[2]).includes(label)) return /\sdisabled=""/.test(m[1])
  }
  return null
}

const entry = (over: Partial<CashShiftEntry>): CashShiftEntry => ({
  id: 'e', kind: 'payment', method: 'cash', categoryName: 'Đá', amount: 10000, note: null, counterparty: null,
  source: 'pos_drawer', createdAt: '2026-11-09T03:00:00Z', createdByName: 'Lan', voidedAt: null, ...over,
})
const shiftState = (over: Partial<CashShiftState> = {}): CashShiftState => ({
  required: true, canManageEntries: false,
  shift: {
    id: 'sh1', openedAt: '2026-11-09T01:00:00Z', openedByName: 'Thu ngân Lan', openingCash: 500000, openNote: null,
    stale: false, entries: [],
  },
  ...over,
})

describe('nút ca trên thanh trên', () => {
  it('required false: không vẽ gì, kể cả nút Thu/Chi két', () => {
    expect(render(createElement(ShiftButtons, { state: shiftState({ required: false }), onOpenShift: noop, onShowPanel: noop, onDrawer: noop }))).toBe('')
    expect(render(createElement(ShiftButtons, { state: null, onOpenShift: noop, onShowPanel: noop, onDrawer: noop }))).toBe('')
    // Cả khung ShiftControls cũng rỗng.
    expect(render(createElement(ShiftControls, { state: shiftState({ required: false }), reload: noop, openTablesCount: 0, storeId: 's', request: null }))).toBe('')
  })
  it('chưa có ca: nút Mở ca; nút Thu/Chi két khoá kèm gợi ý Mở ca trước', () => {
    const html = render(createElement(ShiftButtons, { state: shiftState({ shift: null }), onOpenShift: noop, onShowPanel: noop, onDrawer: noop }))
    expect(text(html)).toContain('Mở ca')
    expect(disabledOf(html, 'Thu/Chi két')).toBe(true)
    expect(disabledOf(html, 'Mở ca')).toBe(false)
    expect(html).toContain('Mở ca trước')
  })
  it('có ca: nút Ca thu ngân · từ HH:MM và nút Thu/Chi két', () => {
    const html = render(createElement(ShiftButtons, { state: shiftState(), onOpenShift: noop, onShowPanel: noop, onDrawer: noop }))
    expect(text(html)).toContain('Ca thu ngân · từ 08:00')
    expect(text(html)).toContain('Thu/Chi két')
    expect(disabledOf(html, 'Thu/Chi két')).toBe(false)
  })
})

describe('panel ca', () => {
  const entries = [
    entry({ id: 'r', kind: 'receipt', categoryName: 'Nộp thêm vào két', amount: 100000 }),
    entry({ id: 'p', kind: 'payment', categoryName: 'Đá', amount: 50000, note: 'đá cây' }),
    entry({ id: 'v', kind: 'payment', categoryName: 'Đi chợ', amount: 20000, voidedAt: '2026-11-09T04:00:00Z' }),
  ]
  const shift = { ...shiftState().shift!, entries }
  it('phiếu thu TM hiện +, phiếu chi TM hiện −, phiếu huỷ gạch ngang; nút Huỷ chỉ khi canManageEntries', () => {
    const html = render(createElement(ShiftPanelBody, { shift, canManageEntries: false, onVoid: noop, onDrawer: noop, onCloseShift: noop }))
    expect(text(html)).toContain('+100.000đ')
    expect(text(html)).toContain('−50.000đ')
    expect(html).toMatch(/line-through[^>]*>[\s\S]*Đi chợ/)
    expect(text(html)).toContain('Thu ngân Lan')
    expect(text(html)).toContain('500.000đ')
    expect(html).not.toMatch(/>Huỷ phiếu</)
    const manage = render(createElement(ShiftPanelBody, { shift, canManageEntries: true, onVoid: noop, onDrawer: noop, onCloseShift: noop }))
    // Hai phiếu còn hiệu lực có nút huỷ, phiếu đã huỷ thì không.
    expect(manage.match(/>Huỷ phiếu</g)).toHaveLength(2)
    expect(text(manage)).toContain('Thu/Chi két')
    expect(text(manage)).toContain('Kết ca')
  })
  it('phiếu chi từ phiếu nhập kho: không có nút Huỷ phiếu, ghi "Huỷ ở trang Kho" (kể cả chủ quán / quản lý)', () => {
    const kho = { ...shiftState().shift!, entries: [
      entry({ id: 'k', source: 'inventory_receipt', categoryName: 'Nhập hàng', amount: 300000 }),
      entry({ id: 'n', amount: 1000 }),
    ] }
    const html = render(createElement(ShiftPanelBody, { shift: kho, canManageEntries: true, onVoid: noop, onDrawer: noop, onCloseShift: noop }))
    expect(html.match(/>Huỷ phiếu</g)).toHaveLength(1)
    const row = html.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*Nhập hàng(?:(?!<\/li>)[\s\S])*<\/li>/)?.[0] ?? ''
    expect(text(row)).toContain('Huỷ ở trang Kho')
    expect(row).not.toContain('>Huỷ phiếu<')
  })
  it('ca chưa có phiếu: câu rỗng', () => {
    const html = render(createElement(ShiftPanelBody, { shift: shiftState().shift!, canManageEntries: false, onVoid: noop, onDrawer: noop, onCloseShift: noop }))
    expect(text(html)).toContain('Chưa có phiếu thu / chi tiền mặt trong ca')
  })
})

describe('kết ca', () => {
  it('form kết ca không chứa số dự kiến trước khi xác nhận', () => {
    const html = render(createElement(CloseShiftForm, {
      countedText: '', note: '', onCounted: noop, onNote: noop, openTablesCount: 0, error: null,
    }))
    expect(text(html)).toContain('Tiền đếm được')
    expect(text(html)).not.toMatch(/dự kiến|chênh lệch/i)
  })
  it('kết quả: dự kiến, đếm được, Thiếu 50.000đ, dòng Phiếu thu / Phiếu chi', () => {
    const result: CashShiftCloseResult = {
      shiftId: 'sh1', already: false, openingCash: 500000, cashSales: 300000, cashReceipts: 100000, cashPayments: 50000,
      debtCash: 0, expectedCash: 850000, countedCash: 800000, difference: -50000,
    }
    const t = text(render(createElement(CloseShiftResult, { result })))
    for (const s of ['Tiền đầu ca', '500.000đ', 'Tiền mặt bán', '300.000đ', 'Phiếu thu', '+100.000đ', 'Phiếu chi',
      '−50.000đ', 'Tiền dự kiến', '850.000đ', 'Tiền đếm được', '800.000đ', 'Thiếu 50.000đ']) {
      expect(t).toContain(s)
    }
    expect(t).not.toContain('Thu nợ')
    expect(text(render(createElement(CloseShiftResult, { result: { ...result, debtCash: 20000 } })))).toContain('Thu nợ tiền mặt')
  })
  it('còn 3 bàn mở: Còn 3 bàn đang mở. Tiền thu sau khi kết sẽ vào ca kế tiếp.', () => {
    const html = render(createElement(CloseShiftForm, {
      countedText: '', note: '', onCounted: noop, onNote: noop, openTablesCount: 3, error: null,
    }))
    expect(text(html)).toContain('Còn 3 bàn đang mở. Tiền thu sau khi kết sẽ vào ca kế tiếp.')
    const none = render(createElement(CloseShiftForm, {
      countedText: '', note: '', onCounted: noop, onNote: noop, openTablesCount: 0, error: null,
    }))
    expect(text(none)).not.toContain('bàn đang mở')
  })
})

describe('banner ca quên kết', () => {
  it('banner stale có đủ hai lựa chọn', () => {
    const stale = shiftState({ shift: { ...shiftState().shift!, stale: true } })
    const t = text(render(createElement(ShiftStaleBanner, { state: stale, onCloseOld: noop, onContinue: noop })))
    expect(t).toContain('chưa kết')
    expect(t).toContain('Kết ca cũ rồi mở ca mới')
    expect(t).toContain('Tiếp tục gộp vào ca đó')
    expect(render(createElement(ShiftStaleBanner, { state: shiftState(), onCloseOld: noop, onContinue: noop }))).toBe('')
    expect(render(createElement(ShiftStaleBanner, { state: null, onCloseOld: noop, onContinue: noop }))).toBe('')
  })
})

describe('hộp Thu/Chi két', () => {
  const cat = (over: Partial<CashBookCategory>): CashBookCategory => ({
    id: 'c', kind: 'payment', name: 'Đá', reportGroup: 'operating_expense', isSystem: false, isActive: true,
    requiresNote: false, sortOrder: 10, ...over,
  })
  const categories = [
    cat({ id: 'nhap', name: 'Nhập hàng', reportGroup: 'inventory_purchase', isSystem: true }),
    cat({ id: 'da', name: 'Đá', sortOrder: 40 }),
    cat({ id: 'khac', name: 'Khác', requiresNote: true, sortOrder: 80 }),
    cat({ id: 'an', name: 'Đã ẩn', isActive: false }),
    cat({ id: 'nop', kind: 'receipt', name: 'Nộp thêm vào két', reportGroup: 'cash_transfer', sortOrder: 10 }),
    cat({ id: 'thukhac', kind: 'receipt', name: 'Thu khác', reportGroup: 'other_income', requiresNote: true, sortOrder: 20 }),
  ]
  const form = (over: Record<string, unknown>) => render(createElement(CashDrawerForm, {
    categories, kind: 'payment', onKind: noop, amountText: '10.000', onAmount: noop, categoryId: 'da', onCategory: noop,
    note: '', onNote: noop, error: null, busy: false, onSubmit: noop, onCancel: noop, ...over,
  }))
  it('đổi Thu ↔ Chi thì danh sách danh mục đổi theo loại; danh mục cần ghi chú mà ghi chú trống thì nút khoá', () => {
    expect(drawerCategories(categories, 'payment').map((c) => c.id)).toEqual(['da', 'khac'])
    expect(drawerCategories(categories, 'receipt').map((c) => c.id)).toEqual(['nop', 'thukhac'])
    const pay = form({})
    expect(pay).toContain('Đá')
    expect(pay).not.toContain('Nộp thêm vào két')
    expect(pay).not.toContain('Nhập hàng')
    const rec = form({ kind: 'receipt', categoryId: 'nop' })
    expect(rec).toContain('Nộp thêm vào két')
    expect(rec).not.toMatch(/<option[^>]*>Đá</)
    // Khác cần ghi chú.
    expect(drawerCanSubmit({ categories, kind: 'payment', amountText: '10.000', categoryId: 'khac', note: '  ' })).toBe(false)
    expect(drawerCanSubmit({ categories, kind: 'payment', amountText: '10.000', categoryId: 'khac', note: 'chổi' })).toBe(true)
    expect(disabledOf(form({ categoryId: 'khac', note: '' }), 'Ghi phiếu chi')).toBe(true)
    expect(disabledOf(form({ categoryId: 'khac', note: 'chổi' }), 'Ghi phiếu chi')).toBe(false)
    // Danh mục không thuộc loại đang chọn: không cho ghi.
    expect(drawerCanSubmit({ categories, kind: 'receipt', amountText: '10.000', categoryId: 'da', note: '' })).toBe(false)
  })
  it('ô tiền rỗng khoá nút; 80.000 ra 80000', () => {
    expect(drawerAmount('80.000')).toBe(80000)
    expect(drawerAmount('')).toBeNull()
    expect(drawerAmount('0')).toBeNull()
    expect(drawerAmount('3.000.000.000')).toBeNull()
    expect(disabledOf(form({ amountText: '' }), 'Ghi phiếu chi')).toBe(true)
    expect(disabledOf(form({}), 'Ghi phiếu chi')).toBe(false)
    expect(form({ kind: 'receipt', categoryId: 'nop' })).toContain('Ghi phiếu thu')
  })
})

it('isNoOpenShiftError nhận câu Chưa mở ca của server', () => {
  expect(isNoOpenShiftError('Chưa mở ca')).toBe(true)
  expect(isNoOpenShiftError('Số tiền không khớp bill')).toBe(false)
  expect(isNoOpenShiftError(null)).toBe(false)
})

describe('fix round 1', () => {
  const noShift = shiftState({ shift: null })
  it('khoá PIN: không tự bật hộp mở ca, cũng không xử lý yêu cầu mở; mở khoá xong mới bật', () => {
    const base = { state: noShift, autoChecked: false, request: { kind: 'open' as const, n: 7 }, seenRequest: null }
    // Đang khoá: không đổi gì (giữ autoChecked false, seenRequest null để lần vẽ sau còn xử lý).
    expect(decideShiftDialogs({ ...base, locked: true })).toBeNull()
    // Mở khoá: bật hộp, đánh dấu đã xử lý.
    expect(decideShiftDialogs({ ...base, locked: false })).toEqual({ autoChecked: true, seenRequest: 7, open: true, closeShiftId: null })
    // Yêu cầu kết ca cũ cũng hoãn khi đang khoá.
    const close = { state: shiftState(), autoChecked: true, request: { kind: 'close' as const, n: 9 }, seenRequest: 7 }
    expect(decideShiftDialogs({ ...close, locked: true })).toBeNull()
    expect(decideShiftDialogs({ ...close, locked: false })).toEqual({ autoChecked: true, seenRequest: 9, open: false, closeShiftId: 'sh1' })
    // Đã có ca: tự kiểm một lần nhưng không bật hộp mở ca.
    expect(decideShiftDialogs({ locked: false, state: shiftState(), autoChecked: false, request: null, seenRequest: null }))
      .toEqual({ autoChecked: true, seenRequest: null, open: false, closeShiftId: null })
  })
  it('vẽ thật: đang khoá thì không có hộp Mở ca thu ngân; mở khoá thì có', () => {
    const props = { state: noShift, reload: noop, openTablesCount: 0, storeId: 's', request: null }
    lock.locked = true
    try {
      expect(render(createElement(ShiftControls, props))).not.toContain('Mở ca thu ngân')
    } finally {
      lock.locked = false
    }
    expect(render(createElement(ShiftControls, props))).toContain('Mở ca thu ngân')
  })
  it('"Đã có ca đang mở" được nhận ra để giữ hộp và báo', () => {
    expect(isShiftAlreadyOpenError('Đã có ca đang mở')).toBe(true)
    expect(isShiftAlreadyOpenError('Số tiền không hợp lệ')).toBe(false)
  })
  it('băng lỗi "Chưa mở ca" tự bỏ khi lần đọc ca thấy ca đang mở', () => {
    const err = { message: 'Chưa mở ca' }
    expect(shouldClearNoShiftError(err, shiftState())).toBe(true)
    expect(shouldClearNoShiftError(err, noShift)).toBe(false)
    expect(shouldClearNoShiftError({ message: 'Số tiền không khớp bill' }, shiftState())).toBe(false)
    expect(shouldClearNoShiftError(null, shiftState())).toBe(false)
  })
  describe('hộp Thu/Chi két sau lỗi mạng / phiếu đã ghi', () => {
    const categories: CashBookCategory[] = [{
      id: 'da', kind: 'payment', name: 'Đá', reportGroup: 'operating_expense', isSystem: false, isActive: true,
      requiresNote: false, sortOrder: 40,
    }]
    const form = (over: Record<string, unknown>) => render(createElement(CashDrawerForm, {
      categories, kind: 'payment', onKind: noop, amountText: '80.000', onAmount: noop, categoryId: 'da', onCategory: noop,
      note: '', onNote: noop, error: null, busy: false, onSubmit: noop, onCancel: noop, ...over,
    }))
    it('khoá sau lỗi mạng: mọi ô khoá, chỉ còn Ghi lại', () => {
      const html = form({ locked: true, error: 'Lỗi kết nối.' })
      expect(html).toMatch(/<input[^>]*id="drawer-amount"[^>]*disabled=""|<input[^>]*disabled=""[^>]*id="drawer-amount"/)
      expect(html).toMatch(/<select[^>]*disabled=""/)
      expect(html).toMatch(/<textarea[^>]*disabled=""/)
      expect(disabledOf(html, 'Thu')).toBe(true)
      expect(disabledOf(html, 'Ghi lại')).toBe(false)
      expect(text(html)).not.toContain('Ghi phiếu chi')
    })
    it('phiếu đã ghi trước đó: hiện câu báo kèm số tiền, chỉ còn nút Đóng', () => {
      const html = form({ notice: 'Phiếu chi 80.000đ đã được ghi ở lần bấm trước — không ghi thêm.' })
      expect(text(html)).toContain('Phiếu chi 80.000đ đã được ghi ở lần bấm trước')
      expect(disabledOf(html, 'Đóng')).toBe(false)
      expect(disabledOf(html, 'Ghi phiếu chi')).toBeNull()
      expect(disabledOf(html, 'Huỷ')).toBeNull()
    })
  })
})
