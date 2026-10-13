// Hàm ngày giờ VN + nhãn phương thức thanh toán cho báo cáo theo ngày.
// (PA-1 đọc RPC get_daily_report ở đây; A04-4 2026-10-13 thay bằng lib/bills-report.ts + RPC get_bills_report.)

export type ReportInstrument = 'cash' | 'bank' | 'other' | 'mixed'

export function vnToday(now: Date): string {
  // en-CA cho ra đúng YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function clampReportDate(input: string | undefined, now: Date): string {
  const today = vnToday(now)
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return today
  const d = new Date(`${input}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) return today
  return input > today ? today : input
}

export function isViewingToday(date: string, now: Date): boolean {
  return date === vnToday(now)
}

export function instrumentLabel(i: ReportInstrument): string {
  return { cash: 'Tiền mặt', bank: 'Chuyển khoản', other: 'Ví / khác', mixed: 'Nhiều phương thức' }[i]
}
