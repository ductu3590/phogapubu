/**
 * Luật báo mất mạng ở màn POS thu ngân — hàm thuần, không đụng React / mạng.
 * Đây là NGUỒN DUY NHẤT của ngưỡng 60 giây (mất mạng mới báo) và 10 phút (nhãn "đã chờ" trên lượt gọi cũ);
 * hook, băng cảnh báo và nhãn đều import từ đây, đừng chép con số ra chỗ khác.
 * Thiết kế: docs/superpowers/specs (spec "xử lý mất mạng tạm thời", Đợt 1).
 */
import { isReviewableOrder } from './table-status'
import { clock } from './pos-timeline'
import { waitLabel } from './pos-work-queue'

/** Mất mạng đủ lâu thế này mới báo (rớt ngắn hơn coi như chưa có gì). */
export const OFFLINE_NOTICE_MS = 60_000
/** Lượt gọi chờ từ đây trở lên thì gắn nhãn "đã chờ". */
export const STALE_ORDER_MS = 600_000
/** Đơn khách gọi sát trước lúc mất mạng vẫn có thể kẹt vì mạng yếu từ trước: nới mép đầu khoảng. */
export const OUTAGE_SLACK_MS = 120_000

export type Outage = { from: number; to: number }
export type OfflineState = { downSince: number | null; lastOutage: Outage | null }
export const INITIAL_OFFLINE_STATE: OfflineState = { downSince: null, lastOutage: null }

export type OutageSession = {
  status: string
  orders: { id: string; status: string; created_at: string; order_source: string; needs_pos_confirmation?: boolean }[]
}
export type OutageOrders = { review: number; autoKitchen: number; firstAt: number | null }

/**
 * Bước chuyển trạng thái mỗi lần biết "có mạng hay không". Không có gì đổi thì trả ĐÚNG object cũ
 * để hook khỏi vẽ lại thừa.
 */
export function nextOfflineState(state: OfflineState, live: boolean, now: number): OfflineState {
  if (!live) {
    if (state.downSince !== null) return state
    return { ...state, downSince: now }
  }
  if (state.downSince === null) return state
  // Có mạng lại: chỉ ghi khoảng nếu đã mất đủ ngưỡng
  if (now - state.downSince < OFFLINE_NOTICE_MS) return { ...state, downSince: null }
  // Chập chờn: nối vào khoảng trước, giữ mốc đầu
  const from = state.lastOutage ? Math.min(state.lastOutage.from, state.downSince) : state.downSince
  return { downSince: null, lastOutage: { from, to: now } }
}

/** Người dùng tắt băng "vừa mất mạng": xoá khoảng, không đụng mốc đang mất (nếu có). */
export function dismissOutage(state: OfflineState): OfflineState {
  return { ...state, lastOutage: null }
}

/** Đang mất mạng đủ ngưỡng thì trả mốc bắt đầu, ngược lại null. Tính theo đồng hồ nên máy ngủ rồi thức vẫn đúng. */
export function offlineSince(state: OfflineState, now: number): number | null {
  if (state.downSince === null) return null
  return now - state.downSince >= OFFLINE_NOTICE_MS ? state.downSince : null
}

/** Đếm lượt gọi của khách trong khoảng mất mạng: chờ duyệt (review) và tự vào bếp (autoKitchen). */
export function outageOrders(sessions: OutageSession[], outage: Outage): OutageOrders {
  let review = 0
  let autoKitchen = 0
  let firstAt: number | null = null
  for (const s of sessions) {
    if (s.status !== 'open') continue
    for (const o of s.orders) {
      // Món nhân viên ghi tay / đặt trước không phải lượt khách gọi
      if (o.order_source === 'pos' || o.order_source === 'reservation_preorder') continue
      const at = new Date(o.created_at).getTime()
      if (at < outage.from - OUTAGE_SLACK_MS || at > outage.to) continue
      if (isReviewableOrder(o)) review++
      // Đơn tự vào bếp vẫn nằm 'pending'; đơn đã duyệt thì không còn pending
      else if (o.status === 'pending') autoKitchen++
      else continue
      if (firstAt === null || at < firstAt) firstAt = at
    }
  }
  return { review, autoKitchen, firstAt }
}

/** Nhãn cho lượt gọi chờ lâu; chưa tới ngưỡng thì null. */
export function staleOrderLabel(createdAt: number, now: number): string | null {
  if (now - createdAt < STALE_ORDER_MS) return null
  return `Gọi lúc ${clock(createdAt)} · đã chờ ${waitLabel(createdAt, now)}`
}
