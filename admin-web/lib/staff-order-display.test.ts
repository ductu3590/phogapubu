import { describe, expect, it } from 'vitest'
import { isPosManualPending, shortOrderCode, staffOrderStatusLabel, staffSubmitTitle } from './staff-order-display'
import { billCode } from './bills-report'

describe('shortOrderCode', () => {
  it('lấy 6 ký tự cuối, viết hoa — khớp mã ở danh sách Đang xử lý', () => {
    expect(shortOrderCode('f99ba0cf-8db1-454d-9666-fb9d49ebcef9')).toBe('#EBCEF9')
  })
  it('cùng kiểu mã với Hoá đơn A04 cho đơn không phiên', () => {
    const id = '509a95c0-cc83-490f-a303-02206dab1d07'
    expect(shortOrderCode(id)).toBe(billCode([], [id]))
  })
})

describe('staffSubmitTitle', () => {
  it('quán bắt thu ngân duyệt → không nói đã vào bếp', () => {
    expect(staffSubmitTitle(true)).toBe('Đã gửi, chờ thu ngân duyệt')
  })
  it('quán tự vào bếp → giữ câu cũ', () => {
    expect(staffSubmitTitle(false)).toBe('Đã gửi vào bếp')
  })
})

describe('staffOrderStatusLabel', () => {
  const LABELS = { pending: 'Chờ xử lý', confirmed: 'Đã xác nhận' }
  it('món thu ngân ghi tay (pos, pending) → "Thu ngân ghi"', () => {
    expect(staffOrderStatusLabel('pending', 'pos', LABELS)).toBe('Thu ngân ghi')
    expect(isPosManualPending('pending', 'pos')).toBe(true)
  })
  it('đơn nhân viên / khách chờ duyệt vẫn là "Chờ xử lý"', () => {
    expect(staffOrderStatusLabel('pending', 'staff', LABELS)).toBe('Chờ xử lý')
    expect(staffOrderStatusLabel('pending', 'customer_zalo', LABELS)).toBe('Chờ xử lý')
    expect(isPosManualPending('pending', 'staff')).toBe(false)
  })
  it('trạng thái khác giữ nhãn theo bảng; lạ thì in nguyên', () => {
    expect(staffOrderStatusLabel('confirmed', 'pos', LABELS)).toBe('Đã xác nhận')
    expect(staffOrderStatusLabel('weird', null, LABELS)).toBe('weird')
  })
})
