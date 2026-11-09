import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_CASH_AMOUNT, isObj, kindOf, methodOf, num, sourceOf, str } from './cash-common'

describe('cash-common', () => {
  it('trần tiền khớp mig 122', () => expect(MAX_CASH_AMOUNT).toBe(2_000_000_000))
  it('bộ đọc an toàn', () => {
    expect(isObj({})).toBe(true)
    expect(isObj([])).toBe(false)
    expect(isObj(null)).toBe(false)
    expect(str(1)).toBeNull()
    expect(num(Number.NaN)).toBeNull()
    expect(num(5)).toBe(5)
    expect([kindOf('receipt'), kindOf('x'), methodOf('bank'), methodOf('momo'), sourceOf('pos_drawer'), sourceOf('api')])
      .toEqual(['receipt', null, 'bank', null, 'pos_drawer', null])
  })
  it('cash-shift.ts không import cash-book.ts (chỉ một chiều)', () => {
    const src = readFileSync(new URL('./cash-shift.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/from '\.\/cash-book'/)
  })
  it('ba chỗ dùng trần tiền đều lấy MAX_CASH_AMOUNT, không còn số 2 tỉ viết tay', () => {
    for (const f of ['./cash-shift.ts', './actions/cash-shift.ts', './actions/cash-book.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      expect(src).toContain('MAX_CASH_AMOUNT')
      expect(src).not.toMatch(/2_000_000_000/)
    }
  })
})
