import { describe, expect, it } from 'vitest'
import { clampReportDate, instrumentLabel, isViewingToday, vnToday } from './daily-report'

// 2026-10-07 23:30 giờ VN = 16:30 UTC
const lateNight = new Date('2026-10-07T16:30:00Z')
// 2026-10-08 00:30 giờ VN = 2026-10-07 17:30 UTC
const afterMidnight = new Date('2026-10-07T17:30:00Z')

describe('ngày báo cáo theo giờ Việt Nam', () => {
  it('hôm nay tính theo VN, không theo UTC', () => {
    expect(vnToday(lateNight)).toBe('2026-10-07')
    expect(vnToday(afterMidnight)).toBe('2026-10-08')
  })
  it('rỗng / sai định dạng / ngày tương lai → hôm nay', () => {
    expect(clampReportDate(undefined, lateNight)).toBe('2026-10-07')
    expect(clampReportDate('abc', lateNight)).toBe('2026-10-07')
    expect(clampReportDate('2026-13-40', lateNight)).toBe('2026-10-07')
    expect(clampReportDate('2026-10-09', lateNight)).toBe('2026-10-07')
  })
  it('ngày cũ hợp lệ giữ nguyên', () => {
    expect(clampReportDate('2026-09-30', lateNight)).toBe('2026-09-30')
  })
  it('thẻ "Đang mở" chỉ khi xem hôm nay', () => {
    expect(isViewingToday('2026-10-07', lateNight)).toBe(true)
    expect(isViewingToday('2026-10-06', lateNight)).toBe(false)
  })
})

describe('nhãn phương thức', () => {
  it('đủ 4 loại', () => {
    expect(instrumentLabel('cash')).toBe('Tiền mặt')
    expect(instrumentLabel('bank')).toBe('Chuyển khoản')
    expect(instrumentLabel('other')).toBe('Ví / khác')
    expect(instrumentLabel('mixed')).toBe('Nhiều phương thức')
  })
})
