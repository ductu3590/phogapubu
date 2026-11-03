import { describe, expect, it } from 'vitest'
import { allocateDiscount, discountAmount, validateDiscount } from './bill-discount'

describe('discountAmount', () => {
  it('giảm theo phần trăm, làm tròn', () => {
    expect(discountAmount(155_000, { type: 'percent', value: 10 })).toBe(15_500)
    // 10% của 155.005 = 15.500,5 → làm tròn lên 15.501 (Math.round)
    expect(discountAmount(155_005, { type: 'percent', value: 10 })).toBe(15_501)
  })

  it('giảm theo số tiền', () => {
    expect(discountAmount(155_000, { type: 'amount', value: 5_000 })).toBe(5_000)
  })

  it('phần trăm tính lại theo tiền hàng mới', () => {
    expect(discountAmount(200_000, { type: 'percent', value: 10 })).toBe(20_000)
  })

  it('không giảm giá → 0', () => {
    expect(discountAmount(155_000, null)).toBe(0)
  })

  it('không cắt bớt khi vượt tiền hàng (validateDiscount chặn trước)', () => {
    expect(discountAmount(100_000, { type: 'amount', value: 120_000 })).toBe(120_000)
  })
})

describe('validateDiscount', () => {
  it('hợp lệ → null', () => {
    expect(validateDiscount(100_000, null)).toBeNull()
    expect(validateDiscount(100_000, { type: 'amount', value: 0 })).toBeNull()
    expect(validateDiscount(100_000, { type: 'amount', value: 100_000 })).toBeNull()
    expect(validateDiscount(100_000, { type: 'percent', value: 0 })).toBeNull()
    expect(validateDiscount(100_000, { type: 'percent', value: 100 })).toBeNull()
  })

  it('số tiền lớn hơn tiền hàng', () => {
    expect(validateDiscount(100_000, { type: 'amount', value: 120_000 })).toBe(
      'Giảm giá lớn hơn tiền hàng — sửa lại giảm giá',
    )
  })

  it('phần trăm ngoài 0–100', () => {
    expect(validateDiscount(100_000, { type: 'percent', value: 101 })).toBe(
      'Phần trăm phải từ 0 đến 100',
    )
  })

  it('không phải số nguyên không âm', () => {
    const msg = 'Giảm giá phải là số nguyên không âm'
    expect(validateDiscount(100_000, { type: 'percent', value: 12.5 })).toBe(msg)
    expect(validateDiscount(100_000, { type: 'amount', value: 1000.5 })).toBe(msg)
    expect(validateDiscount(100_000, { type: 'amount', value: -1 })).toBe(msg)
    expect(validateDiscount(100_000, { type: 'percent', value: -5 })).toBe(msg)
    expect(validateDiscount(100_000, { type: 'amount', value: NaN })).toBe(msg)
    expect(validateDiscount(100_000, { type: 'amount', value: Infinity })).toBe(msg)
  })
})

describe('allocateDiscount', () => {
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

  it('chia theo tỉ lệ', () => {
    expect(
      allocateDiscount(10_000, [
        { id: 'a', amount: 30_000 },
        { id: 'b', amount: 70_000 },
      ]),
    ).toEqual({ a: 3_000, b: 7_000 })
  })

  it('phần dư vào phần có tiền lớn nhất', () => {
    // Ca chia chẵn: không có phần dư
    const r = allocateDiscount(10_000, [
      { id: 'a', amount: 10 },
      { id: 'b', amount: 10 },
      { id: 'c', amount: 20 },
    ])
    expect(sum(r)).toBe(10_000)
    expect(r).toEqual({ a: 2_500, b: 2_500, c: 5_000 })
    const r2 = allocateDiscount(10_000, [
      { id: 'a', amount: 1 },
      { id: 'b', amount: 1 },
      { id: 'c', amount: 5 },
    ])
    expect(sum(r2)).toBe(10_000)
    expect(r2.c).toBe(7_144) // floor 7142 + dư 2
    expect(r2.a).toBe(1_428)
    expect(r2.b).toBe(1_428)
  })

  it('hoà tiền → phần dư vào id nhỏ nhất', () => {
    const r = allocateDiscount(10_001, [
      { id: 'a', amount: 1 },
      { id: 'b', amount: 1 },
      { id: 'c', amount: 1 },
    ])
    expect(sum(r)).toBe(10_001)
    expect(r).toEqual({ a: 3_335, b: 3_333, c: 3_333 })
  })

  it('hoà tiền không phụ thuộc thứ tự mảng', () => {
    const r = allocateDiscount(10_001, [
      { id: 'c', amount: 1 },
      { id: 'b', amount: 1 },
      { id: 'a', amount: 1 },
    ])
    expect(r).toEqual({ a: 3_335, b: 3_333, c: 3_333 })
  })

  it('một phần duy nhất nhận hết', () => {
    expect(allocateDiscount(7_777, [{ id: 'x', amount: 50_000 }])).toEqual({ x: 7_777 })
  })

  it('giảm 0 → mọi phần 0', () => {
    expect(
      allocateDiscount(0, [
        { id: 'a', amount: 30_000 },
        { id: 'b', amount: 70_000 },
      ]),
    ).toEqual({ a: 0, b: 0 })
  })

  it('mọi phần có tiền 0 mà vẫn có giảm → dồn hết vào id nhỏ nhất', () => {
    const r = allocateDiscount(500, [
      { id: 'b', amount: 0 },
      { id: 'a', amount: 0 },
    ])
    expect(r).toEqual({ a: 500, b: 0 })
  })

  it('phần có tiền 0 không nhận gì khi các phần khác có tiền', () => {
    expect(
      allocateDiscount(1_000, [
        { id: 'a', amount: 0 },
        { id: 'b', amount: 10 },
      ]),
    ).toEqual({ a: 0, b: 1_000 })
  })

  it('tổng luôn đúng bằng số giảm', () => {
    const parts = [
      { id: 'm1', amount: 123_456 },
      { id: 'm2', amount: 78_901 },
      { id: 'm3', amount: 45_678 },
    ]
    for (const total of [1, 99, 12_345, 99_999, 248_035]) {
      expect(sum(allocateDiscount(total, parts))).toBe(total)
    }
  })
})
