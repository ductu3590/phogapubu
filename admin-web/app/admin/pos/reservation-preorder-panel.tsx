'use client'

import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Printer, Soup } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const pendingRows = rows.filter((row) => row.wasteReviewRequired || row.needsReview || row.needsPrint)
  // Đơn đã duyệt + in xong không hiện ở đây nữa (khối "Đã duyệt/in hôm nay" cũ chỉ để đọc, không thao tác).
  // In lại: panel Tiếp nhận khách đặt bàn có nút in cạnh danh sách món.
  if (pendingRows.length === 0) return null

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
    <>
    {pendingRows.length > 0 && <section className="mx-4 mt-3 rounded-xl border border-border bg-surface p-4 md:mx-5" aria-label="Món đặt trước cần xử lý">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Soup className="size-4 text-warning" aria-hidden />
          Món đặt trước cần xử lý
        </h2>
        <span className="min-w-6 rounded-full bg-warning-bg px-2 text-center text-[13px] leading-6 font-semibold text-warning tabular">{pendingRows.length}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted">Duyệt theo phiên bản rồi mới in. In trước giờ đến chưa có cọc: chủ quán tự quyết định.</p>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {pendingRows.map((row) => {
          const open = expanded === row.orderId
          const canRelease = row.orderStatus !== 'cancelled' && row.needsReview
          const printedCurrent = !row.needsPrint && row.releasedRevision > 0
          return <li key={row.orderId} className="p-3">
            <button type="button" aria-expanded={open} className="flex w-full cursor-pointer items-start justify-between gap-3 text-left" onClick={() => setExpanded(open ? null : row.orderId)}>
              <span className="min-w-0"><b className="text-sm font-semibold text-foreground">{row.customerName}</b><span className="ml-1 text-[13px] text-muted">· {row.partySize} khách</span>
                <span className="mt-0.5 block text-[13px] text-muted">Đến {time(row.arrivalAt)}{row.tableNumbers.length ? ` · ${row.tableNumbers.join(', ')}` : ' · chưa nhận khách'}</span></span>
              <span className="flex shrink-0 items-start gap-1 text-right text-[13px]">
                <span><b className="block font-semibold text-foreground">v{row.revision}</b><span className="text-muted tabular">{money(row.totalAmount)}</span></span>
                {open ? <ChevronUp className="mt-0.5 size-4 text-muted" aria-hidden /> : <ChevronDown className="mt-0.5 size-4 text-muted" aria-hidden />}
              </span>
            </button>
            {open && <div className="mt-2 border-t border-border pt-2">
              <ul className="space-y-1 text-sm text-foreground">
                {row.currentSnapshot.items.map((item, index) => <li key={index} className="flex justify-between gap-2"><span className="min-w-0">{item.name}{item.note ? ` · ${item.note}` : ''}</span><b className="shrink-0 font-medium tabular">×{item.quantity}</b></li>)}
              </ul>
              {row.wasteReviewRequired ? <Button variant="danger" disabled={busy} onClick={() => { const reason = prompt('Kết quả đối soát hao hụt'); if (reason) void onResolveWaste(row, reason) }} className="mt-3 w-full">Đối soát món đã huỷ/in</Button>
                : <div className="mt-3 flex flex-col gap-2">
                  {canRelease && <Button variant="primary" icon={<CheckCircle2 />} disabled={busy} onClick={() => void releaseAndPrint(row, 'original')} className="w-full whitespace-nowrap">Duyệt &amp; in 2 liên</Button>}
                  {row.releasedRevision > 0 && <Button icon={<Printer />} disabled={busy || row.needsReview} onClick={() => void releaseAndPrint(row, printedCurrent ? (row.revision > 1 ? 'adjustment' : 'reprint') : 'original')} className="w-full whitespace-nowrap">{printedCurrent ? 'In lại / điều chỉnh' : 'In 2 liên'}</Button>}
                </div>}
              {row.needsReview && row.releasedRevision > 0 && <p className="mt-2 text-[13px] text-warning">Khách vừa sửa sau lần duyệt. Duyệt v{row.revision} trước khi in phiếu điều chỉnh.</p>}
            </div>}
          </li>
        })}
      </ul>
    </section>}
    </>
  )
}
