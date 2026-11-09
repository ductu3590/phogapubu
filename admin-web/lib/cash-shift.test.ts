import { describe, expect, it } from 'vitest'
import {
  differenceLabel,
  parseCashShiftCloseResult,
  parseCashShiftList,
  parseCashShiftReport,
  parseCashShiftState,
  parseShiftCash,
  shiftDateTimeLabel,
  shiftTimeLabel,
} from './cash-shift'

const entryRaw = {
  id: 'e1', kind: 'payment', method: 'cash', category_name: 'Đá', amount: 10000, note: 'đá cây',
  counterparty: null, source: 'pos_drawer', created_at: '2026-11-09T10:00:00Z', created_by_name: 'Lan', voided_at: null,
}

describe('parseShiftCash', () => {
  it('kiểu Việt Nam', () => {
    expect(parseShiftCash('500.000')).toBe(500000)
    expect(parseShiftCash('500k')).toBe(500000)
    expect(parseShiftCash('1.000.000đ')).toBe(1000000)
  })
  it('0 hợp lệ, rỗng và chữ không', () => {
    expect(parseShiftCash('0')).toBe(0)
    for (const s of ['', '   ', 'abc']) expect(parseShiftCash(s)).toBeNull()
  })
  it('vượt 2.000.000.000 bị chặn', () => {
    expect(parseShiftCash('3000000000')).toBeNull()
    expect(parseShiftCash('2.000.000.000')).toBe(2000000000)
  })
})

it('shiftTimeLabel / shiftDateTimeLabel theo giờ VN, ngày dạng dd/MM', () => {
  expect(shiftTimeLabel('2026-11-09T01:00:00Z')).toBe('08:00')
  expect(shiftDateTimeLabel('2026-11-09T18:30:00Z')).toBe('01:30 10/11')
  expect(shiftDateTimeLabel('rác')).toBe('')
})

it('differenceLabel', () => {
  expect(differenceLabel(0)).toBe('Khớp')
  expect(differenceLabel(-50000)).toBe('Thiếu 50.000đ')
  expect(differenceLabel(20000)).toBe('Thừa 20.000đ')
})

describe('parseCashShiftState', () => {
  it('rác, null, mảng đều ra required false, shift null', () => {
    for (const raw of [null, undefined, 'x', 5, [], [{ required: true }]]) {
      expect(parseCashShiftState(raw)).toEqual({ required: false, canManageEntries: false, shift: null })
    }
  })
  it('đọc đủ ca mở, bỏ phiếu sai hình', () => {
    const s = parseCashShiftState({
      required: true, can_manage_entries: true,
      shift: {
        id: 's1', opened_at: '2026-11-09T01:00:00Z', opened_by_name: 'Lan', opening_cash: 500000, open_note: null,
        stale: true, entries: [entryRaw, null, { id: 5 }, { ...entryRaw, id: 'e2', kind: 'xx' }],
        // Server không trả, nhưng có rác cũng không được lọt ra kiểu.
        expected_cash: 999,
      },
    })
    expect(s).toEqual({
      required: true, canManageEntries: true,
      shift: {
        id: 's1', openedAt: '2026-11-09T01:00:00Z', openedByName: 'Lan', openingCash: 500000, openNote: null, stale: true,
        entries: [{
          id: 'e1', kind: 'payment', method: 'cash', categoryName: 'Đá', amount: 10000, note: 'đá cây', counterparty: null,
          source: 'pos_drawer', createdAt: '2026-11-09T10:00:00Z', createdByName: 'Lan', voidedAt: null,
        }],
      },
    })
    expect(JSON.stringify(s)).not.toContain('999')
  })
  it('shift sai hình (thiếu id) → null, required vẫn giữ', () => {
    expect(parseCashShiftState({ required: true, shift: { opening_cash: 1 } })).toEqual({
      required: true, canManageEntries: false, shift: null,
    })
  })
})

