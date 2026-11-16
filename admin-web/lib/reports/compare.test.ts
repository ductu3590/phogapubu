import { describe, expect, it } from 'vitest'
import { compareLabel, deltaPercent, prevOf, previousRange, type Compare } from './compare'
import type { ReportData } from '@/lib/actions/reports'

describe('previousRange', () => {
  it('Hôm nay / Hôm qua / 7 ngày / Tuỳ chọn: cùng độ dài liền trước', () => {
    expect(previousRange('today', '2026-11-16', '2026-11-16')).toEqual({ from: '2026-11-15', to: '2026-11-15' })
    expect(previousRange('yesterday', '2026-11-15', '2026-11-15')).toEqual({ from: '2026-11-14', to: '2026-11-14' })
    expect(previousRange('7d', '2026-11-10', '2026-11-16')).toEqual({ from: '2026-11-03', to: '2026-11-09' })
    expect(previousRange('custom', '2026-11-05', '2026-11-09')).toEqual({ from: '2026-10-31', to: '2026-11-04' })
    expect(previousRange('today', '2026-03-01', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' })
  })
  it('Tháng này: n ngày đầu tháng trước, cắt ở cuối tháng', () => {
    expect(previousRange('this_month', '2026-11-01', '2026-11-16')).toEqual({ from: '2026-10-01', to: '2026-10-16' })
    expect(previousRange('this_month', '2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousRange('this_month', '2026-01-01', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-10' })
  })
  it('Tháng trước: trọn tháng liền trước nữa', () => {
    expect(previousRange('last_month', '2026-10-01', '2026-10-31')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(previousRange('last_month', '2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('deltaPercent', () => {
  it('làm tròn 1 chữ số, kỳ trước ≤ 0 hoặc thiếu thì null', () => {
    expect(deltaPercent(17_800_000, 16_450_000)).toBe(8.2)
    expect(deltaPercent(0, 100)).toBe(-100)
    expect(deltaPercent(100, 100)).toBe(0)
    expect(deltaPercent(100, 0)).toBeNull()
    expect(deltaPercent(100, -5)).toBeNull()
    expect(deltaPercent(100, null)).toBeNull()
    expect(deltaPercent(-50, 100)).toBe(-150)
  })
})

it('compareLabel gọi đúng tên kỳ trước', () => {
  expect(compareLabel('today')).toBe('so với hôm qua')
  expect(compareLabel('yesterday')).toBe('so với hôm kia')
  expect(compareLabel('7d')).toBe('so với 7 ngày trước')
  expect(compareLabel('this_month')).toBe('so với tháng trước')
  expect(compareLabel('last_month')).toBe('so với tháng trước')
  expect(compareLabel('custom')).toBe('so với kỳ trước')
})

it('prevOf trả báo cáo đúng tab, sai tab hoặc thiếu thì null', () => {
  const item = { tab: 'item', rows: [] } as unknown as ReportData
  const c: Compare = { prev: item, label: 'so với hôm qua' }
  expect(prevOf(c, 'item')).toBe(item)
  expect(prevOf(c, 'voids')).toBeNull()
  expect(prevOf({ prev: null, label: 'x' }, 'item')).toBeNull()
  expect(prevOf(undefined, 'item')).toBeNull()
})
