// Báo cáo ngày (PA-1): kiểu dữ liệu + đọc JSON của RPC get_daily_report + hàm ngày giờ VN.
// Tiền đã tính ở server — ở đây chỉ đổi tên trường / ép kiểu, KHÔNG cộng trừ gì.

export type ReportInstrument = 'cash' | 'bank' | 'other' | 'mixed'

export type DailyReportBill = {
  key: string; paidAt: string; sessionIds: string[]; orderIds: string[]; merged: boolean
  total: number; instrument: ReportInstrument; itemsCount: number; tableLabel: string; receivedByName: string | null
}

export type DailyReportAdjustment = {
  at: string; itemName: string; quantity: number; amount: number
  type: 'cancelled' | 'gift'; reason: string | null; tableLabel: string; byName: string | null
}

export type DailyReport = {
  date: string
  totals: { revenue: number; cash: number; bank: number; other: number; billsCount: number }
  open: { tablesCount: number; provisionalTotal: number }
  bills: DailyReportBill[]
  adjustments: DailyReportAdjustment[]
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strArr = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string')

function instrument(v: unknown): ReportInstrument {
  return v === 'cash' || v === 'bank' || v === 'mixed' ? v : 'other'
}

export function parseDailyReport(raw: unknown): DailyReport {
  const r = obj(raw)
  const t = obj(r.totals)
  const o = obj(r.open)
  return {
    date: str(r.date),
    totals: { revenue: num(t.revenue), cash: num(t.cash), bank: num(t.bank), other: num(t.other), billsCount: num(t.bills_count) },
    open: { tablesCount: num(o.tables_count), provisionalTotal: num(o.provisional_total) },
    bills: arr(r.bills).map((b0) => {
      const b = obj(b0)
      return {
        key: str(b.key), paidAt: str(b.paid_at), sessionIds: strArr(b.session_ids), orderIds: strArr(b.order_ids),
        merged: b.merged === true, total: num(b.total), instrument: instrument(b.instrument),
        itemsCount: num(b.items_count), tableLabel: str(b.table_label) || '—', receivedByName: strOrNull(b.received_by_name),
      }
    }),
    adjustments: arr(r.adjustments).map((a0) => {
      const a = obj(a0)
      return {
        at: str(a.at), itemName: str(a.item_name), quantity: num(a.quantity), amount: num(a.amount),
        type: a.type === 'gift' ? 'gift' : 'cancelled', reason: strOrNull(a.reason),
        tableLabel: str(a.table_label) || '—', byName: strOrNull(a.by_name),
      }
    }),
  }
}

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
