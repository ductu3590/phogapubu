import { describe, expect, it } from 'vitest'
import { cashChange, cashSuggestions, formatVndInput, parseVnd } from './cash-change'

describe('parseVnd', () => {
  it('đọc đúng kiểu gõ tiền Việt, không mất 1000 lần', () => {
    expect(parseVnd('80.000')).toBe(80_000)
    expect(parseVnd('1.000.000')).toBe(1_000_000)
    expect(parseVnd('500,000')).toBe(500_000)
    expect(parseVnd('500 000đ')).toBe(500_000)
    expect(parseVnd('500k')).toBe(500_000)
    expect(parseVnd('900')).toBe(900)
  })

  it('rỗng / không có số → null', () => {
    expect(parseVnd('')).toBeNull()
    expect(parseVnd('  ')).toBeNull()
    expect(parseVnd('abc')).toBeNull()
  })
})

describe('cashSuggestions', () => {
  it('vừa đủ + các mệnh giá làm tròn lên, không trùng', () => {
    expect(cashSuggestions(880_000)).toEqual([880_000, 900_000, 1_000_000])
    expect(cashSuggestions(120_000)).toEqual([120_000, 150_000, 200_000, 500_000])
    expect(cashSuggestions(500_000)).toEqual([500_000, 1_000_000])
  })

  it('bill 0đ thì không gợi ý', () => {
    expect(cashSuggestions(0)).toEqual([])
  })
})

describe('cashChange', () => {
  it('tính tiền thối / còn thiếu', () => {
    expect(cashChange(880_000, 1_000_000)).toEqual({ kind: 'ok', change: 120_000 })
    expect(cashChange(880_000, 880_000)).toEqual({ kind: 'ok', change: 0 })
    expect(cashChange(880_000, 800_000)).toEqual({ kind: 'short', missing: 80_000 })
    expect(cashChange(880_000, null)).toEqual({ kind: 'empty' })
  })
})

describe('formatVndInput', () => {
  it('tự chèn dấu chấm ngăn nghìn khi gõ', () => {
    expect(formatVndInput('1')).toBe('1')
    expect(formatVndInput('1200')).toBe('1.200')
    expect(formatVndInput('1200000')).toBe('1.200.000')
    expect(formatVndInput('1.2000')).toBe('12.000')
    expect(formatVndInput('500k')).toBe('500.000')
    expect(formatVndInput('')).toBe('')
    expect(formatVndInput('đ')).toBe('')
  })

  it('xoá bớt chữ số vẫn đúng định dạng', () => {
    expect(formatVndInput('1.200.00')).toBe('120.000')
  })

  it('kết quả đọc lại bằng parseVnd đúng số', () => {
    expect(parseVnd(formatVndInput('1200000'))).toBe(1_200_000)
  })
})
