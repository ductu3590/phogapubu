'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readCashShiftState } from '@/lib/pos-browser-reads'
import type { CashShiftState } from '@/lib/cash-shift'

const POLL_MS = 15_000

/**
 * Trạng thái ca của POS (mig 122): đọc khi vào trang, mỗi 15 giây và khi cửa sổ được focus — thẳng từ trình duyệt,
 * không qua server action (xem lib/pos-browser-reads.ts). Đọc lỗi thì GIỮ state cũ (mất mạng không làm nút ca biến
 * mất); chưa đọc được lần nào (vd. Vercel lên trước migration, RPC chưa có) thì state null và POS như hôm nay.
 */
export function useCashShift(storeId: string): { state: CashShiftState | null; reload: () => void } {
  const client = useMemo(() => createClient(), [])
  const [state, setState] = useState<CashShiftState | null>(null)
  const seq = useRef(0)
  const alive = useRef(true)

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const res = await readCashShiftState(client, storeId)
      // Lần đọc cũ về sau lần đọc mới (mạng chậm) thì bỏ, không ghi đè trạng thái mới hơn.
      if (alive.current && res.ok && mine === seq.current) setState(res.state)
    } catch {
      // giữ state cũ
    }
  }, [client, storeId])

  useEffect(() => {
    alive.current = true
    // Lần đầu đẩy sang tick sau (như use-print-status): không setState đồng bộ trong thân effect.
    const first = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => void load(), POLL_MS)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      alive.current = false
      window.clearTimeout(first)
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  return { state, reload: () => void load() }
}
