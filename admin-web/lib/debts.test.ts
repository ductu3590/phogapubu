import { describe, expect, it } from 'vitest'
import {
  allocateDebt,
  debtChoiceError,
  debtKindLabel,
  filterDebtCustomers,
  normalizeDebtPhone,
  parseDebtCustomerDetail,
  parseDebtList,
  parseDebtShiftSummary,
  type DebtBill,
  type DebtCustomerSummary,
} from './debts'

describe('normalizeDebtPhone', () => {
  it('khớp SQL', () => {
    expect(normalizeDebtPhone('+84 912 345 678')).toEqual({ phone: '0912345678', error: null })
    expect(normalizeDebtPhone('0912.345.678')).toEqual({ phone: '0912345678', error: null })
    expect(normalizeDebtPhone('   ')).toEqual({ phone: null, error: null })
    expect(normalizeDebtPhone('12ab')).toEqual({ phone: null, error: 'SĐT không hợp lệ' })
  })
  // Cùng các ca của test SQL debt_normalize_phone (mig 123).
  it('các ca khác của SQL', () => {
    expect(normalizeDebtPhone('84-912345678')).toEqual({ phone: '0912345678', error: null })
    expect(normalizeDebtPhone('0212 3456 789')).toEqual({ phone: '02123456789', error: null })
    expect(normalizeDebtPhone('')).toEqual({ phone: null, error: null })
    for (const bad of ['12345', '0912', '+1 650 555 0100', '091234567890']) {
      expect(normalizeDebtPhone(bad)).toEqual({ phone: null, error: 'SĐT không hợp lệ' })
    }
  })
})

describe('allocateDebt', () => {
  const bills = [
    { billPaymentId: 'b2', collectedAt: '2026-11-02T12:00:00Z', outstanding: 300_000 },
    { billPaymentId: 'b1', collectedAt: '2026-11-01T12:00:00Z', outstanding: 200_000 },
    { billPaymentId: 'b3', collectedAt: '2026-11-03T12:00:00Z', outstanding: 150_000 },
  ] as DebtBill[]
  it('cũ nhất trước', () => {
    expect(allocateDebt(bills, 350_000, null)).toEqual({ allocations: [{ billPaymentId: 'b1', amount: 200_000 }, { billPaymentId: 'b2', amount: 150_000 }], error: null })
  })
  it('chỉ bill được tick; trả quá báo lỗi giống server', () => {
    expect(allocateDebt(bills, 150_000, ['b3']).allocations).toEqual([{ billPaymentId: 'b3', amount: 150_000 }])
    expect(allocateDebt(bills, 200_000, ['b3'])).toEqual({ allocations: [], error: 'Số tiền trả vượt số nợ: còn nợ 150.000đ' })
    expect(allocateDebt(bills, 0, null).error).toBe('Nhập số tiền khách trả')
  })
  it('bỏ bill đã trả hết; cùng giờ thì theo mã bill; số lẻ / âm báo lỗi', () => {
    const more = [
      ...bills,
      { billPaymentId: 'b0', collectedAt: '2026-11-01T12:00:00Z', outstanding: 0 },
      { billPaymentId: 'a9', collectedAt: '2026-11-01T12:00:00Z', outstanding: 10_000 },
    ] as DebtBill[]
    expect(allocateDebt(more, 670_000, null).error).toBe('Số tiền trả vượt số nợ: còn nợ 660.000đ')
    expect(allocateDebt(more, 20_000, null).allocations).toEqual([{ billPaymentId: 'a9', amount: 10_000 }, { billPaymentId: 'b1', amount: 10_000 }])
    expect(allocateDebt(bills, -1, null).error).toBe('Nhập số tiền khách trả')
    expect(allocateDebt(bills, 1.5, null).error).toBe('Nhập số tiền khách trả')
    expect(allocateDebt(bills, 1000, []).error).toBe('Chọn ít nhất một bill')
  })
})

