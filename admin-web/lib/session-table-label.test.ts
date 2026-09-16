import { describe, expect, it } from 'vitest'
import { sessionTableLabel } from './session-table-label'

describe('sessionTableLabel', () => {
  it('hiển thị toàn bộ bàn của mâm theo thứ tự, không chỉ bàn gửi đơn', () => {
    expect(sessionTableLabel([
      { table_number: 'Bàn 3' },
      { table_number: 'Bàn 2' },
    ], 'Bàn 3')).toBe('Bàn 2, Bàn 3')
  })

  it('giữ fallback cho đơn không có phiên bàn', () => {
    expect(sessionTableLabel([], 'Bàn 5')).toBe('Bàn 5')
  })
})
