'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

/**
 * Hộp xác nhận trong app — thay `window.confirm` (hộp thoại của trình duyệt/Windows, không đúng giao diện POS).
 * Đang chạy (`busy`) thì nút xác nhận quay vòng, không đóng được bằng Esc / bấm ra ngoài.
 * `tone='danger'` cho việc không hoàn tác được (Bỏ bàn).
 */
export default function ConfirmDialog({ open, title, description, confirmLabel, tone = 'default', busy, onConfirm, onCancel }: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel: string
  tone?: 'default' | 'danger'
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      dismissible={!busy}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Huỷ</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} isLoading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {description ? <p className="text-sm text-slate-700">{description}</p> : null}
    </Dialog>
  )
}
