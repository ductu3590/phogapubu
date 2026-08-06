import { describe, it, expect } from 'vitest'
import { mapCheckoutResult } from './checkout-result'

describe('mapCheckoutResult', () => {
  it('resultCode 1 = đã trả tiền', () => {
    expect(mapCheckoutResult({ resultCode: 1, isCustom: false })).toBe('success')
  })

  it('resultCode -2 = thoát không chọn phương thức', () => {
    expect(mapCheckoutResult({ resultCode: -2, isCustom: false })).toBe('abandoned')
  })

  it('resultCode -1 với ví = thất bại', () => {
    expect(mapCheckoutResult({ resultCode: -1, isCustom: false })).toBe('failed')
  })

  it('resultCode -1 với chuyển khoản = chờ xác nhận, KHÔNG kết luận thất bại', () => {
    expect(mapCheckoutResult({ resultCode: -1, isCustom: true })).toBe('pending_confirm')
  })

  it('resultCode 0 = đang xử lý', () => {
    expect(mapCheckoutResult({ resultCode: 0, isCustom: false })).toBe('pending_confirm')
  })

  it('resultCode lạ = không suy đoán', () => {
    expect(mapCheckoutResult({ resultCode: 99, isCustom: false })).toBe('pending_confirm')
  })

  it('resultCode dạng chuỗi vẫn đọc được', () => {
    expect(mapCheckoutResult({ resultCode: '-2', isCustom: false })).toBe('abandoned')
  })

  it('thiếu resultCode = không suy đoán', () => {
    expect(mapCheckoutResult({ isCustom: false })).toBe('pending_confirm')
  })

  it('không có kết quả = không suy đoán', () => {
    expect(mapCheckoutResult(null)).toBe('pending_confirm')
    expect(mapCheckoutResult(undefined)).toBe('pending_confirm')
  })

  it('chuyển khoản trả về 1 vẫn là đã trả tiền', () => {
    expect(mapCheckoutResult({ resultCode: 1, isCustom: true })).toBe('success')
  })
})
