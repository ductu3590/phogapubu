// Danh sách "Việc cần xử lý" của /admin/pos (bản Stitch P05): gộp mọi việc thu ngân phải làm
// vào MỘT danh sách, việc gấp lên đầu. Hàm thuần — dữ liệu đã có sẵn từ POS, không gọi server.

import type { StatusTone } from '@/components/ui/status'
import type { TimelineBar } from './pos-timeline'

export type WorkFilter = 'all' | 'orders' | 'calls' | 'booking'

type SessionLike = {
  session_id: string
  status: string
  table_number: string
  orders: { id: string; status: string; created_at: string; order_source: string }[]
  /** mig 089: lượt bị thu ngân từ chối — vẫn giữ số lượt (khớp Mini App), không vào hàng việc. */
  rejected_orders?: { id: string; status: string; created_at: string; order_source: string }[]
}
type RequestLike = { id: string; table_id: string; session_id: string | null; table_number: string; created_at: string; last_ping_at: string; ping_count: number }
type ReservationLike = { reservationId: string; status: string; arrivalAt: string; sessionId: string | null }
type CustomerCallLike = { taskId: string; reservationId: string; arrivalAt: string; dueAt: string }

export type WorkItem =
  | { kind: 'call'; key: string; filter: 'calls'; tone: StatusTone; since: number; requestId: string; sessionId: string | null }
  | { kind: 'order'; key: string; filter: 'orders'; tone: StatusTone; since: number; orderId: string; sessionId: string; round: number }
  | { kind: 'reservation'; key: string; filter: 'booking'; tone: StatusTone; since: number; reservationId: string; reason: ReservationReason; minutes: number
      /** Việc "gọi nhắc khách" của cùng đặt bàn — gộp vào thẻ này thay vì một thẻ riêng. */
      callTaskId?: string }
  | { kind: 'customer-call'; key: string; filter: 'booking'; tone: StatusTone; since: number; taskId: string; reservationId: string }

export type ReservationReason = 'conflict' | 'late' | 'due' | 'pending' | 'change' | 'upcoming'

/** Đơn khách gọi mà thu ngân phải duyệt: bỏ món ghi tay (đã phục vụ) và món đặt trước (luồng riêng). */
export function isReviewableOrder(order: { status: string; order_source: string }): boolean {
  return order.status === 'pending' && order.order_source !== 'pos' && order.order_source !== 'reservation_preorder'
}

/**
 * Số lượt gọi trong phiên (1, 2, 3…) theo giờ tạo, tính cả lượt đã duyệt — để thu ngân nói
 * "lượt 2 của Mâm 1" khớp với phiếu in. Món ghi tay và món đặt trước không phải lượt khách gọi.
 */
export function orderRound(session: SessionLike, orderId: string): number {
  // Đánh số lượt khách / nhân viên gọi, TÍNH CẢ lượt bị từ chối (khách đã thật sự gửi lượt đó) —
  // cùng quy tắc với Mini App (mini-app/src/utils/round-status.ts roundNumbers) để hai bên gọi
  // một lượt bằng cùng một số khi đối chứng. Ghi tay / món đặt trước không mang số.
  const rounds = [...session.orders, ...(session.rejected_orders ?? [])]
    .filter((o) => o.order_source !== 'pos' && o.order_source !== 'reservation_preorder')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const index = rounds.findIndex((o) => o.id === orderId)
  return index === -1 ? rounds.length + 1 : index + 1
}

/** Đặt bàn trong vòng ngần này mới vào danh sách việc (sớm hơn thì chỉ thấy trên Timeline). */
const UPCOMING_WINDOW_MINUTES = 60

// Thứ tự ưu tiên: khách đang chờ người > việc chặn bếp > khách đặt bàn có vấn đề > việc giấy tờ.
const RANK: Record<string, number> = {
  call: 0,
  order: 1,
  'reservation:conflict': 2,
  'reservation:late': 3,
  'reservation:due': 4,
  'customer-call': 5,
  'reservation:pending': 6,
  'reservation:change': 7,
  'reservation:upcoming': 8,
}

