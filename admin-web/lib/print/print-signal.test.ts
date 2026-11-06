import { describe, expect, it } from 'vitest'
import { printSignal } from './print-signal'

describe('printSignal', () => {
  it('lỗi từ server luôn thắng', () => {
    expect(printSignal({ error: 'Phiếu đã hết hạn', alertText: null })).toEqual({ error: 'Phiếu đã hết hạn' })
  })
  it('có khối role=alert (giảm giá lớn hơn tiền hàng) thì báo lỗi bằng chính nội dung đó', () => {
    expect(printSignal({ alertText: ' Không in được hoá đơn Giảm giá lớn hơn tiền hàng ' })).toEqual({
      error: 'Không in được hoá đơn Giảm giá lớn hơn tiền hàng',
    })
  })
  it('alert rỗng vẫn là lỗi', () => {
    expect(printSignal({ alertText: '  ' })).toEqual({ error: 'Phiếu bị lỗi' })
  })
  it('không lỗi, không alert: sẵn sàng', () => {
    expect(printSignal({ alertText: null })).toEqual({ ready: true })
  })
})
