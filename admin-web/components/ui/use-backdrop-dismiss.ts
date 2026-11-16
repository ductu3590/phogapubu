'use client'

import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { createBackdropGuard } from '@/lib/backdrop-dismiss'

/**
 * Gắn vào phần tử NỀN của popup (<dialog> hoặc lớp phủ): `{...useBackdropDismiss(close)}`.
 * Chỉ đóng khi nhấn VÀ thả đều trên nền — quét chọn chữ trong ô nhập rồi lỡ thả chuột ra ngoài không đóng popup
 * (lý do ở lib/backdrop-dismiss.ts). `enabled=false`: không bao giờ đóng khi bấm nền.
 */
export function useBackdropDismiss(onDismiss: () => void, enabled = true) {
  const guard = useRef(createBackdropGuard())
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => guard.current.down(e.target === e.currentTarget),
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (guard.current.click(e.target === e.currentTarget) && enabled) onDismiss()
    },
  }
}
