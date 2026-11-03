import { describe, expect, it } from 'vitest'
import {
  allocateDiscount,
  billTotals,
  combinedDiscount,
  discountAmount,
  firstDiscountError,
  sessionDiscountOf,
  validateDiscount,
} from './bill-discount'

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

  it('phần dư không làm phần nào vượt tiền hàng của nó (3 × 1.000đ giảm 2.999)', () => {
    // floor 999 × 3, dư 2 → a (đầy 1.000), b (đầy 1.000); c giữ 999. Cách cũ cho c 1.001 > 1.000.
    const r = allocateDiscount(2_999, [
      { id: 'c', amount: 1_000 },
      { id: 'a', amount: 1_000 },
      { id: 'b', amount: 1_000 },
    ])
    expect(r).toEqual({ a: 1_000, b: 1_000, c: 999 })
  })

  it('phần lớn nhất đầy thì dư tràn sang phần kế tiếp theo tiền giảm dần', () => {
    // floor: x 0, y 1, z 1 (= 2), dư 2; thứ tự y(2), z(2) hoà → id nhỏ trước, x(1) cuối:
    // y còn chỗ 1 → 2, z còn chỗ 1 → 2, hết dư; x giữ 0
    const r = allocateDiscount(4, [
      { id: 'x', amount: 1 },
      { id: 'z', amount: 2 },
      { id: 'y', amount: 2 },
    ])
    expect(r).toEqual({ x: 0, y: 2, z: 2 })
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

describe('sessionDiscountOf', () => {
  it('đổi cột của phiên sang BillDiscount', () => {
    expect(sessionDiscountOf({ bill_discount_type: 'percent', bill_discount_value: 10 })).toEqual({ type: 'percent', value: 10 })
    expect(sessionDiscountOf({ bill_discount_type: 'amount', bill_discount_value: 5_000 })).toEqual({ type: 'amount', value: 5_000 })
  })

  it('không giảm giá (cả hai null hoặc thiếu trường) → null', () => {
    expect(sessionDiscountOf({ bill_discount_type: null, bill_discount_value: null })).toBeNull()
    expect(sessionDiscountOf({})).toBeNull()
  })
})

describe('combinedDiscount', () => {
  it('tổng giảm giá từng phiên trên tiền hàng chưa thu của chính nó', () => {
    const sessions = [
      { bill_discount_type: 'percent' as const, bill_discount_value: 10, unpaid_total: 155_000 }, // 15.500
      { bill_discount_type: 'amount' as const, bill_discount_value: 5_000, unpaid_total: 80_000 }, // 5.000
      { bill_discount_type: null, bill_discount_value: null, unpaid_total: 40_000 }, // 0
    ]
    expect(combinedDiscount(sessions)).toBe(20_500)
  })

  it('làm tròn % từng phiên rồi mới cộng (đúng cách server lưu)', () => {
    const s = { bill_discount_type: 'percent' as const, bill_discount_value: 10, unpaid_total: 155_005 } // 15.501
    expect(combinedDiscount([s, s])).toBe(31_002)
  })

  it('không phiên nào → 0', () => {
    expect(combinedDiscount([])).toBe(0)
  })
})

describe('billTotals', () => {
  it('tiền hàng = tổng chưa thu; phần đã thu trước tách riêng; giảm giá tính trên tiền chưa thu', () => {
    const t = billTotals([
      { total: 200_000, unpaid_total: 155_000, bill_discount_type: 'percent', bill_discount_value: 10 },
    ])
    expect(t).toEqual({ goods: 155_000, paid: 45_000, discount: 15_500, payable: 139_500, error: null })
  })

  it('gộp nhiều mâm: cộng từng mâm', () => {
    const t = billTotals([
      { total: 100_000, unpaid_total: 100_000, bill_discount_type: 'amount', bill_discount_value: 5_000 },
      { total: 60_000, unpaid_total: 60_000 },
    ])
    expect(t).toEqual({ goods: 160_000, paid: 0, discount: 5_000, payable: 155_000, error: null })
  })

  it('giảm giá lỗi → báo lỗi, giữ số TRƯỚC giảm (không kẹp về 0đ)', () => {
    const t = billTotals([
      { total: 100_000, unpaid_total: 100_000, bill_discount_type: 'amount', bill_discount_value: 120_000 },
    ])
    expect(t.error).toBe('Giảm giá lớn hơn tiền hàng — sửa lại giảm giá')
    expect(t.payable).toBe(100_000)
    expect(t.discount).toBe(0)
  })

  it('không phiên nào → toàn 0', () => {
    expect(billTotals([])).toEqual({ goods: 0, paid: 0, discount: 0, payable: 0, error: null })
  })
})

describe('firstDiscountError', () => {
  it('trả lỗi của phiên đầu tiên không hợp lệ', () => {
    const ok = { bill_discount_type: 'amount' as const, bill_discount_value: 5_000, unpaid_total: 80_000 }
    const bad = { bill_discount_type: 'amount' as const, bill_discount_value: 90_000, unpaid_total: 80_000 }
    expect(firstDiscountError([ok, bad])).toBe('Giảm giá lớn hơn tiền hàng — sửa lại giảm giá')
  })

  it('mọi phiên hợp lệ hoặc không giảm giá → null', () => {
    expect(firstDiscountError([{ bill_discount_type: null, bill_discount_value: null, unpaid_total: 0 }])).toBeNull()
  })
})
