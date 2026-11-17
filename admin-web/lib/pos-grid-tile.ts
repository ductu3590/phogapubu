// Nội dung một ô bàn trên lưới "Sơ đồ" của POS + hành động khi bấm ô. Hàm thuần, không đọc đồng hồ.

import type { TableVisualState } from '@/components/ui/status'
import { clockHHmm, seatedLabel, type GridContext } from '@/lib/pos-floor-grid'
import { pendingCount, tableVisualState } from '@/lib/table-status'
import type { TrayAssignment } from '@/lib/tray-colors'

export type GridTileView = {
  visual: TableVisualState
  money: number | null
  seated: string | null
  trayIndex: number | null
  pending: number
  heldAt: string | null
  calling: boolean
}

export function gridTileView(
  tableId: string,
  ctx: GridContext & { trays: Map<string, TrayAssignment>; callingSessionIds: Set<string>; now: number },
): GridTileView {
  const session = ctx.sessionByTable.get(tableId)
  const held = ctx.heldByTable.get(tableId)
  const visual = tableVisualState(session, { prearrivalReserved: ctx.heldByTable.has(tableId) })
  // Mâm nhiều bàn: mọi bàn cùng trỏ về một phiên nên cùng tiền / giờ / số mâm.
  return {
    visual,
    money: session ? session.total : null,
    seated: session ? seatedLabel(session.opened_at, ctx.now) : null,
    trayIndex: session ? (ctx.trays.get(session.session_id)?.index ?? null) : null,
    pending: pendingCount(session),
    heldAt: !session && held ? clockHHmm(held.arrivalAt) : null,
    calling: !!session && ctx.callingSessionIds.has(session.session_id),
  }
}

export type GridTileAction =
  | { kind: 'session'; sessionId: string; additive: boolean }
  | { kind: 'order-free'; tableId: string }
  | { kind: 'pick-free'; tableId: string; enterFreeMerge: boolean }
  | { kind: 'reservation'; reservationId: string }
  | { kind: 'reservation-pick'; tableId: string }
  | { kind: 'none' }

/** Giữ đúng hành vi onClick của floor-map.tsx: chế độ chọn bàn cho booking tách hẳn chọn/gộp bill. */
export function gridTileAction(
  tableId: string,
  input: { ctx: GridContext; mode: 'normal' | 'reservation'; mergeMode: boolean; freeMerge: boolean; modifier: boolean; reservationBlocked: boolean },
): GridTileAction {
  const session = input.ctx.sessionByTable.get(tableId)
  if (input.mode === 'reservation') {
    if (session || input.reservationBlocked) return { kind: 'none' }
    return { kind: 'reservation-pick', tableId }
  }
  // Đang ghép bàn trống: chỉ bàn trống (không giữ chỗ) chọn được; bàn có phiên / đang giữ không làm gì.
  if (input.freeMerge) {
    if (session || input.ctx.heldByTable.has(tableId)) return { kind: 'none' }
    return { kind: 'pick-free', tableId, enterFreeMerge: false }
  }
  if (session) return { kind: 'session', sessionId: session.session_id, additive: input.modifier || input.mergeMode }
  // Đang gộp bill: mâm chỉ gộp phiên đang mở, bấm bàn trống (kể cả bàn đang giữ) không làm gì.
  if (input.mergeMode) return { kind: 'none' }
  const held = input.ctx.heldByTable.get(tableId)
  if (held) return { kind: 'reservation', reservationId: held.reservationId }
  // Bàn trống: bấm thường = mở hộp gọi món; Ctrl/Cmd+bấm = vào chế độ Ghép bàn trống với bàn này.
  if (input.modifier) return { kind: 'pick-free', tableId, enterFreeMerge: true }
  return { kind: 'order-free', tableId }
}
