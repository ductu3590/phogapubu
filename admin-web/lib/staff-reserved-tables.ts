// Bàn đặt trước ở màn nhân viên: bàn nào "đang giữ" (tô cam + cảnh báo khi bấm), bàn nào chỉ ghi
// "Đặt HH:MM". Cùng mốc 60 phút trước giờ hẹn với POS (prearrivalReservedTableIds) và với khoá bàn
// của server cho khách quét QR (mig 075) — ba nơi phải cùng một luật.

export const PREARRIVAL_HOLD_MINUTES = 60

export type ReservedLike = { tableId: string; arrivalAt: string; holdEndsAt: string }

export type TableReservation<T extends ReservedLike> = {
  /** Đặt bàn gần nhất chưa hết giờ giữ của bàn này. */
  next: T
  /** Đã vào khung giữ bàn (từ 60 phút trước giờ hẹn) — bàn coi như đã có chủ. */
  held: boolean
}

export function reservationsByTable<T extends ReservedLike>(rows: T[], now: number): Map<string, TableReservation<T>> {
  const out = new Map<string, TableReservation<T>>()
  for (const r of rows) {
    if (new Date(r.holdEndsAt).getTime() <= now) continue
    const current = out.get(r.tableId)
    if (current && new Date(current.next.arrivalAt).getTime() <= new Date(r.arrivalAt).getTime()) continue
    const held = new Date(r.arrivalAt).getTime() - PREARRIVAL_HOLD_MINUTES * 60_000 <= now
    out.set(r.tableId, { next: r, held })
  }
  return out
}
