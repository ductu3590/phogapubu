'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './button'

/**
 * Lớp nổi dựng trên <dialog> gốc: tự khoá focus, Esc để đóng, nền mờ phía sau.
 * - `center`: hộp xác nhận / form ngắn (rộng tối đa 480px).
 * - `side`: panel chi tiết. Desktop trượt từ phải (420px), mobile thành sheet từ dưới, cao tối đa 90vh.
 * Header và footer đứng yên, chỉ thân cuộn — nút ở footer không bao giờ đè dòng cuối.
 * `dismissible=false`: không đóng khi bấm ra ngoài (form đang nhập dở, thao tác tiền).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  placement = 'center',
  dismissible = true,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  placement?: 'center' | 'side'
  dismissible?: boolean
  className?: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Esc: luôn để component cha quyết định đóng (giữ state `open` là nguồn sự thật).
        event.preventDefault()
        if (dismissible) onClose()
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose()
      }}
      className={cn(
        'ui-dialog m-0 flex-col overflow-hidden border border-border bg-surface p-0 text-foreground shadow-modal open:flex',
        placement === 'center' &&
          'inset-x-4 top-1/2 mx-auto max-h-[calc(100dvh-2rem)] w-auto max-w-[480px] -translate-y-1/2 rounded-2xl sm:w-full',
        placement === 'side' &&
          'inset-x-0 top-auto bottom-0 max-h-[90dvh] w-full max-w-none rounded-t-2xl md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-2xl',
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border py-3 pr-2 pl-5">
        <div className="min-w-0 py-1.5">
          <h2 className="text-base font-semibold text-balance">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        <IconButton icon={<X />} label="Đóng" onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </dialog>
  )
}
