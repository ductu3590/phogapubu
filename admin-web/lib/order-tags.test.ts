import { describe, expect, it } from 'vitest'
import { orderSourceTag, orderTypeTag, orderTags } from './order-tags'

describe('orderSourceTag', () => {
  it('staff → Nhân viên đặt', () => {
    expect(orderSourceTag('staff')?.label).toContain('Nhân viên đặt')
  })
  it('customer_zalo → Khách tự đặt', () => {
    expect(orderSourceTag('customer_zalo')?.label).toContain('Khách tự đặt')
  })
  it('null/lạ → không có nhãn', () => {
    expect(orderSourceTag(null)).toBeNull()
    expect(orderSourceTag('foo')).toBeNull()
  })
})

describe('orderTypeTag', () => {
  it('dine_in → Tại bàn', () => {
    expect(orderTypeTag('dine_in')?.label).toContain('Tại bàn')
  })
  it('pickup → Mang về', () => {
    expect(orderTypeTag('pickup')?.label).toContain('Mang về')
  })
  it('delivery → Ship', () => {
    expect(orderTypeTag('delivery')?.label).toContain('Ship')
  })
  it('null/lạ → không có nhãn', () => {
    expect(orderTypeTag(null)).toBeNull()
  })
})

describe('orderTags', () => {
  it('gộp nguồn trước, loại sau', () => {
    const tags = orderTags('staff', 'dine_in')
    expect(tags.map((t) => t.tone)).toEqual(['source', 'type'])
  })
  it('bỏ nhãn không xác định', () => {
    expect(orderTags(null, 'pickup')).toHaveLength(1)
    expect(orderTags(null, null)).toHaveLength(0)
  })
})
