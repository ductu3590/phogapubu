'use client'

import { useState } from 'react'
import type { PreorderPrintKind, ReservationPreorderRow } from '@/lib/actions/reservation-preorders'

const money = (value: number) => value.toLocaleString('vi-VN') + 'đ'
const time = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function ReservationPreorderPanel({
  rows, busy, onRelease, onPrint, onResolveWaste,
}: {
  rows: ReservationPreorderRow[]; busy: boolean
  onRelease: (row: ReservationPreorderRow) => Promise<{ ok: boolean; error?: string }>
  onPrint: (row: ReservationPreorderRow, kind: PreorderPrintKind, popup: Window | null, reason?: string) => Promise<{ ok: boolean; error?: string }>
  onResolveWaste: (row: ReservationPreorderRow, reason: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (rows.length === 0) return null

  // Popup phải mở trong đúng click gesture. Khi RPC xong mới điều hướng sang snapshot job.
  const releaseAndPrint = async (row: ReservationPreorderRow, kind: PreorderPrintKind) => {
    const popup = window.open('', '_blank')
    if (popup) popup.document.write('<p style="font-family:sans-serif;padding:24px">Đang tạo phiếu in…</p>')
    const result = await onPrint(row, kind, popup, kind === 'reprint' ? prompt('Lý do in lại') ?? undefined : undefined)
    if (!result.ok && popup && !popup.closed) {
      popup.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px">Chưa tạo được phiếu. Quay lại POS để thử lại.</p>'
    }
  }

  return (
    <section className="mx-5 mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3" aria-label="Món đặt trước cần xử lý">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-violet-950">🍲 Món đặt trước cần xử lý</h2>
        <span className="rounded-full bg-violet-700 px-2 py-0.5 text-[11px] font-bold text-white">{rows.length}</span>
      </div>
      <p className="mt-1 text-xs text-violet-800">Duyệt theo phiên bản rồi mới in. In trước giờ đến chưa có cọc: chủ quán tự quyết định.</p>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => {
          const open = expanded === row.orderId
          const canRelease = row.orderStatus !== 'cancelled' && row.needsReview
          const printedCurrent = !row.needsPrint && row.releasedRevision > 0
          return <li key={row.orderId} className="rounded-lg border border-violet-100 bg-white p-2.5">
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setExpanded(open ? null : row.orderId)}>
              <span><b className="text-sm text-gray-900">{row.customerName}</b><span className="ml-1 text-xs text-gray-500">· {row.partySize} khách</span>
                <span className="mt-0.5 block text-xs text-gray-600">Đến {time(row.arrivalAt)}{row.tableNumbers.length ? ` · ${row.tableNumbers.join(', ')}` : ' · chưa nhận khách'}</span></span>
              <span className="text-right text-xs"><b className="block text-violet-800">v{row.revision}</b><span className="text-gray-500">{money(row.totalAmount)}</span></span>
            </button>
            {open && <div className="mt-2 border-t border-violet-100 pt-2">
              <ul className="space-y-1 text-xs text-gray-700">
                {row.currentSnapshot.items.map((item, index) => <li key={index} className="flex justify-between gap-2"><span>{item.name}{item.note ? ` · ${item.note}` : ''}</span><b>×{item.quantity}</b></li>)}
              </ul>
              {row.wasteReviewRequired ? <button disabled={busy} onClick={() => { const reason = prompt('Kết quả đối soát hao hụt'); if (reason) void onResolveWaste(row, reason) }} className="mt-2 w-full rounded-lg border border-red-300 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Đối soát món đã huỷ/in</button>
                : <div className="mt-2 grid grid-cols-2 gap-2">
                  {canRelease && <button disabled={busy} onClick={() => void releaseAndPrint(row, 'original')} className="rounded-lg bg-violet-700 py-2 text-xs font-bold text-white disabled:opacity-50">✓ Xác nhận &amp; in 2 liên</button>}
                  {row.releasedRevision > 0 && <button disabled={busy || row.needsReview} onClick={() => void releaseAndPrint(row, printedCurrent ? (row.revision > 1 ? 'adjustment' : 'reprint') : 'original')} className="rounded-lg bg-orange-600 py-2 text-xs font-bold text-white disabled:opacity-50">🖨️ {printedCurrent ? 'In lại / điều chỉnh' : 'In 2 liên'}</button>}
                </div>}
              {row.needsReview && row.releasedRevision > 0 && <p className="mt-2 text-[11px] text-amber-700">Khách vừa sửa sau lần duyệt. Duyệt v{row.revision} trước khi in phiếu điều chỉnh.</p>}
            </div>}
          </li>
        })}
      </ul>
    </section>
  )
}
