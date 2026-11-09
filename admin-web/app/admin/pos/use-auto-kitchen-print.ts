'use client'

import { useEffect, useRef, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { enqueueAutoKitchenPrints } from '@/lib/actions/auto-kitchen-print'
import { readAutoPrintConfig } from '@/lib/pos-browser-reads'
import { autoPrintBanner, type AutoPrintConfig } from '@/lib/print/auto-kitchen-print'
import { createAutoPrintRunner } from './auto-print-runner'

const CONFIG_POLL_MS = 30_000
const EVALUATE_POLL_MS = 10_000

// POS tự xếp phiếu bếp cho đơn "tự vào bếp" (quán dùng phần mềm in + chính sách automatic).
// Server kiểm lại mọi điều kiện; việc gom lô + theo dõi lần thử nằm ở auto-print-runner (test được).
export function useAutoKitchenPrint(input: {
  supabase: ReturnType<typeof createClient>
  storeId: string
  sessions: OpenTableSession[]
  onGiveUp: (message: string) => void
}): { banner: { tone: 'info' | 'warning'; title: string } | null } {
  const { supabase, storeId, sessions, onGiveUp } = input
  const [cfg, setCfg] = useState<AutoPrintConfig | null>(null)
  // Giá trị mới nhất cho runner chạy từ interval/effect mà không phải tạo lại timer
  const latest = useRef({ cfg, sessions, onGiveUp })
  const alive = useRef(true)
  const runnerRef = useRef<ReturnType<typeof createAutoPrintRunner> | null>(null)

  useEffect(() => {
    latest.current = { cfg, sessions, onGiveUp }
  })

  // Một runner (một tracker) cho cả vòng đời trang
  useEffect(() => {
    alive.current = true
    runnerRef.current = createAutoPrintRunner({
      getState: () => ({ cfg: latest.current.cfg, sessions: latest.current.sessions }),
      enqueue: enqueueAutoKitchenPrints,
      onGiveUp: (m) => latest.current.onGiveUp(m),
      isAlive: () => alive.current,
    })
    return () => {
      alive.current = false
      runnerRef.current = null
    }
  }, [])

  // Đọc cấu hình lúc mount, mỗi 30 giây, khi cửa sổ focus. Lỗi đọc: giữ cấu hình cũ.
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const res = await readAutoPrintConfig(supabase, storeId)
        if (live && res.ok) setCfg(res.config)
      } catch {
        // giữ cấu hình cũ
      }
    }
    void load()
    const timer = window.setInterval(load, CONFIG_POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [supabase, storeId])

  useEffect(() => { void runnerRef.current?.evaluate() }, [sessions, cfg])
  useEffect(() => {
    const timer = window.setInterval(() => void runnerRef.current?.evaluate(), EVALUATE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [])

  return { banner: autoPrintBanner(cfg) }
}
