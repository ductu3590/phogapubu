'use client'

import { useState } from 'react'
import type { OrderRejectReason } from '@/lib/actions/pos-order'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { REJECT_REASONS } from '@/lib/pos-bill-history'

const REASONS = REJECT_REASONS

export default function RejectOrderSheet({
  orderId,
  busy,
  onClose,
  onConfirm,
}: {
  orderId: string
  busy: boolean
  onClose: () => void
  onConfirm: (reason: OrderRejectReason, note: string | null) => Promise<boolean>
}) {
  const [reason, setReason] = useState<OrderRejectReason>('out_of_stock')
  const [note, setNote] = useState('')

  const submit = async () => {
    if (reason === 'other' && !note.trim()) return
    if (await onConfirm(reason, reason === 'other' ? note.trim() : null)) onClose()
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose() }}
      dismissible={!busy}
      title="Từ chối đơn"
      description="Đơn sẽ không được in và không tính vào bill."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Đóng</Button>
          <Button variant="danger" isLoading={busy} onClick={() => void submit()} disabled={reason === 'other' && !note.trim()}>
            Xác nhận từ chối
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2" disabled={busy}>
        <legend className="sr-only">Lý do từ chối</legend>
        {REASONS.map((item) => (
          <label
            key={item.code}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm text-foreground transition-colors',
              reason === item.code ? 'border-primary bg-primary-light' : 'border-border-strong hover:bg-surface-hover',
            )}
          >
            <input
              type="radio"
              name={`reject-${orderId}`}
              value={item.code}
              checked={reason === item.code}
              onChange={() => setReason(item.code)}
              className="size-4 accent-[var(--primary)]"
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
      {reason === 'other' && (
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
          autoFocus
          aria-label="Lý do từ chối"
          placeholder="Nhập lý do từ chối"
          maxLength={300}
          className="mt-3"
        />
      )}
    </Dialog>
  )
}
