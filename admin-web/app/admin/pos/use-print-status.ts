'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readPrintStatus, type PrintStatus } from '@/lib/pos-browser-reads'

const AGENT_POLL_MS = 5_000
const BROWSER_POLL_MS = 60_000

// Trạng thái phần mềm in + phiếu lỗi cho băng đỏ POS. Đọc thẳng từ TRÌNH DUYỆT (không qua server action, xem
// lib/pos-browser-reads.ts và CLAUDE.md 2026-10-04): 5 giây một lần khi `agent`, 60 giây khi `browser`
// (để biết quán vừa bật phần mềm in ở máy khác), và đọc lại khi cửa sổ focus. Lỗi đọc: giữ trạng thái cũ.
export function usePrintStatus(storeId: string): { status: PrintStatus | null; reload: () => Promise<void> } {
  const client = useMemo(() => createClient(), [])
  const [status, setStatus] = useState<PrintStatus | null>(null)
  const inflight = useRef(false)
  const alive = useRef(true)

  const reload = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    try {
      const res = await readPrintStatus(client, storeId)
      if (alive.current && res.ok) setStatus(res.status)
    } catch {
      // mất mạng thoáng qua: giữ trạng thái cũ
    } finally {
      inflight.current = false
    }
  }, [client, storeId])

  const mode = status?.mode ?? 'browser'
  useEffect(() => {
    alive.current = true
    const first = window.setTimeout(() => void reload(), 0)
    const timer = window.setInterval(() => void reload(), mode === 'agent' ? AGENT_POLL_MS : BROWSER_POLL_MS)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => {
      alive.current = false
      window.clearTimeout(first)
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [reload, mode])

  return { status, reload }
}
