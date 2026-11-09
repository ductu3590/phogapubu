// Hàm ngày kinh doanh + nhãn phương thức thanh toán cho báo cáo theo ngày.
// (PA-1 đọc RPC get_daily_report ở đây; A04-4 2026-10-13 thay bằng lib/bills-report.ts + RPC get_bills_report, mig 102 DROP hàm cũ.)

import { INSTRUMENT_LABELS } from '@/lib/collect-payment'

export type ReportInstrument = 'cash' | 'bank' | 'other' | 'mixed'

const VN_OFFSET_MINUTES = 7 * 60

/** 25 giờ bắt đầu ngày chọn được: 00:00 tới 12:00, bước 30 phút (khớp CHECK của cột mig 111). */
export const BUSINESS_DAY_START_OPTIONS: string[] = Array.from({ length: 25 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`)

/** Nhận 'HH:MM' hoặc 'HH:MM:SS' (kiểu time của Postgres), còn lại coi như 00:00. */
export function normalizeBusinessDayStart(raw: unknown): string {
  if (typeof raw !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(raw)) return '00:00'
  return raw.slice(0, 5)
}

/**
 * Ngày kinh doanh đang chạy, dạng YYYY-MM-DD. Phải khớp business_date_of (mig 111): lùi giờ VN đi số phút của
 * giờ bắt đầu rồi lấy ngày. Việt Nam không đổi giờ mùa nên cộng cố định 7 giờ là đúng.
 */
export function businessToday(start: string, now: Date = new Date()): string {
  const [hours, minutes] = normalizeBusinessDayStart(start).split(':').map(Number)
  const shiftMinutes = VN_OFFSET_MINUTES - (hours * 60 + minutes)
  return new Date(now.getTime() + shiftMinutes * 60_000).toISOString().slice(0, 10)
}

export function clampReportDate(input: string | undefined, today: string): string {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return today
  const d = new Date(`${input}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) return today
  return input > today ? today : input
}

export function instrumentLabel(i: ReportInstrument): string {
  // Nhãn từng phương tiện lấy từ MỘT bảng (INSTRUMENT_LABELS). 'mixed' ở đây là bill CŨ trộn nhiều phương tiện;
  // bill thu Kết hợp có từng khoản (mig 112a) đọc nhãn qua billInstrumentLabel (lib/bills-report.ts).
  return { ...INSTRUMENT_LABELS, other: 'Ví / khác', mixed: 'Nhiều phương thức' }[i]
}
