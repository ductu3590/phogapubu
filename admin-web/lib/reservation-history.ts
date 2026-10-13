// Lịch sử đặt bàn (trang Đặt bàn, cột "Đã qua" — 2026-10-13). Phần THUẦN: đổi hàng RPC, xếp kết quả, thống kê.
// Nguồn: RPC list_reservation_history (mig 103) — mọi lượt đã kết thúc + lượt đã đến mà bill đã đóng.
import type { ReservationStatus } from '@/lib/actions/reservations'

export type ReservationHistoryRpcRow = {
  reservation_id: string
  status: ReservationStatus
  customer_name: string
  customer_phone: string
  party_size: number
  arrival_at: string
  note: string | null
  session_closed?: boolean | null
  table_numbers?: string[] | null
}

export type ReservationOutcome = 'done' | 'no_show' | 'cancel_customer' | 'cancel_store' | 'rejected'

export type ReservationHistoryRow = {
  reservationId: string
  outcome: ReservationOutcome
  customerName: string
  customerPhone: string
  partySize: number
  arrivalAt: string
  note: string | null
  tableNumbers: string[]
}

/** Khách đã đến + bill đã đóng (thu tiền, Bỏ bàn hay hết hạn) đều là "Hoàn tất" — khách đã ngồi ăn. */
export function reservationOutcome(status: ReservationStatus): ReservationOutcome | null {
  switch (status) {
    case 'completed':
    case 'arrived': return 'done'
    case 'no_show': return 'no_show'
    case 'cancelled_by_customer': return 'cancel_customer'
    case 'cancelled_by_store': return 'cancel_store'
    case 'rejected': return 'rejected'
    default: return null
  }
}

export function toReservationHistoryRows(rows: ReservationHistoryRpcRow[]): ReservationHistoryRow[] {
  const out: ReservationHistoryRow[] = []
  for (const row of rows) {
    const outcome = reservationOutcome(row.status)
    if (!outcome) continue
    out.push({
      reservationId: row.reservation_id,
      outcome,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      partySize: row.party_size,
      arrivalAt: row.arrival_at,
      note: row.note,
      tableNumbers: [...(row.table_numbers ?? [])].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
    })
  }
  return out
}

export type ReservationHistoryStats = {
  total: number
  guests: number
  done: number
  noShow: number
  /** Khách huỷ + quán huỷ + quán từ chối. */
  cancelled: number
}

export function summarizeReservationHistory(rows: ReservationHistoryRow[]): ReservationHistoryStats {
  const stats: ReservationHistoryStats = { total: rows.length, guests: 0, done: 0, noShow: 0, cancelled: 0 }
  for (const row of rows) {
    if (row.outcome === 'done') {
      stats.done += 1
      // Chỉ đếm khách thật sự đến; lượt huỷ / không đến không mang khách vào quán.
      stats.guests += row.partySize
    } else if (row.outcome === 'no_show') stats.noShow += 1
    else stats.cancelled += 1
  }
  return stats
}

/** Phần trăm làm tròn, 0 khi chưa có lượt nào (không chia cho 0). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}
