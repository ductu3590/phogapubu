import { describe, expect, it } from 'vitest'
import {
  REPORT_GROUP_LABEL,
  filtersToRpc,
  filtersToSearch,
  cashEntryVoidable,
  groupByCategory,
  parseCashBookCategories,
  parseCashBookList,
  parseCashbookFilters,
  userReportGroups,
  type CashbookFilters,
} from './cash-book'
import type { CashShiftEntry } from './cash-shift'

const UUID = '11111111-2222-3333-4444-555555555555'

describe('parseCashBookList', () => {
  const raw = {
    entries: [
      {
        id: 'e1', kind: 'payment', method: 'cash', category_id: 'c1', category_name: 'Đá', report_group: 'operating_expense',
        amount: 10000, note: null, counterparty: 'Anh Ba', business_date: '2026-11-09', created_at: '2026-11-09T03:00:00Z',
        created_by_name: 'Lan', cash_shift_id: 's1', shift_opened_at: '2026-11-09T01:00:00Z', source: 'pos_drawer',
        source_ref: null, voided_at: null, voided_by_name: null, void_reason: null,
      },
      { id: 'bad', kind: 'payment' },
      null,
    ],
    totals: { receipt_cash: 100, receipt_bank: 50, payment_cash: 30, payment_bank: 200 },
    truncated: true,
  }
  it('totals tính receiptTotal, paymentTotal, net = thu − chi', () => {
    const r = parseCashBookList(raw)
    expect(r.totals).toEqual({
      receiptCash: 100, receiptBank: 50, paymentCash: 30, paymentBank: 200, receiptTotal: 150, paymentTotal: 230, net: -80,
    })
    expect(r.truncated).toBe(true)
  })
  it('đọc phiếu camelCase, bỏ dòng sai hình', () => {
    const r = parseCashBookList(raw)
    expect(r.entries).toEqual([{
      id: 'e1', kind: 'payment', method: 'cash', categoryId: 'c1', categoryName: 'Đá', reportGroup: 'operating_expense',
      amount: 10000, note: null, counterparty: 'Anh Ba', businessDate: '2026-11-09', createdAt: '2026-11-09T03:00:00Z',
      createdByName: 'Lan', cashShiftId: 's1', shiftOpenedAt: '2026-11-09T01:00:00Z', source: 'pos_drawer', sourceRef: null,
      voidedAt: null, voidedByName: null, voidReason: null,
    }])
  })
  it('rác → rỗng, totals 0', () => {
    expect(parseCashBookList(null)).toEqual({
      entries: [],
      totals: { receiptCash: 0, receiptBank: 0, paymentCash: 0, paymentBank: 0, receiptTotal: 0, paymentTotal: 0, net: 0 },
      truncated: false,
    })
  })
})

describe('parseCashBookCategories', () => {
  it('đọc hàng bảng, bỏ hàng sai hình', () => {
    expect(parseCashBookCategories([
      { id: 'c1', kind: 'payment', name: 'Nhập hàng', report_group: 'inventory_purchase', is_system: true, is_active: true,
        requires_note: false, sort_order: 10 },
      { id: 'c2', kind: 'receipt', name: 'Thu khác', report_group: 'other_income', is_system: false, is_active: false,
        requires_note: true, sort_order: 20 },
      { id: 'c3', kind: 'payment', name: 'X', report_group: 'lạ' },
      'rác',
    ])).toEqual([
      { id: 'c1', kind: 'payment', name: 'Nhập hàng', reportGroup: 'inventory_purchase', isSystem: true, isActive: true,
        requiresNote: false, sortOrder: 10 },
      { id: 'c2', kind: 'receipt', name: 'Thu khác', reportGroup: 'other_income', isSystem: false, isActive: false,
        requiresNote: true, sortOrder: 20 },
    ])
    expect(parseCashBookCategories(null)).toEqual([])
  })
})

