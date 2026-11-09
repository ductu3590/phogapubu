import { orderInKitchen, type KitchenReleasePolicy, type StorePaymentTiming } from '@/lib/kitchen-announce'
import type { OpenTableSession } from '@/lib/actions/table-session'

// Nhận diện đơn "tự vào bếp" mà POS phải tự in phiếu bếp (quán dùng phần mềm in + policy automatic).
// Đơn qua nút "Duyệt & in bếp" (pos_confirmation) đã có đường in riêng nên không tính ở đây.

/** Đơn vào bếp quá lâu thì không tự in nữa (mở POS lại sau giờ nghỉ không được xả phiếu cũ). */
export const AUTO_PRINT_MAX_AGE_MS = 30 * 60_000
/** Số phiếu tối đa xử lý mỗi lượt đọc. */
export const AUTO_PRINT_BATCH_MAX = 20

export type AutoPrintConfig = {
  mode: 'browser' | 'agent'
  kitchenReleasePolicy: KitchenReleasePolicy
  staffOrderReleasePolicy: KitchenReleasePolicy
  paymentTiming: StorePaymentTiming
}

export type AutoPrintOrder = {
  status: string
  orderSource: string
  createdAt: string
  paymentReceivedAt: string | null
  paymentMethod: string
  confirmedAt: string | null
}

export function isAutoKitchenOrder(o: AutoPrintOrder, cfg: AutoPrintConfig, nowMs: number): boolean {
  if (cfg.mode !== 'agent') return false
  if (o.orderSource === 'pos' || o.orderSource === 'reservation_preorder') return false
  const policy = o.orderSource === 'staff' ? cfg.staffOrderReleasePolicy : cfg.kitchenReleasePolicy
  if (policy !== 'automatic') return false
  if (o.confirmedAt !== null) return false
  if (!['pending', 'confirmed', 'cooking', 'ready'].includes(o.status)) return false
  // Màn bếp có thể đã đẩy sang cooking trước khi POS đọc → xét như 'confirmed'; luật trả trước/sau dùng chung với màn bếp.
  const inKitchen = orderInKitchen({
    status: 'confirmed',
    orderSource: o.orderSource,
    confirmedAt: o.confirmedAt,
    kitchenReleasePolicy: cfg.kitchenReleasePolicy,
    staffOrderReleasePolicy: cfg.staffOrderReleasePolicy,
    paymentReceivedAt: o.paymentReceivedAt,
    paymentMethod: o.paymentMethod,
    storePaymentTiming: cfg.paymentTiming,
  })
  if (!inKitchen) return false
  // Đơn khách trả trước vào bếp lúc có tiền; còn lại lúc tạo đơn.
  let enteredAt = Date.parse(o.createdAt)
  if (o.orderSource !== 'staff' && o.paymentReceivedAt) {
    enteredAt = Math.max(enteredAt, Date.parse(o.paymentReceivedAt))
  }
  if (Number.isNaN(enteredAt)) return false
  // enteredAt ở tương lai (lệch giờ máy) → coi như mới
  return nowMs - enteredAt <= AUTO_PRINT_MAX_AGE_MS
}

export function autoKitchenPrintCandidates(
  sessions: Pick<OpenTableSession, 'status' | 'table_number' | 'orders'>[],
  cfg: AutoPrintConfig,
  nowMs: number,
): { orderId: string; tableLabel: string }[] {
  const out: { orderId: string; tableLabel: string }[] = []
  for (const s of sessions) {
    if (s.status !== 'open') continue
    for (const o of s.orders) {
      const ok = isAutoKitchenOrder(
        {
          status: o.status,
          orderSource: o.order_source,
          createdAt: o.created_at,
          paymentReceivedAt: o.payment_received_at ?? null,
          // Đơn trong phiên là đơn tại bàn của quán trả sau, create_order ép payment_method = 'cash'.
          paymentMethod: 'cash',
          // RPC danh sách phiên không trả confirmed_at ở mọi bản
          confirmedAt: o.confirmed_at ?? null,
        },
        cfg,
        nowMs,
      )
      if (ok) out.push({ orderId: o.id, tableLabel: s.table_number })
    }
  }
  return out
}

export function autoPrintBanner(cfg: AutoPrintConfig | null): { tone: 'info' | 'warning'; title: string } | null {
  if (!cfg || cfg.mode !== 'agent') return null
  if (cfg.kitchenReleasePolicy === 'pos_confirmation' && cfg.staffOrderReleasePolicy === 'pos_confirmation') return null
  if (cfg.paymentTiming === 'postpay') {
    return { tone: 'info', title: 'Đơn tự vào bếp — giữ POS mở để in' }
  }
  return {
    tone: 'warning',
    title: 'Quán trả trước chưa tự in được phiếu bếp cho đơn tự vào bếp — đặt hai mục “xuống bếp” về “Chờ POS xác nhận” ở Cài đặt',
  }
}

export function createAutoPrintTracker(opts: { maxAttempts?: number; retryMs?: number } = {}) {
  const maxAttempts = opts.maxAttempts ?? 3
  const retryMs = opts.retryMs ?? 30_000
  const done = new Set<string>()
  const gaveUp = new Set<string>()
  const running = new Set<string>()
  const failures = new Map<string, { count: number; lastAt: number }>()
  return {
    due(orderIds: string[], nowMs: number): string[] {
      return orderIds.filter((id) => {
        if (done.has(id) || gaveUp.has(id) || running.has(id)) return false
        const f = failures.get(id)
        return !f || nowMs - f.lastAt >= retryMs
      })
    },
    start(orderIds: string[]): void {
      for (const id of orderIds) running.add(id)
    },
    finish(orderId: string, outcome: 'done' | 'failed', nowMs: number): 'done' | 'retry' | 'gave_up' {
      running.delete(orderId)
      if (outcome === 'done') {
        done.add(orderId)
        return 'done'
      }
      const count = (failures.get(orderId)?.count ?? 0) + 1
      failures.set(orderId, { count, lastAt: nowMs })
      if (count >= maxAttempts) {
        gaveUp.add(orderId)
        return 'gave_up'
      }
      return 'retry'
    },
  }
}
