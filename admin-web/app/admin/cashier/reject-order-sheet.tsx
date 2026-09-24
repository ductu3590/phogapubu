'use client'

import { useState } from 'react'
import type { OrderRejectReason } from '@/lib/actions/pos-order'

const REASONS: { code: OrderRejectReason; label: string }[] = [
  { code: 'out_of_stock', label: 'Hết đồ' },
  { code: 'kitchen_overloaded', label: 'Bếp quá tải' },
  { code: 'duplicate', label: 'Đơn trùng' },
  { code: 'customer_requested', label: 'Khách yêu cầu huỷ' },
  { code: 'other', label: 'Lý do khác' },
]

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Từ chối đơn">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Từ chối đơn</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1 text-gray-500 disabled:opacity-50">Đóng</button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Đơn sẽ không được in và không tính vào bill.</p>
        <fieldset className="mt-3 space-y-2" disabled={busy}>
          {REASONS.map((item) => (
            <label key={item.code} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-3 text-sm">
              <input type="radio" name={`reject-${orderId}`} value={item.code} checked={reason === item.code} onChange={() => setReason(item.code)} />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
        {reason === 'other' && (
          <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} autoFocus
            placeholder="Nhập lý do từ chối" maxLength={300}
            className="mt-3 min-h-20 w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-red-500 disabled:opacity-50" />
        )}
        <button type="button" onClick={() => void submit()} disabled={busy || (reason === 'other' && !note.trim())}
          className="mt-4 w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
          Xác nhận từ chối
        </button>
      </div>
    </div>
  )
}
