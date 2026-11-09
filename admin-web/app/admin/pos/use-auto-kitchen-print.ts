'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { enqueueAutoKitchenPrints } from '@/lib/actions/auto-kitchen-print'
import { readAutoPrintConfig } from '@/lib/pos-browser-reads'
import {
  AUTO_PRINT_BATCH_MAX,
  autoKitchenPrintCandidates,
  autoPrintBanner,
  createAutoPrintTracker,
  type AutoPrintConfig,
} from '@/lib/print/auto-kitchen-print'

const CONFIG_POLL_MS = 30_000
const EVALUATE_POLL_MS = 10_000

// POS tự xếp phiếu bếp cho đơn "tự vào bếp" (quán dùng phần mềm in + chính sách automatic).
// Server kiểm lại mọi điều kiện, hook chỉ gom id và theo dõi lần thử (tracker) để không gửi lặp.
export function useAutoKitchenPrint(input: {
  supabase: ReturnType<typeof createClient>
  storeId: string
  sessions: OpenTableSession[]
  onGiveUp: (message: string) => void
}): { banner: { tone: 'info' | 'warning'; title: string } | null } {
  const { supabase, storeId, sessions, onGiveUp } = input
  const [cfg, setCfg] = useState<AutoPrintConfig | null>(null)
  const tracker = useRef(createAutoPrintTracker())
  const running = useRef(false)
  const labels = useRef(new Map<string, string>())
  // Giá trị mới nhất cho evaluate() chạy từ interval/effect mà không phải tạo lại timer
  const latest = useRef({ cfg, sessions, onGiveUp })
  latest.current = { cfg, sessions, onGiveUp }

  // Đọc cấu hình lúc mount, mỗi 30 giây, khi cửa sổ focus. Lỗi đọc: giữ cấu hình cũ.
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await readAutoPrintConfig(supabase, storeId)
        if (alive && res.ok) setCfg(res.config)
      } catch {
        // giữ cấu hình cũ
      }
    }
    void load()
    const timer = window.setInterval(load, CONFIG_POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [supabase, storeId])

  const evaluate = useMemo(() => async function run(): Promise<void> {
    if (running.current) return
    const { cfg: c, sessions: ss, onGiveUp: giveUp } = latest.current
    if (!c || !autoPrintBanner(c)) return
    const now = Date.now()
    const candidates = autoKitchenPrintCandidates(ss, c, now)
    for (const x of candidates) labels.current.set(x.orderId, x.tableLabel)
    const ids = tracker.current.due(candidates.map((x) => x.orderId), now).slice(0, AUTO_PRINT_BATCH_MAX)
    if (ids.length === 0) return

    running.current = true
    tracker.current.start(ids)
    const outcomes = new Map<string, { failed: boolean; error?: string }>()
    try {
      const res = await enqueueAutoKitchenPrints(ids)
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
      const verdict = tracker.current.finish(id, o.failed ? 'failed' : 'done', Date.now())
      if (verdict === 'gave_up') {
        giveUp(`Không tự in được phiếu bếp của ${labels.current.get(id) ?? 'đơn'}: ${o.error ?? 'lỗi không rõ'}. In lại phiếu ở lượt này.`)
      }
    }
    running.current = false
    // Còn id đến hạn thì chạy lô kế ngay
    void run()
  }, [])

  useEffect(() => { void evaluate() }, [evaluate, sessions, cfg])
  useEffect(() => {
    const timer = window.setInterval(() => void evaluate(), EVALUATE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [evaluate])

  return { banner: autoPrintBanner(cfg) }
}