it('filterDebtCustomers: không dấu, theo SĐT, lọc còn nợ và đang dùng', () => {
  const list = [
    { id: 'a', name: 'Công ty Hoà Bình', phone: '0912345678', isActive: true, outstanding: 5 },
    { id: 'b', name: 'Anh Long', phone: null, isActive: false, outstanding: 0 },
  ] as DebtCustomerSummary[]
  expect(filterDebtCustomers(list, 'hoa binh', { onlyOpen: false, activeOnly: false }).map((c) => c.id)).toEqual(['a'])
  expect(filterDebtCustomers(list, '345', { onlyOpen: false, activeOnly: false }).map((c) => c.id)).toEqual(['a'])
  expect(filterDebtCustomers(list, '', { onlyOpen: false, activeOnly: true }).map((c) => c.id)).toEqual(['a'])
  expect(filterDebtCustomers(list, '', { onlyOpen: true, activeOnly: false }).map((c) => c.id)).toEqual(['a'])
  // Gõ SĐT có dấu cách / +84 vẫn tìm ra.
  expect(filterDebtCustomers(list, '0912 345', { onlyOpen: false, activeOnly: false }).map((c) => c.id)).toEqual(['a'])
  expect(filterDebtCustomers(list, '+84 912', { onlyOpen: false, activeOnly: false }).map((c) => c.id)).toEqual(['a'])
})

it('debtChoiceError', () => {
  expect(debtChoiceError(null)).toBe('Chọn khách ghi nợ')
  expect(debtChoiceError({ kind: 'new', customer: { name: ' ', phone: null, kind: 'person' } })).toBe('Nhập tên khách')
  expect(debtChoiceError({ kind: 'new', customer: { name: 'A', phone: '12', kind: 'person' } })).toBe('SĐT không hợp lệ')
  expect(debtChoiceError({ kind: 'existing', id: 'x', name: 'A' })).toBeNull()
  expect(debtChoiceError({ kind: 'new', customer: { name: 'x'.repeat(121), phone: null, kind: 'person' } })).toBe('Tên khách nợ quá dài')
  expect(debtChoiceError({ kind: 'new', customer: { name: 'A', phone: '0912 345 678', kind: 'company' } })).toBeNull()
})

it('parseDebtCustomerDetail: rác an toàn, số ép kiểu', () => {
  expect(parseDebtCustomerDetail(null)).toBeNull()
  const d = parseDebtCustomerDetail({ customer: { id: 'c', name: 'A', outstanding: '650000' }, bills: [{ bill_payment_id: 'b', outstanding: '200000' }], payments: [] })
  expect([d?.customer.outstanding, d?.bills[0].outstanding, d?.customer.kind]).toEqual([650000, 200000, 'person'])
})

describe('đọc JSON server (thêm ngoài plan)', () => {
  it('parseDebtList: đổi tên trường, bỏ dòng không có id', () => {
    expect(parseDebtList(null)).toEqual([])
    const list = parseDebtList({ customers: [
      { id: 'c1', name: 'Cty', phone: '0912', kind: 'company', note: 'n', is_active: true, outstanding: '650000', open_bills: 2,
        oldest_open_at: '2026-11-01T12:00:00Z', last_payment_at: null },
      { name: 'không id' },
      'rác',
    ] })
    expect(list).toEqual([{ id: 'c1', name: 'Cty', phone: '0912', kind: 'company', note: 'n', isActive: true, outstanding: 650000,
      openBills: 2, oldestOpenAt: '2026-11-01T12:00:00Z', lastPaymentAt: null }])
  })
  it('parseDebtCustomerDetail: bills + payments đủ trường', () => {
    const d = parseDebtCustomerDetail({
      customer: { id: 'c', name: 'A', kind: 'company', is_active: false },
      bills: [{ bill_payment_id: 'b', collected_at: 't', business_date: '2026-11-01', table_label: 'Bàn 1', session_ids: ['s', 1],
        bill_total: 500000, debt_amount: 300000, paid_amount: 100000, outstanding: 200000 }],
      payments: [{ id: 'p', amount: 100000, method: 'bank', business_date: '2026-11-02', created_at: 't2', created_by_name: 'Lan',
        note: null, voided_at: 't3', void_reason: 'nhầm', voided_by_name: 'Chủ', allocations: [{ bill_payment_id: 'b', amount: '100000' }] }],
    })
    expect(d?.customer).toMatchObject({ kind: 'company', isActive: false, phone: null, outstanding: 0 })
    expect(d?.bills[0]).toEqual({ billPaymentId: 'b', collectedAt: 't', businessDate: '2026-11-01', tableLabel: 'Bàn 1', sessionIds: ['s'],
      billTotal: 500000, debtAmount: 300000, paidAmount: 100000, outstanding: 200000 })
    expect(d?.payments[0]).toEqual({ id: 'p', amount: 100000, method: 'bank', businessDate: '2026-11-02', createdAt: 't2',
      createdByName: 'Lan', note: null, voidedAt: 't3', voidReason: 'nhầm', voidedByName: 'Chủ',
      allocations: [{ billPaymentId: 'b', amount: 100000 }] })
    expect(parseDebtCustomerDetail({ customer: {} })).toBeNull()
  })
  it('parseDebtShiftSummary', () => {
    expect(parseDebtShiftSummary(null)).toBeNull()
    expect(parseDebtShiftSummary({ debt_recorded: '300000', debt_cash: 250000, debt_bank: null }))
      .toEqual({ debtRecorded: 300000, debtCash: 250000, debtBank: 0 })
  })
  it('debtKindLabel', () => {
    expect([debtKindLabel('company'), debtKindLabel('person')]).toEqual(['Cơ quan', 'Cá nhân'])
  })
})

