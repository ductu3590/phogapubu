import type { OpenTableSession } from '@/lib/actions/table-session'
import {
  AUTO_PRINT_BATCH_MAX,
  autoKitchenPrintCandidates,
  autoPrintBanner,
  createAutoPrintTracker,
  type AutoPrintConfig,
} from '@/lib/print/auto-kitchen-print'

type EnqueueResult =
  | { ok: true; results: { orderId: string; status: 'queued' | 'already' | 'skipped' | 'error'; error?: string }[] }
  | { ok: false; error: string }

// Bộ chạy lô tự in, tách khỏi React để test được. Tracker sống cùng runner: id đã done / đang chạy
// không bao giờ gửi lại; id lỗi chờ thử lại; quá số lần thì bỏ cuộc và báo qua onGiveUp.
export function createAutoPrintRunner(deps: {
  getState: () => { cfg: AutoPrintConfig | null; sessions: OpenTableSession[] }
  enqueue: (ids: string[]) => Promise<EnqueueResult>
  onGiveUp: (message: string) => void
  isAlive: () => boolean
  now?: () => number
}) {
  const tracker = createAutoPrintTracker()
  const labels = new Map<string, string>()
  const now = deps.now ?? Date.now
  let running = false

  async function runBatch(ids: string[]): Promise<void> {
    tracker.start(ids)
    const outcomes = new Map<string, { failed: boolean; error?: string }>()
    try {
      const res = await deps.enqueue(ids)
      if (!res.ok) {
        for (const id of ids) outcomes.set(id, { failed: true, error: res.error })
      } else {
        for (const r of res.results) outcomes.set(r.orderId, { failed: r.status === 'error', error: r.error })
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Không xếp được phiếu'
      for (const id of ids) outcomes.set(id, { failed: true, error })
    }
    // Id server không trả về coi như thất bại để không kẹt ở trạng thái "đang chạy"
    for (const id of ids) {
      const o = outcomes.get(id) ?? { failed: true, error: 'Không có phản hồi' }
      const verdict = tracker.finish(id, o.failed ? 'failed' : 'done', now())
      const label = labels.get(id) ?? 'đơn'
      if (verdict !== 'retry') labels.delete(id)
      if (verdict === 'gave_up') {
        try {
          deps.onGiveUp(`Không tự in được phiếu bếp của ${label}: ${o.error ?? 'lỗi không rõ'}. In lại phiếu ở lượt này.`)
        } catch {
          // báo lỗi hỏng thì thôi, không để chặn các đơn còn lại và cờ running
        }
      }
    }
  }

  async function evaluate(): Promise<void> {
    // Lặp thay vì đệ quy: còn id đến hạn thì chạy lô kế ngay
    while (!running && deps.isAlive()) {
      const { cfg, sessions } = deps.getState()
      if (!cfg || !autoPrintBanner(cfg)) return
      const t = now()
      const candidates = autoKitchenPrintCandidates(sessions, cfg, t)
      for (const c of candidates) labels.set(c.orderId, c.tableLabel)
      const ids = tracker.due(candidates.map((c) => c.orderId), t).slice(0, AUTO_PRINT_BATCH_MAX)
      if (ids.length === 0) return
      running = true
      try {
        await runBatch(ids)
      } finally {
        running = false
      }
    }
  }

  return { evaluate }
}