const rankOf = (item: WorkItem) => RANK[item.kind === 'reservation' ? `reservation:${item.reason}` : item.kind] ?? 99

export function buildWorkQueue(input: {
  sessions: SessionLike[]
  requests: RequestLike[]
  reservations: ReservationLike[]
  /** Một thanh Timeline cho mỗi đặt bàn — nguồn duy nhất của "trễ" và "xung đột". */
  reservationBars: Map<string, TimelineBar>
  customerCalls: CustomerCallLike[]
  now: number
}): WorkItem[] {
  const { now } = input
  const items: WorkItem[] = []

  for (const r of input.requests) {
    items.push({ kind: 'call', key: `call:${r.id}`, filter: 'calls', tone: 'warning', since: new Date(r.created_at).getTime(), requestId: r.id, sessionId: r.session_id })
  }

  for (const s of input.sessions) {
    if (s.status !== 'open') continue
    for (const o of s.orders) {
      if (!isReviewableOrder(o)) continue
      items.push({ kind: 'order', key: `order:${o.id}`, filter: 'orders', tone: 'warning', since: new Date(o.created_at).getTime(), orderId: o.id, sessionId: s.session_id, round: orderRound(s, o.id) })
    }
  }

  // Gọi nhắc khách gắn theo đặt bàn: có thẻ đặt bàn thì gộp vào đó (anh Tú: 2 thẻ cùng một khách là thừa).
  const callByReservation = new Map(input.customerCalls.map((t) => [t.reservationId, t.taskId]))
  const merged = new Set<string>()

  for (const r of input.reservations) {
    if (r.sessionId) continue
    const arrival = new Date(r.arrivalAt).getTime()
    const minutes = Math.round((now - arrival) / 60_000)
    const bar = input.reservationBars.get(r.reservationId)
    let reason: ReservationReason | null = null
    if (r.status === 'pending') reason = 'pending'
    else if (r.status === 'change_requested') reason = 'change'
    else if (r.status === 'confirmed') {
      if (bar?.conflict) reason = 'conflict'
      else if (bar?.lateMinutes) reason = 'late'
      else if (minutes >= 0) reason = 'due'
      else if (-minutes <= UPCOMING_WINDOW_MINUTES || callByReservation.has(r.reservationId)) reason = 'upcoming'
    }
    if (!reason) continue
    const callTaskId = callByReservation.get(r.reservationId)
    if (callTaskId) merged.add(callTaskId)
    const tone: StatusTone = reason === 'conflict' || reason === 'late' ? 'critical' : reason === 'upcoming' ? 'accent' : 'warning'
    items.push({ kind: 'reservation', key: `res:${r.reservationId}`, filter: 'booking', tone, since: arrival, reservationId: r.reservationId, reason, minutes, callTaskId })
  }

  // Server chỉ trả việc gọi nhắc đã đến hạn (POS cũ cũng hiện nguyên danh sách) — không lọc lại.
  for (const t of input.customerCalls) {
    if (merged.has(t.taskId)) continue
    items.push({ kind: 'customer-call', key: `cc:${t.taskId}`, filter: 'booking', tone: 'info', since: new Date(t.dueAt).getTime(), taskId: t.taskId, reservationId: t.reservationId })
  }

  // Cùng hạng thì việc chờ lâu nhất lên trước.
  return items.sort((a, b) => rankOf(a) - rankOf(b) || a.since - b.since)
}

export function countByFilter(items: WorkItem[]): Record<WorkFilter, number> {
  const out: Record<WorkFilter, number> = { all: items.length, orders: 0, calls: 0, booking: 0 }
  for (const i of items) out[i.filter]++
  return out
}

/** "vừa xong" / "3 phút" / "1 giờ 5 phút". */
export function waitLabel(fromMs: number, now: number): string {
  const m = Math.max(0, Math.floor((now - fromMs) / 60_000))
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút`
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`
}
