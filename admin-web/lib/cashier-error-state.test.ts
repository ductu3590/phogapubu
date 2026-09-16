import { describe, expect, it } from 'vitest'
import { actionError, applyReloadError } from './cashier-error-state'

describe('cashier error state', () => {
  it('giữ nguyên lỗi thao tác khi snapshot nền tải thành công', () => {
    const blocked = actionError('Còn 4 đơn chưa được chủ quán xác nhận')
    expect(applyReloadError(blocked, null)).toBe(blocked)
  })

  it('xoá lỗi tải cũ khi snapshot nền hồi phục', () => {
    expect(applyReloadError({ source: 'reload', message: 'Mất kết nối' }, null)).toBeNull()
  })
})
