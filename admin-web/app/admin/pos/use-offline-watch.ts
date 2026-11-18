'use client'

import { useCallback, useEffect, useReducer, useState } from 'react'
import {
  INITIAL_OFFLINE_STATE,
  dismissOutage,
  msUntilNotice,
  nextOfflineState,
  offlineSince,
  type OfflineState,
  type Outage,
} from '@/lib/pos-offline-watch'

// Theo dõi "mất mạng đủ 60 giây" cho màn POS. Chỉ giữ trong bộ nhớ trang (không localStorage, không gọi mạng):
// tải lại trang giữa lúc mất mạng thì mất mốc; nhãn "đã chờ" 10 phút trên lượt gọi cũ là lưới đỡ cho trường hợp đó.
type Action = { type: 'live'; live: boolean; now: number } | { type: 'dismiss' }

function reduce(state: OfflineState, action: Action): OfflineState {
  return action.type === 'live' ? nextOfflineState(state, action.live, action.now) : dismissOutage(state)
}

export function useOfflineWatch(live: boolean): { downSince: number | null; outage: Outage | null; dismiss: () => void } {
  const [state, dispatchState] = useReducer(reduce, INITIAL_OFFLINE_STATE)
  // "Bây giờ" giữ trong state (không gọi Date.now() lúc render): cập nhật khi tới mốc báo hoặc khi tab quay lại.
  const [now, setNow] = useState(0)

  useEffect(() => {
    dispatchState({ type: 'live', live, now: Date.now() })
  }, [live])

  const downAt = state.downSince
  useEffect(() => {
    if (downAt === null) return
    // Hẹn đúng mốc downSince + 60 giây (+ đệm 50 ms). Hẹn xong đọc lại đồng hồ: nếu vẫn chưa tới ngưỡng
    // (đồng hồ đọc hụt, hoặc bị chỉnh) thì tự hẹn lại, không thì băng đỏ mất cả đợt mất mạng.
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = (wait: number) => {
      timer = setTimeout(() => {
        const t = Date.now()
        setNow(t)
        const next = msUntilNotice(downAt, t)
        if (next !== null) arm(next)
      }, wait)
    }
    arm(msUntilNotice(downAt, Date.now()) ?? 0)
    // Tab nền bị trình duyệt giãn timer: quay lại tab thì tính lại theo đồng hồ
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [downAt])

  const dismiss = useCallback(() => dispatchState({ type: 'dismiss' }), [])

  // `now` chỉ đứng sau mốc mất mạng khi timer đã chạy; trước đó offlineSince trả null (chưa đủ ngưỡng)
  return { downSince: downAt === null ? null : offlineSince(state, now), outage: state.lastOutage, dismiss }
}
