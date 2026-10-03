'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Toast: báo kết quả NGẮN của một việc vừa xong rồi tự đi.
 * Lỗi/tình trạng kéo dài (mất mạng, chưa rõ kết quả thu tiền) KHÔNG dùng toast — dùng <Banner>.
 */
export type ToastTone = 'success' | 'error' | 'info'
type ToastItem = { id: number; tone: ToastTone; title: ReactNode; description?: ReactNode }
type ToastInput = Omit<ToastItem, 'id'>

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null)

const TONE_ICON = { success: CircleCheck, error: CircleAlert, info: Info } as const
const TONE_ICON_CLASS = { success: 'text-success-dot', error: 'text-critical-dot', info: 'text-info-dot' } as const
/** Lỗi ở lại lâu hơn để kịp đọc. */
const TONE_DURATION_MS = { success: 4000, info: 4000, error: 7000 } as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++
      // Tối đa 3 toast một lúc; cái cũ nhất đi trước.
      setToasts((current) => [...current.slice(-2), { ...toast, id }])
      window.setTimeout(() => dismiss(id), TONE_DURATION_MS[toast.tone])
    },
    [dismiss],
  )

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICON[toast.tone]
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface-overlay py-3 pr-2 pl-4 shadow-popover"
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', TONE_ICON_CLASS[toast.tone])} aria-hidden />
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-sm font-medium text-foreground">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-sm text-muted">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => dismiss(toast.id)}
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast phải nằm trong <ToastProvider>')
  return push
}
