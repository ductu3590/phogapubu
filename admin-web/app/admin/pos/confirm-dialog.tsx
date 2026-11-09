'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

/**
 * Hộp xác nhận trong app — thay `window.confirm` (hộp thoại của trình duyệt/Windows, không đúng giao diện POS).
 * Đang chạy (`busy`) thì nút xác nhận quay vòng, không đóng được bằng Esc / bấm ra ngoài.
 * `tone='danger'` cho việc không hoàn tác được (Bỏ bàn).
 */
export default function ConfirmDialog({ open, title, description, confirmLabel, tone = 'default', busy, confirmDisabled = false, onConfirm, onCancel }: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  busy: boolean
  /** Khoá nút xác nhận (vd. số tiền đã cũ, phải huỷ rồi mở lại). Nút Huỷ vẫn bấm được. */
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      open={open}
      // Header X / Esc / nền đều đi qua onClose: chặn ở đây để không phụ thuộc người gọi.
      onClose={() => { if (!busy) onCancel() }}
      dismissible={!busy}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Huỷ</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} isLoading={busy} disabled={confirmDisabled} onClick={() => { if (!busy && !confirmDisabled) onConfirm() }}>{confirmLabel}</Button>
        </>
      }
    >
      {description ? <p className="text-sm text-slate-700">{description}</p> : null}
    </Dialog>
  )
}
