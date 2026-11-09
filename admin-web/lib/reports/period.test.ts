import { describe, expect, it } from 'vitest'
import { REPORT_PRESETS, periodLabel, resolveReportPeriod } from './period'

describe('resolveReportPeriod', () => {
  const today = '2026-11-20'

  it('preset', () => {
    expect(resolveReportPeriod({ period: 'today' }, today)).toEqual({ preset: 'today', from: today, to: today })
    expect(resolveReportPeriod({ period: 'yesterday' }, today)).toEqual({ preset: 'yesterday', from: '2026-11-19', to: '2026-11-19' })
    expect(resolveReportPeriod({ period: '7d' }, today)).toMatchObject({ from: '2026-11-14', to: '2026-11-20' })
    expect(resolveReportPeriod({ period: 'this_month' }, today)).toMatchObject({ from: '2026-11-01', to: '2026-11-20' })
    expect(resolveReportPeriod({ period: 'last_month' }, '2026-03-05')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolveReportPeriod({ period: 'last_month' }, '2026-01-10')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' })
    expect(resolveReportPeriod({ period: 'last_month' }, '2024-03-31')).toMatchObject({ from: '2024-02-01', to: '2024-02-29' })
    expect(resolveReportPeriod({ period: 'yesterday' }, '2026-01-01')).toMatchObject({ from: '2025-12-31', to: '2025-12-31' })
  })

  it('preset hợp lệ thắng from/to gõ tay', () => {
    expect(resolveReportPeriod({ period: '7d', from: '2026-01-01', to: '2026-01-02' }, today))
      .toEqual({ preset: '7d', from: '2026-11-14', to: '2026-11-20' })
  })

  it('tuỳ chọn: tương lai kẹp về hôm nay, ngược thì hoán đổi, quá 366 ngày thì cắt', () => {
    expect(resolveReportPeriod({ from: '2026-11-01', to: '2027-01-01' }, today)).toEqual({ preset: 'custom', from: '2026-11-01', to: '2026-11-20' })
    expect(resolveReportPeriod({ from: '2026-11-10', to: '2026-11-02' }, today)).toMatchObject({ preset: 'custom', from: '2026-11-02', to: '2026-11-10' })
    expect(resolveReportPeriod({ from: '2024-01-01', to: '2026-11-20' }, today)).toMatchObject({ from: '2025-11-20', to: '2026-11-20' })
    // Đủ 366 ngày (tính cả hai đầu) thì giữ nguyên.
    expect(resolveReportPeriod({ from: '2025-11-20', to: '2026-11-20' }, today)).toMatchObject({ from: '2025-11-20', to: '2026-11-20' })
    // Chỉ có một đầu: đầu kia là hôm nay.
    expect(resolveReportPeriod({ from: '2026-11-15' }, today)).toEqual({ preset: 'custom', from: '2026-11-15', to: today })
    expect(resolveReportPeriod({ period: 'custom', to: '2026-11-15' }, today)).toEqual({ preset: 'custom', from: '2026-11-15', to: today })
    expect(resolveReportPeriod({ period: 'custom' }, today)).toEqual({ preset: 'custom', from: today, to: today })
  })

  it('rác về hôm nay', () => {
    expect(resolveReportPeriod({ period: 'abc', from: '2026-13-40' }, today)).toMatchObject({ from: today, to: today })
    expect(resolveReportPeriod({ from: '2026-02-30', to: 'x' }, today)).toMatchObject({ from: today, to: today })
    expect(resolveReportPeriod({}, today)).toEqual({ preset: 'today', from: today, to: today })
    expect(resolveReportPeriod({ period: 'abc' }, today)).toEqual({ preset: 'today', from: today, to: today })
  })
})

it('REPORT_PRESETS đủ 6 nhãn theo thứ tự', () => {
  expect(REPORT_PRESETS.map((p) => p.label)).toEqual(['Hôm nay', 'Hôm qua', '7 ngày', 'Tháng này', 'Tháng trước', 'Tuỳ chọn'])
  expect(REPORT_PRESETS.map((p) => p.value)).toEqual(['today', 'yesterday', '7d', 'this_month', 'last_month', 'custom'])
})

it('periodLabel', () => {
  expect(periodLabel({ from: '2026-11-20', to: '2026-11-20' })).toBe('20/11/2026')
  expect(periodLabel({ from: '2026-11-01', to: '2026-11-20' })).toBe('01/11 – 20/11/2026')
  expect(periodLabel({ from: '2025-12-15', to: '2026-01-05' })).toBe('15/12/2025 – 05/01/2026')
})
