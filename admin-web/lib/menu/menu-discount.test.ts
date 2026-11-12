import { describe, expect, it } from 'vitest'
import {
  applyMenuDiscount,
  daysLabel,
  describeSchedule,
  discountAmount,
  discountBadge,
  parseActiveDiscounts,
  parseDiscountInput,
  ruleStatus,
  vnToday,
  type ActiveRule,
  type DiscountInput,
} from './menu-discount'

const rule = (over: Partial<ActiveRule>): ActiveRule => ({
  id: 'r', discount_type: 'percent', value: 10, name: null, time_to: null, ends_on: null, ...over,
})

describe('discountAmount — khớp menu_discount_amount (mig 115)', () => {
  it('phần trăm làm tròn nửa lên tới đồng', () => {
    expect(discountAmount(25_000, 'percent', 10)).toBe(2_500)
    expect(discountAmount(12_345, 'percent', 15)).toBe(1_852) // 1851,75
    expect(discountAmount(1_250, 'percent', 1)).toBe(13) // 12,5 → 13
  })
  it('VNĐ không vượt giá', () => {
    expect(discountAmount(20_000, 'amount', 5_000)).toBe(5_000)
    expect(discountAmount(20_000, 'amount', 99_999)).toBe(20_000)
  })
  it('100% về 0đ, giá 0 không giảm', () => {
    expect(discountAmount(30_000, 'percent', 100)).toBe(30_000)
    expect(discountAmount(0, 'percent', 50)).toBe(0)
  })
})

describe('applyMenuDiscount', () => {
  it('không có chương trình → giữ giá', () => {
    expect(applyMenuDiscount(50_000, [])).toEqual({ price: 50_000, originalPrice: null, rule: null })
    expect(applyMenuDiscount(50_000, undefined).originalPrice).toBeNull()
  })
  it('lấy mức giảm cao nhất, không cộng dồn', () => {
    const a = rule({ id: 'a', discount_type: 'percent', value: 10 })
    const b = rule({ id: 'b', discount_type: 'amount', value: 8_000 })
    expect(applyMenuDiscount(50_000, [a, b])).toEqual({ price: 42_000, originalPrice: 50_000, rule: b })
    // giá cao thì % thắng
    expect(applyMenuDiscount(200_000, [a, b]).rule?.id).toBe('a')
  })
})

describe('nhãn', () => {
  it('chip mức giảm', () => {
    expect(discountBadge({ discount_type: 'percent', value: 20 })).toBe('−20%')
    expect(discountBadge({ discount_type: 'amount', value: 15_000 })).toBe('−15.000đ')
  })
  it('ngày trong tuần gom dải', () => {
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('T2–T6')
    expect(daysLabel([7, 6])).toBe('T7, CN')
    expect(daysLabel([1, 3, 5])).toBe('T2, T4, T6')
    expect(daysLabel([1, 2, 3, 4, 5, 6, 7])).toBeNull()
    expect(daysLabel(null)).toBeNull()
  })
  it('lịch dạng chữ', () => {
    const base = { starts_on: null, ends_on: null, time_from: null, time_to: null, days_of_week: null }
    expect(describeSchedule(base)).toBe('Luôn áp dụng')
    expect(describeSchedule({ ...base, time_from: '16:00:00', time_to: '18:00:00', days_of_week: [1, 2, 3, 4, 5], starts_on: '2026-11-10', ends_on: '2026-11-20' }))
      .toBe('16:00–18:00 · T2–T6 · 10/11–20/11')
    expect(describeSchedule({ ...base, starts_on: '2026-11-10' })).toBe('từ 10/11')
    expect(describeSchedule({ ...base, ends_on: '2026-11-20' })).toBe('đến hết 20/11')
    expect(describeSchedule({ ...base, starts_on: '2026-11-10', ends_on: '2026-11-10' })).toBe('ngày 10/11')
  })
})

