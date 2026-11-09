// Kỳ báo cáo trang /admin/reports: chọn nhanh (Hôm nay … Tháng trước) hoặc Tuỳ chọn từ – đến. Ngày ở đây là NGÀY
// KINH DOANH dạng YYYY-MM-DD (mig 111); `today` do nơi gọi tính bằng businessToday theo giờ bắt đầu ngày của quán.
// Hàm thuần: không đọc giờ máy, không đọc vai trò. Mọi URL gõ tay đều ra một kỳ hợp lệ (RPC vẫn tự chặn lần nữa).
import { clampReportDate } from '@/lib/daily-report'

export type ReportPreset = 'today' | 'yesterday' | '7d' | 'this_month' | 'last_month' | 'custom'

export const REPORT_PRESETS: { value: ReportPreset; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: '7d', label: '7 ngày' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: 'custom', label: 'Tuỳ chọn' },
]

/** Khớp giới hạn của report_period_bounds (mig 117): tối đa 366 ngày tính cả hai đầu. */
const MAX_DAYS = 366

const toDate = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`)
const toYmd = (d: Date): string => d.toISOString().slice(0, 10)
const addDays = (ymd: string, days: number): string => {
  const d = toDate(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return toYmd(d)
}
const daysBetween = (from: string, to: string): number => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)

function presetRange(preset: Exclude<ReportPreset, 'custom'>, today: string): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case 'this_month':
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case 'last_month': {
      // Ngày cuối tháng trước = ngày 1 tháng này lùi 1 ngày.
      const to = addDays(`${today.slice(0, 7)}-01`, -1)
      return { from: `${to.slice(0, 7)}-01`, to }
    }
  }
}

const isPreset = (v: string | undefined): v is Exclude<ReportPreset, 'custom'> =>
  !!v && v !== 'custom' && REPORT_PRESETS.some((p) => p.value === v)

export function resolveReportPeriod(
  input: { period?: string; from?: string; to?: string },
  today: string,
): { preset: ReportPreset; from: string; to: string } {
  if (isPreset(input.period)) return { preset: input.period, ...presetRange(input.period, today) }
  if (input.period !== 'custom' && !input.from && !input.to) return { preset: 'today', from: today, to: today }

  // Tuỳ chọn: từng đầu kẹp về hôm nay (sai định dạng cũng về hôm nay), ngược thì hoán đổi, dài quá thì cắt đầu.
  let from = clampReportDate(input.from, today)
  let to = clampReportDate(input.to, today)
  if (from > to) [from, to] = [to, from]
  if (daysBetween(from, to) + 1 > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1))
  return { preset: 'custom', from, to }
}

const dm = (ymd: string): string => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
const dmy = (ymd: string): string => `${dm(ymd)}/${ymd.slice(0, 4)}`

/** '20/11/2026' · '01/11 – 20/11/2026' · '15/12/2025 – 05/01/2026'. */
export function periodLabel(p: { from: string; to: string }): string {
  if (p.from === p.to) return dmy(p.to)
  if (p.from.slice(0, 4) === p.to.slice(0, 4)) return `${dm(p.from)} – ${dmy(p.to)}`
  return `${dmy(p.from)} – ${dmy(p.to)}`
}
