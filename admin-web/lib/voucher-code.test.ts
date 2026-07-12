import { describe, it, expect } from 'vitest'
import { generateShipperCode, SHIPPER_CODE_ALPHABET } from './voucher-code'

describe('generateShipperCode', () => {
  it('đúng định dạng SHIP-XXXXXX (6 ký tự alphabet an toàn)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateShipperCode()
      expect(code).toMatch(/^SHIP-[A-Z2-9]{6}$/)
      for (const ch of code.slice(5)) {
        expect(SHIPPER_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('không chứa ký tự dễ nhầm I L O 0 1', () => {
    expect(SHIPPER_CODE_ALPHABET).not.toMatch(/[ILO01]/)
  })

  it('deterministic với rand giả', () => {
    expect(generateShipperCode(() => 0)).toBe('SHIP-AAAAAA')
  })
})
