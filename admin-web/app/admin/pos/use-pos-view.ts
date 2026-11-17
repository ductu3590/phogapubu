'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { createForcedViewMemory, readDefaultView, writeDefaultView, type PinnableView, type PosView } from '@/lib/pos-view-pref'

// Tab đang xem + màn mặc định của máy. Server / trước hydrate: null (không nháy Timeline).
// Snapshot được cache (đối tượng chỉ đổi khi có thay đổi thật) để useSyncExternalStore không lặp vô hạn.
type Snapshot = { view: PosView; defaultView: PinnableView }

let snapshot: Snapshot | null = null
const forced = createForcedViewMemory() // view trước khi hệ thống ép (force)
const listeners = new Set<() => void>()

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function getSnapshot(): Snapshot {
  if (!snapshot) {
    const d = readDefaultView(storage())
    snapshot = { view: d, defaultView: d }
  }
  return snapshot
}

function set(next: Snapshot) {
  if (snapshot && snapshot.view === next.view && snapshot.defaultView === next.defaultView) return
  snapshot = next
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function usePosView(): {
  view: PosView | null
  defaultView: PinnableView | null
  choose: (v: PosView) => void
  pin: (v: PinnableView) => boolean
  force: (v: PosView) => void
  /** Trả về tab vừa quay lại (null = không có gì để trả). */
  restore: () => PosView | null
  /** Rời POS (unmount): quên tab đã ép, để lần ép sau ở POS mới không trả về tab cũ. */
  reset: () => void
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => null)

  // Bấm tab: chỉ đổi tạm, KHÔNG ghi storage.
  const choose = useCallback((v: PosView) => {
    forced.clear()
    set({ ...getSnapshot(), view: v })
  }, [])

  // "Đặt làm mặc định máy này".
  const pin = useCallback((v: PinnableView) => {
    const ok = writeDefaultView(storage(), v)
    if (ok) set({ ...getSnapshot(), defaultView: v })
    return ok
  }, [])

  // Hệ thống ép (chọn bàn cho đặt bàn): nhớ view cũ một lần.
  const force = useCallback((v: PosView) => {
    const cur = getSnapshot()
    forced.remember(cur.view)
    set({ ...cur, view: v })
  }, [])

  const restore = useCallback(() => {
    const b = forced.take()
    if (b !== null) set({ ...getSnapshot(), view: b })
    return b
  }, [])

  const reset = useCallback(() => forced.clear(), [])

  return { view: snap?.view ?? null, defaultView: snap?.defaultView ?? null, choose, pin, force, restore, reset }
}
