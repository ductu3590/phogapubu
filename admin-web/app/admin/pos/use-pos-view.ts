'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { readDefaultView, writeDefaultView, type PinnableView, type PosView } from '@/lib/pos-view-pref'

// Tab đang xem + màn mặc định của máy. Server / trước hydrate: null (không nháy Timeline).
// Snapshot được cache (đối tượng chỉ đổi khi có thay đổi thật) để useSyncExternalStore không lặp vô hạn.
type Snapshot = { view: PosView; defaultView: PinnableView }

let snapshot: Snapshot | null = null
let before: PosView | null = null // view trước khi hệ thống ép (force)
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
  restore: () => void
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, () => null)

  // Bấm tab: chỉ đổi tạm, KHÔNG ghi storage.
  const choose = useCallback((v: PosView) => {
    before = null
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
    if (before === null) before = cur.view
    set({ ...cur, view: v })
  }, [])

  const restore = useCallback(() => {
    if (before === null) return
    const b = before
    before = null
    set({ ...getSnapshot(), view: b })
  }, [])

  return { view: snap?.view ?? null, defaultView: snap?.defaultView ?? null, choose, pin, force, restore }
}
