'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Phone, UtensilsCrossed, X } from 'lucide-react'
import { TableStateBadge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/field'
import type { ReservationRow } from '@/lib/actions/reservations'
import type { ReservationPreorderRow } from '@/lib/actions/reservation-preorders'
import { clock, type TimelineBar } from '@/lib/pos-timeline'
import { phoneHref } from '../reservations/reservation-ui'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

// "Tiếp nhận khách" (bản Stitch P02): bấm thanh đặt bàn trên Timeline → panel này ở cột phải.
// Chỉ gọi lại các hàm đặt bàn đang chạy (xác nhận & chọn bàn, khách đã đến, hoãn nhắc, báo vắng, huỷ).
// Đổi giờ / đổi bàn của đặt bàn đã xác nhận vẫn ở trang Đặt bàn (cần lý do + chọn lại bàn).
export default function ReservationDetail({
  reservation,
  bar,
  preorder,
  busy,
  canSnooze,
  onClose,
  onConfirm,
  onArrive,
  onSnooze,
  onNoShow,
  onCancel,
}: {
  reservation: ReservationRow
  bar: TimelineBar | undefined
  preorder: ReservationPreorderRow | undefined
  busy: boolean
  /** Đã quá giờ hẹn — hoãn chuông nhắc mới có nghĩa. */
  canSnooze: boolean
  onClose: () => void
  onConfirm: (reservation: ReservationRow) => void
  onArrive: (reservation: ReservationRow) => void
  onSnooze: (reservationId: string, minutes: 10 | 15 | 30) => void
  onNoShow: (reservation: ReservationRow) => void
  onCancel: (reservation: ReservationRow, reason: string) => void
}) {
  const r = reservation
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const statusLabel = bar?.conflict ? 'Xung đột: bàn còn khách' : bar?.lateMinutes ? `Trễ ${bar.lateMinutes} phút` : r.status === 'confirmed' ? 'Đã đặt' : r.status === 'change_requested' ? 'Khách xin đổi' : 'Chờ duyệt'
  const href = phoneHref(r.customerPhone)
  const items = preorder?.currentSnapshot?.items ?? []

  return (
    <aside
      aria-label="Tiếp nhận khách"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-modal xl:static xl:max-h-none xl:w-[400px] xl:shrink-0 xl:rounded-none xl:border-t-0 xl:border-l xl:shadow-none"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border py-3 pr-2 pl-5">
        <div className="min-w-0 py-1">
          <p className="text-[13px] font-medium text-muted">Tiếp nhận khách đặt bàn</p>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarDays className="size-5 shrink-0 text-info" aria-hidden />
            <span className="truncate">{r.customerName}</span>
          </h2>
          <p className="mt-0.5 text-sm text-muted tabular">Hẹn {clock(new Date(r.arrivalAt).getTime())} · {r.partySize} khách</p>
        </div>
        <IconButton icon={<X />} label="Đóng" onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 text-sm">
        {bar && <TableStateBadge state={bar.state} label={statusLabel} />}

        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted">Bàn</dt>
          <dd className="font-medium text-foreground">{r.tableNumbers.length ? r.tableNumbers.join(', ') : 'Chưa xếp bàn'}</dd>
          <dt className="text-muted">Điện thoại</dt>
          <dd>
            {href ? (
              <a href={href} className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline">
                <Phone className="size-3.5" aria-hidden />{r.customerPhone}
              </a>
            ) : <span className="text-foreground">{r.customerPhone}</span>}
          </dd>
          {r.note ? (<><dt className="text-muted">Ghi chú</dt><dd className="text-foreground">{r.note}</dd></>) : null}
          {r.status === 'change_requested' && r.requestedArrivalAt ? (
            <><dt className="text-muted">Xin đổi</dt><dd className="text-foreground tabular">{clock(new Date(r.requestedArrivalAt).getTime())}{r.requestedPartySize ? ` · ${r.requestedPartySize} khách` : ''}{r.changeNote ? ` · ${r.changeNote}` : ''}</dd></>
          ) : null}
        </dl>

        {bar?.conflict && (
          <p className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-critical">
            Bàn giữ cho khách này vẫn còn khách khác ngồi. Mời khách cũ thanh toán, hoặc đổi bàn ở trang Đặt bàn.
          </p>
        )}

        {items.length > 0 && (
          <section className="rounded-xl border border-border p-3" aria-label="Món đặt trước">
            <p className="flex items-center justify-between gap-2 font-semibold text-foreground">
              <span className="flex items-center gap-2"><UtensilsCrossed className="size-4 text-muted" aria-hidden />Món đặt trước</span>
              <span className="tabular">{dong(preorder!.totalAmount)}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {items.map((i, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span className="min-w-0"><b className="font-semibold tabular">{i.quantity}×</b> {i.name}</span>
                  <span className="shrink-0 tabular text-muted">{dong(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted">Món đặt trước vào bill của bàn khi bấm khách đã đến. Duyệt / in bếp ở mục Món đặt trước trong Việc cần xử lý.</p>
          </section>
        )}

        {r.status === 'confirmed' && canSnooze && (
          <section aria-label="Khách đến trễ">
            <p className="font-medium text-foreground">Khách đến trễ — hoãn chuông nhắc</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([10, 15, 30] as const).map((m) => (
                <Button key={m} disabled={busy} onClick={() => onSnooze(r.reservationId, m)} className="min-h-9 px-2 whitespace-nowrap tabular md:min-h-9">+{m} phút</Button>
              ))}
            </div>
          </section>
        )}

        {cancelling && (
          <section className="rounded-xl border border-critical-border bg-critical-bg p-3" aria-label="Huỷ đặt bàn">
            <Field label="Lý do huỷ" htmlFor="pos-cancel-reason" hint="Ghi vào lịch sử đặt bàn">
              <Textarea id="pos-cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={() => { setCancelling(false); setReason('') }}>Không huỷ</Button>
              <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => onCancel(r, reason.trim())}>Huỷ đặt bàn</Button>
            </div>
          </section>
        )}
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {r.status === 'pending' && (
          <Button variant="primary" size="touch" disabled={busy} onClick={() => onConfirm(r)}>Xác nhận &amp; chọn bàn</Button>
        )}
        {r.status === 'confirmed' && (
          <Button variant="primary" size="touch" isLoading={busy} onClick={() => onArrive(r)}>Khách đã đến · mở mâm</Button>
        )}
        {r.status === 'change_requested' && (
          <Link href="/admin/reservations" className="text-center text-sm font-semibold text-primary underline-offset-4 hover:underline">Duyệt yêu cầu đổi ở trang Đặt bàn</Link>
        )}
        {!cancelling && (r.status === 'confirmed' || r.status === 'pending' || r.status === 'change_requested') && (
          <div className="grid grid-cols-2 gap-2">
            {r.status === 'confirmed' ? (
              <Button disabled={busy} onClick={() => onNoShow(r)}>Khách không đến</Button>
            ) : <span />}
            <Button variant="ghost" disabled={busy} onClick={() => setCancelling(true)} className="text-danger hover:bg-danger-bg hover:text-danger">Huỷ đặt bàn</Button>
          </div>
        )}
        <Link href="/admin/reservations" className="text-center text-[13px] font-medium text-foreground underline-offset-4 hover:underline">
          Đổi giờ / đổi bàn ở trang Đặt bàn
        </Link>
      </footer>
    </aside>
  )
}