describe('parseCashbookFilters', () => {
  const today = '2026-11-09'
  it('mặc định hôm nay', () => {
    expect(parseCashbookFilters({}, today)).toEqual({ from: today, to: today, kind: null, method: null, categoryId: null })
  })
  it('to tương lai kẹp về hôm nay; from tương lai cũng vậy', () => {
    expect(parseCashbookFilters({ from: '2026-11-01', to: '2026-12-01' }, today)).toMatchObject({ from: '2026-11-01', to: today })
    expect(parseCashbookFilters({ from: '2026-12-01', to: '2026-12-05' }, today)).toMatchObject({ from: today, to: today })
  })
  it('from > to đổi chỗ', () => {
    expect(parseCashbookFilters({ from: '2026-11-08', to: '2026-11-01' }, today)).toMatchObject({ from: '2026-11-01', to: '2026-11-08' })
  })
  it('khoảng > 92 ngày cắt from', () => {
    expect(parseCashbookFilters({ from: '2026-01-01', to: '2026-11-09' }, today)).toMatchObject({ from: '2026-08-09', to: today })
  })
  it('ngày sai dạng hoặc không có thật → hôm nay', () => {
    expect(parseCashbookFilters({ from: '2026-02-30', to: 'abc' }, today)).toMatchObject({ from: today, to: today })
  })
  it('kind/method lạ bỏ qua; category phải là uuid', () => {
    expect(parseCashbookFilters({ kind: 'transfer', method: 'momo', category: 'abc' }, today))
      .toMatchObject({ kind: null, method: null, categoryId: null })
    expect(parseCashbookFilters({ kind: 'receipt', method: 'bank', category: UUID }, today))
      .toMatchObject({ kind: 'receipt', method: 'bank', categoryId: UUID })
  })
})

describe('filtersToSearch / filtersToRpc', () => {
  const today = '2026-11-09'
  it('filtersToSearch rồi parse lại ra đúng bộ lọc', () => {
    const cases: CashbookFilters[] = [
      { from: '2026-11-01', to: '2026-11-09', kind: 'payment', method: 'cash', categoryId: UUID },
      { from: today, to: today, kind: null, method: null, categoryId: null },
    ]
    for (const f of cases) {
      const sp = Object.fromEntries(new URLSearchParams(filtersToSearch(f)))
      expect(parseCashbookFilters(sp, today)).toEqual(f)
    }
    expect(filtersToSearch(cases[1])).toBe('from=2026-11-09&to=2026-11-09')
  })
  it('filtersToRpc chỉ có khoá đang lọc', () => {
    expect(filtersToRpc({ from: today, to: today, kind: null, method: null, categoryId: null })).toEqual({})
    expect(filtersToRpc({ from: today, to: today, kind: 'receipt', method: 'bank', categoryId: UUID }))
      .toEqual({ kind: 'receipt', method: 'bank', category_id: UUID })
  })
})

describe('nhóm báo cáo', () => {
  it('userReportGroups: chi không có inventory_purchase; thu chỉ other_income, cash_transfer', () => {
    expect(userReportGroups('payment')).toEqual(['operating_expense', 'owner_draw', 'cash_transfer'])
    expect(userReportGroups('receipt')).toEqual(['other_income', 'cash_transfer'])
  })
  it('mọi nhóm có nhãn tiếng Việt', () => {
    for (const g of ['operating_expense', 'inventory_purchase', 'owner_draw', 'other_income', 'cash_transfer'] as const) {
      expect(REPORT_GROUP_LABEL[g].length).toBeGreaterThan(0)
    }
  })
})

describe('groupByCategory', () => {
  const e = (over: Partial<CashShiftEntry>): CashShiftEntry => ({
    id: Math.random().toString(), kind: 'payment', method: 'cash', categoryName: 'Đá', amount: 1000, note: null,
    counterparty: null, source: 'pos_drawer', createdAt: '2026-11-09T01:00:00Z', createdByName: null, voidedAt: null, ...over,
  })
  it('gom theo loại + danh mục, bỏ phiếu đã huỷ; thu trước, chi sau, tiền lớn trước', () => {
    expect(groupByCategory([
      e({ amount: 1000 }), e({ amount: 2000 }), e({ amount: 9999, voidedAt: '2026-11-09T02:00:00Z' }),
      e({ categoryName: 'Đi chợ', amount: 50000 }),
      e({ kind: 'receipt', categoryName: 'Nộp thêm vào két', amount: 300 }),
    ])).toEqual([
      { kind: 'receipt', categoryName: 'Nộp thêm vào két', total: 300, count: 1 },
      { kind: 'payment', categoryName: 'Đi chợ', total: 50000, count: 1 },
      { kind: 'payment', categoryName: 'Đá', total: 3000, count: 2 },
    ])
  })
})

describe('cashEntryVoidable', () => {
  it('chỉ người quản lý sổ, phiếu chưa huỷ, không phải phiếu nhập kho', () => {
    const base = { source: 'manual' as const, voidedAt: null }
    expect(cashEntryVoidable(base, true)).toBe(true)
    expect(cashEntryVoidable(base, false)).toBe(false)
    expect(cashEntryVoidable({ ...base, voidedAt: '2026-11-09T01:00:00Z' }, true)).toBe(false)
    expect(cashEntryVoidable({ source: 'inventory_receipt', voidedAt: null }, true)).toBe(false)
    expect(cashEntryVoidable({ source: 'pos_drawer', voidedAt: null }, true)).toBe(true)
  })
})