describe('ruleStatus', () => {
  const row = { id: 'x', is_active: true, starts_on: null, ends_on: null }
  it('server nói đang áp dụng là đang áp dụng', () => {
    expect(ruleStatus(row, new Set(['x']), '2026-11-09')).toBe('active')
  })
  it('tắt / hết hạn / chưa bắt đầu / ngoài khung giờ', () => {
    expect(ruleStatus({ ...row, is_active: false }, new Set(['x']), '2026-11-09')).toBe('off')
    expect(ruleStatus({ ...row, ends_on: '2026-11-08' }, new Set(), '2026-11-09')).toBe('expired')
    expect(ruleStatus({ ...row, starts_on: '2026-11-10' }, new Set(), '2026-11-09')).toBe('upcoming')
    expect(ruleStatus(row, new Set(), '2026-11-09')).toBe('outside')
  })
  it('vnToday theo giờ Việt Nam', () => {
    expect(vnToday(new Date('2026-11-09T17:30:00Z'))).toBe('2026-11-10')
    expect(vnToday(new Date('2026-11-09T16:59:00Z'))).toBe('2026-11-09')
  })
})

describe('parseActiveDiscounts', () => {
  it('đọc kết quả RPC, bỏ dữ liệu lạ', () => {
    const out = parseActiveDiscounts({
      items: [
        { menu_item_id: 'm1', rules: [{ id: 'r1', discount_type: 'percent', value: 20, name: 'Happy', time_to: '18:00', ends_on: null }] },
        { menu_item_id: 'm2', rules: [{ id: 'bad', discount_type: 'free', value: 1 }] },
        { nope: true },
      ],
      active_ids: ['r1', 3],
    })
    expect(out.byItem.get('m1')?.[0]).toMatchObject({ id: 'r1', value: 20, time_to: '18:00' })
    expect(out.byItem.has('m2')).toBe(false)
    expect([...out.activeIds]).toEqual(['r1'])
    expect(parseActiveDiscounts(null).byItem.size).toBe(0)
  })
})

describe('parseDiscountInput', () => {
  const input = (over: Partial<DiscountInput>): DiscountInput => ({
    discount_type: 'percent', value: '10', name: '', schedule: 'always',
    starts_on: '', ends_on: '', time_from: '', time_to: '', days: [], ...over,
  })
  it('luôn áp dụng bỏ qua mọi ô lịch', () => {
    const r = parseDiscountInput(input({ starts_on: '2026-11-10', time_from: '16:00' }))
    expect(r).toEqual({ ok: true, values: { discount_type: 'percent', value: 10, name: null, starts_on: null, ends_on: null, time_from: null, time_to: null, days_of_week: null } })
  })
  it('VNĐ đọc dấu ngăn nghìn', () => {
    const r = parseDiscountInput(input({ discount_type: 'amount', value: '5.000' }))
    expect(r.ok && r.values.value).toBe(5000)
  })
  it('chặn giá trị sai', () => {
    expect(parseDiscountInput(input({ value: '0' })).ok).toBe(false)
    expect(parseDiscountInput(input({ value: '101' })).ok).toBe(false)
    expect(parseDiscountInput(input({ value: 'abc' })).ok).toBe(false)
    expect(parseDiscountInput(input({ discount_type: 'x' })).ok).toBe(false)
    expect(parseDiscountInput(input({ name: 'a'.repeat(61) })).ok).toBe(false)
  })
  it('lịch đầy đủ', () => {
    const r = parseDiscountInput(input({ schedule: 'scheduled', starts_on: '2026-11-10', ends_on: '2026-11-20', time_from: '22:00', time_to: '02:00', days: ['5', '6', '5'], name: ' Happy hour ' }))
    expect(r).toEqual({ ok: true, values: { discount_type: 'percent', value: 10, name: 'Happy hour', starts_on: '2026-11-10', ends_on: '2026-11-20', time_from: '22:00', time_to: '02:00', days_of_week: [5, 6] } })
  })
  it('đủ 7 ngày = mọi ngày', () => {
    const r = parseDiscountInput(input({ schedule: 'scheduled', days: ['1', '2', '3', '4', '5', '6', '7'] }))
    expect(r.ok && r.values.days_of_week).toBeNull()
  })
  it('chặn lịch sai', () => {
    expect(parseDiscountInput(input({ schedule: 'scheduled', starts_on: '2026-11-20', ends_on: '2026-11-10' })).ok).toBe(false)
    expect(parseDiscountInput(input({ schedule: 'scheduled', starts_on: '2026-02-30' })).ok).toBe(false)
    expect(parseDiscountInput(input({ schedule: 'scheduled', time_from: '16:00' })).ok).toBe(false)
    expect(parseDiscountInput(input({ schedule: 'scheduled', time_from: '16:00', time_to: '16:00' })).ok).toBe(false)
    expect(parseDiscountInput(input({ schedule: 'scheduled', time_from: '25:00', time_to: '16:00' })).ok).toBe(false)
  })
})
