import { describe, expect, it } from 'vitest'
import {
  BUSINESS_DAY_START_OPTIONS,
  businessToday,
  clampReportDate,
  instrumentLabel,
  normalizeBusinessDayStart,
} from './daily-report'

describe('businessToday', () => {
  it('05:00: 04:59:59 VN còn ngày cũ, 05:00:00 sang ngày mới', () => {
    expect(businessToday('05:00', new Date('2026-11-01T21:59:59Z'))).toBe('2026-11-01')
    expect(businessToday('05:00', new Date('2026-11-01T22:00:00Z'))).toBe('2026-11-02')
  })
  it('01:00 sáng vẫn là hôm trước', () => {
    expect(businessToday('05:00', new Date('2026-11-01T18:00:00Z'))).toBe('2026-11-01')
  })
  it('00:00 giống ngày lịch giờ VN', () => {
    expect(businessToday('00:00', new Date('2026-10-07T16:30:00Z'))).toBe('2026-10-07')
    expect(businessToday('00:00', new Date('2026-10-07T17:30:00Z'))).toBe('2026-10-08')
  })
  it('qua tháng, qua năm', () => {
    expect(businessToday('05:00', new Date('2026-11-30T21:00:00Z'))).toBe('2026-11-30')
    expect(businessToday('05:00', new Date('2026-12-31T21:00:00Z'))).toBe('2026-12-31')
  })
  it('12:00 và dạng HH:MM:SS', () => {
    expect(businessToday('12:00', new Date('2026-11-02T04:59:00Z'))).toBe('2026-11-01')
    expect(businessToday('05:00:00', new Date('2026-11-01T22:00:00Z'))).toBe('2026-11-02')
  })
  it('giờ lẻ 30 phút, giờ sai coi như 00:00', () => {
    expect(businessToday('05:30', new Date('2026-11-01T22:29:59Z'))).toBe('2026-11-01')
    expect(businessToday('05:30', new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-02')
    expect(businessToday('abc', new Date('2026-10-07T17:30:00Z'))).toBe('2026-10-08')
  })
})

describe('normalizeBusinessDayStart', () => {
  it('nhận HH:MM và HH:MM:SS', () => {
    expect(normalizeBusinessDayStart('05:30')).toBe('05:30')
    expect(normalizeBusinessDayStart('05:30:00')).toBe('05:30')
  })
  it('giờ sai coi như 00:00', () => {
    expect(normalizeBusinessDayStart('abc')).toBe('00:00')
    expect(normalizeBusinessDayStart('25:00')).toBe('00:00')
    expect(normalizeBusinessDayStart('5:00')).toBe('00:00')
    expect(normalizeBusinessDayStart(null)).toBe('00:00')
    expect(normalizeBusinessDayStart(undefined)).toBe('00:00')
    expect(normalizeBusinessDayStart(500)).toBe('00:00')
  })
})

it('25 lựa chọn, bước 30 phút', () => {
  expect(BUSINESS_DAY_START_OPTIONS).toHaveLength(25)
  expect(BUSINESS_DAY_START_OPTIONS[0]).toBe('00:00')
  expect(BUSINESS_DAY_START_OPTIONS[1]).toBe('00:30')
  expect(BUSINESS_DAY_START_OPTIONS.at(-1)).toBe('12:00')
})

it('clampReportDate: rỗng, sai, tương lai về today; ngày cũ giữ nguyên', () => {
  expect(clampReportDate(undefined, '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('abc', '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('2026-13-40', '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('2026-11-02', '2026-11-01')).toBe('2026-11-01')
  expect(clampReportDate('2026-10-30', '2026-11-01')).toBe('2026-10-30')
})

describe('nhãn phương thức', () => {
  it('đủ 4 loại', () => {
    expect(instrumentLabel('cash')).toBe('Tiền mặt')
    expect(instrumentLabel('bank')).toBe('Chuyển khoản')
    expect(instrumentLabel('other')).toBe('Ví / khác')
    expect(instrumentLabel('mixed')).toBe('Kết hợp')
  })
})
