// Danh sách bàn đích cho nút "Chuyển sang bàn trống" trên POS (spec chuyển bàn §3.1/§3.4).
// Hàm thuần — không đọc đồng hồ — để test được. Luật loại bàn phải KHỚP `prearrivalReservedTableIds`
// ở pos-client.tsx và `table_has_current_reservation_hold` của server (RPC cũng chặn, đây chỉ để
// không đưa ra lựa chọn mà server sẽ từ chối).

import { PREARRIVAL_HOLD_MINUTES } from '@/lib/staff-reserved-tables'
import { clock, vnDayStart } from '@/lib/pos-timeline'

const MIN = 60_000
const DAY = 24 * 60 * MIN

export type ReservationLike = {
  status: string
  sessionId: string | null
  arrivalAt: string
  planningHoldMinutes: number
  tableIds: string[]
}

export type MoveTarget = {
  id: string
  table_number: string
  area_id: string | null
  /** Giờ hẹn (ISO) sớm nhất còn tới trong cùng ngày giờ VN — chưa vào khung giữ nên vẫn chuyển được, nhưng phải hỏi lại. */
  laterReservationAt: string | null
}

export function moveTargets(
  freeTables: { id: string; table_number: string; area_id: string | null }[],
  reservations: ReservationLike[],
  nowMs: number,
): MoveTarget[] {
  // Chỉ đặt bàn đã xác nhận mà khách chưa đến mới giữ bàn.
  const waiting = reservations.filter((r) => r.status === 'confirmed' && r.sessionId === null)
  const holdLead = PREARRIVAL_HOLD_MINUTES * MIN
  const dayStart = vnDayStart(nowMs)
  const dayEnd = dayStart + DAY

  const held = new Set<string>()
  const later = new Map<string, number>()
  for (const r of waiting) {
    const arrival = new Date(r.arrivalAt).getTime()
    if (Number.isNaN(arrival)) continue
    if (arrival - holdLead <= nowMs && arrival + r.planningHoldMinutes * MIN > nowMs) {
      for (const id of r.tableIds) held.add(id)
    } else if (arrival - holdLead > nowMs && arrival >= dayStart && arrival < dayEnd) {
      for (const id of r.tableIds) {
        const prev = later.get(id)
        if (prev === undefined || arrival < prev) later.set(id, arrival)
      }
    }
  }

  return freeTables
    .filter((t) => !held.has(t.id))
    .map((t) => {
      const at = later.get(t.id)
      return {
        id: t.id,
        table_number: t.table_number,
        area_id: t.area_id,
        laterReservationAt: at === undefined ? null : new Date(at).toISOString(),
      }
    })
}

/**
 * Câu hỏi xác nhận khi chuyển vào bàn có lịch đặt muộn hơn. Nói rõ mốc khách mất quyền tự gọi món qua QR:
 * từ (giờ hẹn − PREARRIVAL_HOLD_MINUTES) server chặn đơn khách vào bàn đang giữ cho khách đặt.
 */
export function laterReservationConfirmText(tableNumber: string, arrivalIso: string): string {
  const arrival = new Date(arrivalIso).getTime()
  return `${tableNumber} có khách đặt lúc ${clock(arrival)}. Từ ${clock(arrival - PREARRIVAL_HOLD_MINUTES * MIN)} khách không tự gọi món qua QR được. Vẫn chuyển?`
}