describe('fold-in sau review Task 4', () => {
  const bills = [
    { billPaymentId: 'b1', collectedAt: '2026-11-01T19:00:00+07:00', outstanding: 200_000 },
    { billPaymentId: 'b2', collectedAt: '2026-11-02T19:00:00+07:00', outstanding: 0 },
  ] as DebtBill[]
  it('allocateDebt: bill tick không có trong danh sách hoặc đã trả hết → câu lỗi của server', () => {
    const err = 'Bill không thuộc khách này hoặc đã trả hết'
    expect(allocateDebt(bills, 1000, ['zz'])).toEqual({ allocations: [], error: err })
    expect(allocateDebt(bills, 1000, ['b1', 'b2'])).toEqual({ allocations: [], error: err })
    expect(allocateDebt(bills, 1000, ['b1']).allocations).toEqual([{ billPaymentId: 'b1', amount: 1000 }])
  })
  it('allocateDebt: giờ có phần lẻ giây vẫn đúng thứ tự', () => {
    const t = [
      { billPaymentId: 'x', collectedAt: '2026-11-01T19:00:00.5+07:00', outstanding: 10 },
      { billPaymentId: 'y', collectedAt: '2026-11-01T19:00:00+07:00', outstanding: 10 },
    ] as DebtBill[]
    expect(allocateDebt(t, 10, null).allocations).toEqual([{ billPaymentId: 'y', amount: 10 }])
  })
  it('parseDebtCustomerDetail: bỏ bill / lần trả không có mã', () => {
    const d = parseDebtCustomerDetail({ customer: { id: 'c', name: 'A' },
      bills: [{ bill_payment_id: '' }, { outstanding: 5 }, { bill_payment_id: 'b', outstanding: 5 }],
      payments: [{ amount: 1 }, { id: 'p', amount: 2 }] })
    expect(d?.bills.map((b) => b.billPaymentId)).toEqual(['b'])
    expect(d?.payments.map((p) => p.id)).toEqual(['p'])
  })
})

describe('fix round 1: đầu vào lạ không ném', () => {
  it('debtChoiceError với tên / SĐT / loại không phải chuỗi', () => {
    const bad = (customer: unknown) => debtChoiceError({ kind: 'new', customer } as never)
    expect(bad({ name: 5, phone: null, kind: 'person' })).toBe('Nhập tên khách')
    expect(bad({ name: 'A', phone: 912345678, kind: 'person' })).toBe('SĐT không hợp lệ')
    expect(bad({ name: 'A', phone: null, kind: 'vip' })).toBe('Loại khách không hợp lệ')
    expect(bad(null)).toBe('Thông tin khách nợ không hợp lệ')
    expect(bad('x')).toBe('Thông tin khách nợ không hợp lệ')
    expect(debtChoiceError({ kind: 'existing', id: 5, name: 'A' } as never)).toBe('Chọn khách ghi nợ')
    expect(normalizeDebtPhone(123 as never)).toEqual({ phone: null, error: 'SĐT không hợp lệ' })
  })
})
