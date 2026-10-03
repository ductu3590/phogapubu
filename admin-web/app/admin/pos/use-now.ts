'use client'

import { useSyncExternalStore } from 'react'

// Đồng hồ chung của màn POS, nhịp 30 giây. Server trả null: thanh Timeline đặt theo "bây giờ",
// nếu server và trình duyệt mỗi bên tự Date.now() thì lệch vài mili giây → lỗi hydration.
const TICK_MS = 30_000
let current = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    current = Date.now()
    timer = setInterval(() => {
      current = Date.now()
      for (const l of listeners) l()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
