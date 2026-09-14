import { describe, expect, it } from 'vitest'
import { formatSessionIdleTimeout, sessionTimeoutMessage } from './session-timeout'

describe('formatSessionIdleTimeout', () => {
  it('hiển thị timeout tròn giờ của Bảo Lương', () => {
    expect(formatSessionIdleTimeout(360)).toBe('6 giờ')
  })

  it('giữ phần phút khi cấu hình không tròn giờ', () => {
    expect(formatSessionIdleTimeout(90)).toBe('1 giờ 30 phút')
  })

  it('không tự bịa thời lượng khi server không trả giá trị hợp lệ', () => {
    expect(formatSessionIdleTimeout(null)).toBeNull()
    expect(formatSessionIdleTimeout(Number.NaN)).toBeNull()
    expect(formatSessionIdleTimeout(undefined)).toBeNull()
    expect(formatSessionIdleTimeout(-60)).toBeNull()
    expect(sessionTimeoutMessage(null)).toBe('Phiên đã hết hạn do không hoạt động')
    expect(sessionTimeoutMessage(420)).toBe('Phiên đã hết hạn sau 7 giờ không hoạt động')
  })
})