describe('parseCashShiftReport', () => {
  const base = {
    id: 's1', store_id: 'st', status: 'open', opened_at: '2026-11-09T01:00:00Z', closed_at: null,
    opened_by_name: 'Lan', closed_by_name: null, opening_cash: 500000, open_note: 'đầu ca', close_note: null,
    cash_sales: null, bank_sales: null, cash_receipts: null, cash_payments: null, debt_cash: null,
    expected_cash: null, counted_cash: null, difference: null, bills_count: null, carried_days: 1,
    continued_at: null, continued_by_name: null, entries: [entryRaw],
  }
  it('ca mở giữ null, không ép về 0', () => {
    const r = parseCashShiftReport(base)
    expect(r).not.toBeNull()
    for (const k of ['cashSales', 'bankSales', 'cashReceipts', 'cashPayments', 'debtCash', 'expectedCash', 'countedCash',
      'difference', 'billsCount'] as const) {
      expect(r![k]).toBeNull()
    }
    expect(r!.openingCash).toBe(500000)
    expect(r!.status).toBe('open')
    expect(r!.entries).toHaveLength(1)
  })
  it('ca đóng đọc đủ số', () => {
    const r = parseCashShiftReport({
      ...base, status: 'closed', closed_at: '2026-11-09T12:00:00Z', closed_by_name: 'Chủ', cash_sales: 300000,
      bank_sales: 200000, cash_receipts: 100000, cash_payments: 50000, debt_cash: 0, expected_cash: 850000,
      counted_cash: 840000, difference: -10000, bills_count: 3, carried_days: 2, continued_at: '2026-11-09T02:00:00Z',
      continued_by_name: 'Lan', close_note: 'thiếu',
    })
    expect(r).toMatchObject({
      status: 'closed', cashSales: 300000, bankSales: 200000, expectedCash: 850000, countedCash: 840000,
      difference: -10000, billsCount: 3, carriedDays: 2, continuedByName: 'Lan', closeNote: 'thiếu', storeId: 'st',
    })
  })
  it('rác → null', () => {
    for (const raw of [null, [], 'x', { id: 's1' }, { ...base, status: 'weird' }]) expect(parseCashShiftReport(raw)).toBeNull()
  })
})

describe('parseCashShiftList', () => {
  it('đọc danh sách, bỏ dòng sai hình; ca mở để null', () => {
    const r = parseCashShiftList({
      required: true,
      shifts: [
        { id: 'a', status: 'open', opened_at: 't1', closed_at: null, opened_by_name: 'Lan', closed_by_name: null,
          opening_cash: 0, expected_cash: null, counted_cash: null, difference: null },
        { id: 'b', status: 'closed', opened_at: 't0', closed_at: 't2', opened_by_name: null, closed_by_name: 'Chủ',
          opening_cash: 100, expected_cash: 900, counted_cash: 1000, difference: 100 },
        'rác', { status: 'open' },
      ],
    })
    expect(r.required).toBe(true)
    expect(r.shifts).toEqual([
      { id: 'a', status: 'open', openedAt: 't1', closedAt: null, openedByName: 'Lan', closedByName: null, openingCash: 0,
        expectedCash: null, countedCash: null, difference: null },
      { id: 'b', status: 'closed', openedAt: 't0', closedAt: 't2', openedByName: null, closedByName: 'Chủ',
        openingCash: 100, expectedCash: 900, countedCash: 1000, difference: 100 },
    ])
  })
  it('rác → rỗng', () => expect(parseCashShiftList(null)).toEqual({ required: false, shifts: [] }))
})

describe('parseCashShiftCloseResult', () => {
  it('đọc kết quả kết ca', () => {
    expect(parseCashShiftCloseResult({
      ok: true, already: false, shift_id: 's1', opening_cash: 500000, cash_sales: 300000, cash_receipts: 100000,
      cash_payments: 50000, debt_cash: 0, expected_cash: 850000, counted_cash: 840000, difference: -10000,
    })).toEqual({
      shiftId: 's1', already: false, openingCash: 500000, cashSales: 300000, cashReceipts: 100000, cashPayments: 50000,
      debtCash: 0, expectedCash: 850000, countedCash: 840000, difference: -10000,
    })
  })
  it('thiếu số → ném lỗi (không bịa số 0 cho phiếu bàn giao)', () => {
    expect(() => parseCashShiftCloseResult({ shift_id: 's1' })).toThrow()
    expect(() => parseCashShiftCloseResult(null)).toThrow()
  })
})
