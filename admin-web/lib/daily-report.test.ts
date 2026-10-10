import { describe, expect, it } from 'vitest'
import { clampReportDate, instrumentLabel, isViewingToday, parseDailyReport, vnToday } from './daily-report'

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

describe('đọc JSON từ RPC', () => {
  it('đổi snake_case → camelCase, số chuỗi → number', () => {
    const r = parseDailyReport({
      date: '2026-10-07',
      totals: { revenue: '700000', cash: 500000, bank: 200000, other: 0, bills_count: 2 },
      open: { tables_count: 3, provisional_total: 420000 },
      bills: [{ key: 'C:x@y', paid_at: '2026-10-07T12:00:00Z', session_ids: ['s1', 's2'], order_ids: ['o1'], merged: true,
        total: 500000, instrument: 'cash', items_count: 7, table_label: 'Bàn 3, Bàn 4', received_by_name: null }],
      adjustments: [{ at: '2026-10-07T11:00:00Z', item_name: 'Bia', quantity: 2, amount: 40000, type: 'gift',
        reason: 'Khách quen', table_label: 'Bàn 2', by_name: 'Chị Lan' }],
    })
    expect(r.totals).toEqual({ revenue: 700000, cash: 500000, bank: 200000, other: 0, billsCount: 2 })
    expect(r.open).toEqual({ tablesCount: 3, provisionalTotal: 420000 })
    expect(r.bills[0]).toMatchObject({ merged: true, itemsCount: 7, tableLabel: 'Bàn 3, Bàn 4', sessionIds: ['s1', 's2'] })
    expect(r.adjustments[0]).toMatchObject({ type: 'gift', byName: 'Chị Lan', amount: 40000 })
  })
  it('thiếu mảng / null → mảng rỗng, số 0; instrument lạ → other', () => {
    const r = parseDailyReport({ date: '2026-10-07', totals: null, open: null, bills: [{ instrument: 'zzz' }], adjustments: null })
    expect(r.totals.revenue).toBe(0)
    expect(r.open.tablesCount).toBe(0)
    expect(r.adjustments).toEqual([])
    expect(r.bills[0].instrument).toBe('other')
  })
})
