'use client'

import { useState, type ReactNode } from 'react'
import {
  ArrowLeft, Banknote, BellRing, Clock3, EllipsisVertical, Gift, Hash, Landmark, Layers, Link2, Lock, Minus, Plus, Printer, Receipt,
  RotateCcw, Smartphone, Trash2, UserRound, X,
} from 'lucide-react'
import type { OpenTableSession, SessionOrderItem, SessionOrderRow } from '@/lib/actions/table-session'
import type { ReservationPreorderRow } from '@/lib/actions/reservation-preorders'
import { sessionTimeoutMessage } from '@/lib/session-timeout'
import { cashChange, cashSuggestions, formatVndInput, parseVnd } from '@/lib/cash-change'
import { isReviewableOrder, orderRound } from '@/lib/pos-work-queue'
import { clock } from '@/lib/pos-timeline'
import { tableVisualState } from '@/lib/table-status'
import type { TrayAssignment } from '@/lib/tray-colors'
import { Button, IconButton } from '@/components/ui/button'
import { Banner, EmptyState } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { STATUS_TONE_CLASSES, TABLE_STATE, type TableVisualState } from '@/components/ui/status'
import { cn } from '@/lib/utils'
import { billHistory, rejectReasonLabel } from '@/lib/pos-bill-history'

// Bill của /admin/pos theo bản Stitch P01 (bill dạng tab) + P03 (lượt gọi mới) + P04 (thanh toán một nút).
// Mọi con số tiền là của server (OpenTableSession.total, order.total_amount); bill KHÔNG tự cộng tổng.
// Thành tiền từng dòng món chỉ để đọc (đơn giá snapshot × số lượng). Tiền khách đưa / tiền thối chỉ để
// thu ngân đếm tiền, không gửi lên server.

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const gio = (iso: string) => clock(new Date(iso).getTime())
const lineAmount = (it: SessionOrderItem) =>
  it.void_type ? 0 : (it.price + (it.toppings ?? []).reduce((n, t) => n + t.price, 0)) * it.quantity

type Tab = 'bill' | 'new' | 'prints'

// Nhãn ngắn trên đầu bill (bản Stitch: "ĐANG ĂN") — nhãn dài đè mất tên mâm.
const BILL_STATE: Record<TableVisualState, string> = {
  serving: 'Đang ăn',
  booked: 'Đã đặt',
  pending: 'Chờ duyệt',
  late: 'Quá hạn',
  free: 'Chưa gọi',
}

export type PosBillPanelProps = {
  selected: OpenTableSession | null
  picked: OpenTableSession[]
  freeTables: { id: string; table_number: string }[]
  otherSessions: OpenTableSession[]
  pickedFreeTables: number
  trayColors: Map<string, TrayAssignment>
  busy: boolean
  onPay: (list: OpenTableSession[], instrument: 'cash' | 'bank') => void
  onPrint: (list: OpenTableSession[]) => void
  onReset: (s: OpenTableSession) => void
  onCreateTray: () => void
  onAddTable: (sessionId: string, tableId: string) => void
  onMergeInto: (sessionId: string, targetSessionId: string) => void
  onReleaseHost: (sessionId: string) => void
  onConfirmOrder: (orderId: string) => void
  onRejectOrder: (orderId: string) => void
  onPrintOrder: (orderId: string) => void
  onOpenManualOrder: (sessionId: string) => void
  onVoidOrderItem: (orderItemId: string, type: 'cancelled' | 'gift', reason?: string) => void
  /** Mig 098: sửa số lượng có lý do. Trả true khi lưu xong để hộp thoại tự đóng. */
  onSetItemQuantity: (orderItemId: string, quantity: number, reason: string) => Promise<boolean>
  onRestoreOrderItem: (orderItemId: string) => void
  onClearPick: () => void
  onDismiss: () => void
  /** Hàng chờ món đặt trước — để in phiếu món đặt trước ngay trong bill khi khách đã đến. */
  preorders: ReservationPreorderRow[]
  onPrintPreorder: (row: ReservationPreorderRow, popup: Window | null, reason?: string) => Promise<{ ok: boolean }>
}

/** Ai gọi lượt này — tab Lịch sử. */
function sourceTag(order: SessionOrderRow): { label: string; className: string } {
  if (order.order_source === 'pos') return { label: 'POS', className: 'bg-slate-700' }
  if (order.order_source === 'staff') return { label: 'NV', className: 'bg-blue-600' }
  if (order.order_source === 'reservation_preorder') return { label: 'Đặt trước', className: 'bg-purple-600' }
  return { label: 'QR', className: 'bg-orange-600' }
}

function orderLabel(session: OpenTableSession, order: SessionOrderRow): string {
  if (order.order_source === 'pos') return 'Ghi tay'
  if (order.order_source === 'reservation_preorder') return 'Món đặt trước'
  return `Lượt #${String(orderRound(session, order.id)).padStart(2, '0')}`
}

export default function PosBillPanel(props: PosBillPanelProps) {
  const { selected, picked, pickedFreeTables, trayColors, busy } = props
  const [tab, setTab] = useState<Tab>('bill')
  const [paying, setPaying] = useState(false)
  const [qtyItem, setQtyItem] = useState<SessionOrderItem | null>(null)

  const list = picked.length > 0 ? picked : selected ? [selected] : []
  const name = (s: OpenTableSession) => {
    const tray = trayColors.get(s.session_id)
    return tray ? `Mâm ${tray.index} · ${s.table_number}` : s.table_number
  }

  if (pickedFreeTables >= 2 && list.length === 0) {
    return (
      <Khung icon={<Layers />} tieuDe={`Đã chọn ${pickedFreeTables} bàn trống`} onDismiss={props.onClearPick}>
        <div className="space-y-2">
          <Button variant="primary" size="touch" icon={<Layers />} onClick={props.onCreateTray} disabled={busy} className="w-full">
            Ghép thành một mâm
          </Button>
          <Button variant="ghost" onClick={props.onClearPick} className="w-full">Bỏ chọn</Button>
        </div>
      </Khung>
    )
  }
  if (list.length === 0) return null

  const tong = list.reduce((n, s) => n + s.total, 0)
  const pending = list.flatMap((s) => s.orders.filter(isReviewableOrder).map((o) => ({ s, o })))
  const pendingTotal = pending.reduce((n, p) => n + p.o.total_amount, 0)
  const title = list.length > 1 ? `Gộp bill ${list.length} mâm` : name(list[0])
  const isTray = list.length > 1 || trayColors.has(list[0].session_id)

  const preorderOf = (orderId: string) => props.preorders.find((p) => p.orderId === orderId)
  const printPreorder = async (row: ReservationPreorderRow) => {
    const reprint = row.releasedRevision > 0 && !row.needsPrint && !row.needsReview
    const reason = reprint ? prompt('Lý do in lại phiếu') ?? undefined : undefined
    const popup = window.open('', '_blank')
    if (popup) popup.document.write('<p style="font-family:sans-serif;padding:24px">Đang tạo phiếu in…</p>')
    const result = await props.onPrintPreorder(row, popup, reason)
    if (!result.ok && popup && !popup.closed) {
      popup.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px">Chưa tạo được phiếu. Quay lại POS để thử lại.</p>'
    }
  }
  const preorderButton = (orderId: string, compact = false) => {
    const row = preorderOf(orderId)
    if (!row) return null
    const label = row.needsReview ? 'Duyệt & in 2 liên' : row.needsPrint ? 'In 2 liên' : 'In lại'
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void printPreorder(row)}
        className={cn(
          'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md font-semibold disabled:cursor-not-allowed disabled:opacity-50',
          row.needsReview || row.needsPrint ? 'bg-orange-600 px-2 py-0.5 text-[12px] text-white hover:bg-orange-700' : 'border border-slate-300 bg-white px-1.5 py-0.5 text-[12px] text-slate-700 hover:bg-slate-50',
        )}
        title="In phiếu món đặt trước"
      >
        <Printer className="size-3.5" aria-hidden />{compact ? null : label}
      </button>
    )
  }

  const suaSoLuong = (it: SessionOrderItem) => setQtyItem(it)
  const qtyDialog = qtyItem && (
    <QtyDialog
      key={qtyItem.id}
      item={qtyItem}
      busy={busy}
      onClose={() => setQtyItem(null)}
      onSubmit={async (qty, reason) => { if (await props.onSetItemQuantity(qtyItem.id, qty, reason)) setQtyItem(null) }}
    />
  )

  const dieuChinh = (itemId: string, type: 'cancelled' | 'gift') => {
    const label = type === 'cancelled' ? 'bỏ món này' : 'tặng món này'
    if (!confirm(`Xác nhận ${label}? Tổng bill sẽ được tính lại.`)) return
    const reason = prompt(`Lý do ${label} (có thể để trống):`) ?? undefined
    props.onVoidOrderItem(itemId, type, reason)
  }

  if (paying) {
    return (
      <>
      {qtyDialog}
      <PaymentView
        title={title}
        list={list}
        total={tong}
        busy={busy}
        onAdjust={dieuChinh}
        onQty={suaSoLuong}
        onRestore={props.onRestoreOrderItem}
        onBack={() => setPaying(false)}
        onDismiss={props.onDismiss}
        onPay={(instrument) => props.onPay(list, instrument)}
        onPrint={() => props.onPrint(list)}
      />
      </>
    )
  }

  const visual = list.length === 1 ? tableVisualState(list[0]) : 'serving'
  const meta = list.length === 1
    ? `Mở lúc ${gio(list[0].opened_at)} · ${list[0].opened_by === 'staff' ? 'nhân viên mở' : 'khách quét QR'}`
    : list.map((s) => name(s)).join(' + ')

  const settled = list.flatMap((s) => s.orders.filter((o) => !isReviewableOrder(o)).map((o) => ({ s, o })))
    .sort((a, b) => a.o.created_at.localeCompare(b.o.created_at))
  // list_open_table_sessions KHÔNG trả confirmed_at (kiểu SessionOrderRow khai thừa) → không lọc theo nó.
  // Lượt khách / nhân viên gọi đã qua bước duyệt (không còn 'pending') = đã in 2 liên lúc duyệt.
  // Tab Lịch sử = MỌI lượt gọi của bàn (mới nhất trên cùng), ghi rõ ai gọi.
  // Gồm cả lượt bị từ chối (mig 089) — Lịch sử phải đầy đủ để đối chứng; tab Hoá đơn không có chúng.
  const history = billHistory(list)
  const itemCount = settled.reduce((n, { o }) => n + o.items.length, 0)

  return (
    <>
    {qtyDialog}
    <Khung
      icon={isTray ? <Link2 /> : <Receipt />}
      tieuDe={title}
      badge={<span className={cn('shrink-0 rounded px-1.5 text-[11px] leading-5 font-bold whitespace-nowrap uppercase', STATUS_TONE_CLASSES[TABLE_STATE[visual].tone].solid)}>{BILL_STATE[visual]}</span>}
      moTa={meta}
      onDismiss={props.onDismiss}
      headerExtra={
        // Hai ô tiền trong đầu bill tối — bản Stitch P03.
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
            <p className="text-[11px] font-bold tracking-wide text-slate-400 uppercase">Hoá đơn đã duyệt</p>
            <p className="text-lg font-bold text-white tabular">{dong(tong - pendingTotal)}</p>
          </div>
          <div className={cn('rounded-lg border px-3 py-2', pending.length > 0 ? 'border-amber-500/70 bg-amber-500/15' : 'border-slate-700 bg-slate-800')}>
            <p className={cn('text-[11px] font-bold tracking-wide uppercase', pending.length > 0 ? 'text-amber-300' : 'text-slate-400')}>Chờ duyệt mới</p>
            <p className={cn('text-lg font-bold tabular', pending.length > 0 ? 'text-amber-300' : 'text-slate-300')}>{dong(pendingTotal)}</p>
            {pending.length > 0 && <p className="text-[12px] text-amber-200/90">{pending.length} lượt</p>}
          </div>
        </div>
      }
      top={
        <div role="tablist" aria-label="Nội dung bill" className="grid shrink-0 grid-cols-3 border-b border-slate-200 bg-white">
          {([
            ['bill', `Hoá đơn (${itemCount})`, 0],
            ['new', 'Lượt gọi mới', pending.length],
            ['prints', 'Lịch sử', 0],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 border-b-2 text-sm font-semibold transition-colors',
                tab === value ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-900',
              )}
            >
              {label}
              {count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] leading-5 font-bold text-white tabular">{count}</span>}
            </button>
          ))}
        </div>
      }
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            {list.length === 1 ? (
              <Button icon={<Plus className="text-orange-600" />} onClick={() => props.onOpenManualOrder(list[0].session_id)} disabled={busy} className="font-semibold">
                Gọi thêm món
              </Button>
            ) : <span />}
            <Button icon={<Printer className="text-blue-600" />} onClick={() => props.onPrint(list)} disabled={busy} className="font-semibold">In tạm tính</Button>
          </div>
          {pending.length > 0 ? (
            <button
              type="button"
              disabled
              className="mt-2 flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700 uppercase"
            >
              <Lock className="size-4" aria-hidden />Khoá thanh toán (còn {pending.length} lượt chờ duyệt)
            </button>
          ) : (
            <Button variant="primary" size="touch" icon={<Receipt />} disabled={busy} onClick={() => setPaying(true)} className="mt-2 w-full text-base font-bold">
              Thanh toán · {dong(tong)}
            </Button>
          )}
        </>
      }
    >
      {list.length === 1 && list[0].needs_review && (
        <Banner tone="warning" title={`${sessionTimeoutMessage(list[0].idle_timeout_minutes)} nên bàn đã mở khoá`} className="mb-3">
          Còn <b className="font-semibold tabular">{dong(list[0].unpaid_total)} chưa thu</b>.
        </Banner>
      )}

      {tab === 'bill' && (
        <>
          {pending.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <BellRing className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">Có {pending.length} lượt món đang chờ duyệt!</p>
                  <p className="text-[13px] text-amber-800 tabular">Tổng chờ: <b className="font-bold">{dong(pendingTotal)}</b></p>
                </div>
              </div>
              <button type="button" onClick={() => setTab('new')} className="min-h-9 shrink-0 cursor-pointer rounded-lg bg-amber-500 px-3 text-[13px] font-bold whitespace-nowrap text-white hover:bg-amber-600">
                Duyệt ngay →
              </button>
            </div>
          )}

          {settled.length === 0 ? (
            <EmptyState>{pending.length > 0 ? 'Chưa có lượt nào được duyệt.' : 'Mâm này chưa gọi món nào.'}</EmptyState>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_40px_92px_28px] gap-2 border-b border-slate-200 pb-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                <span>Tên món</span><span className="text-center">SL</span><span className="text-right">Thành tiền</span><span />
              </div>
              {settled.map(({ s, o }) => (
                <section key={o.id} className={cn(o.status === 'cancelled' && 'opacity-60')}>
                  <p className="flex items-center justify-between gap-2 bg-slate-50 px-1 py-1 text-[12px] text-slate-500">
                    <span><b className="font-semibold text-slate-700">{orderLabel(s, o)}</b> · {gio(o.created_at)}{list.length > 1 ? ` · ${name(s)}` : ''}{o.status === 'cancelled' ? ' · đã từ chối' : ''}</span>
                    <span className="flex items-center gap-2">
                      {o.order_source === 'reservation_preorder' && preorderButton(o.id)}
                      <span className="tabular">{dong(o.total_amount)}</span>
                    </span>
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {o.items.map((it) => <ItemRow key={it.id} item={it} busy={busy} onAdjust={dieuChinh} onQty={suaSoLuong} onRestore={props.onRestoreOrderItem} />)}
                    {o.items.length === 0 && <li className="py-2 text-sm text-slate-500">Không có món</li>}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <OtherActions {...props} list={list} />
        </>
      )}

      {tab === 'new' && (
        pending.length === 0 ? (
          <EmptyState>Không có lượt nào chờ duyệt.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {pending.map(({ s, o }) => {
              const staff = o.order_source === 'staff'
              return (
                <li key={o.id} className={cn('overflow-hidden rounded-xl border', staff ? 'border-blue-200' : 'border-orange-200')}>
                  <div className={cn('flex items-center justify-between gap-2 px-3 py-2', staff ? 'bg-blue-50' : 'bg-orange-50')}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[11px] leading-5 font-bold text-white uppercase', staff ? 'bg-blue-600' : 'bg-orange-600')}>
                        {staff ? <UserRound className="size-3" aria-hidden /> : <Smartphone className="size-3" aria-hidden />}
                        {staff ? 'NV đặt hộ' : 'QR khách tại bàn'}
                      </span>
                      <b className="truncate text-sm font-bold text-slate-900">{orderLabel(s, o)}</b>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[12px] text-slate-500 tabular">
                      <Clock3 className="size-3.5" aria-hidden />{gio(o.created_at)}{list.length > 1 ? ` · ${name(s)}` : ''}
                    </span>
                  </div>
                  <div className="bg-white p-3">
                    <ul className="space-y-1.5">
                      {o.items.filter((i) => i.void_type !== 'cancelled').map((i) => (
                        <li key={i.id} className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 text-slate-900">
                            <b className="font-bold text-orange-600 tabular">{i.quantity}x</b> {i.name}
                            {i.toppings.length > 0 && <span className="block text-[12px] text-slate-500">+ {i.toppings.map((t) => t.name).join(', ')}</span>}
                          </span>
                          <span className="shrink-0 font-bold text-slate-900 tabular">{dong(lineAmount(i))}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 border-t border-slate-100 pt-3">
                      <Button variant="primary" icon={<Printer />} onClick={() => props.onConfirmOrder(o.id)} disabled={busy} className="font-bold">Duyệt &amp; in bếp</Button>
                      <Button icon={<X />} onClick={() => props.onRejectOrder(o.id)} disabled={busy} className="border-red-200 bg-red-50 font-semibold text-red-700 hover:bg-red-100 hover:text-red-800">Từ chối lượt</Button>
                    </div>
                  </div>
                </li>
              )
            })}
            <li className="text-[13px] text-slate-500">Duyệt xong in 2 liên: phiếu bếp + phiếu đặt ở bàn khách.</li>
          </ul>
        )
      )}

      {tab === 'prints' && (
        history.length === 0 ? (
          <EmptyState>Bàn này chưa gọi lượt nào.</EmptyState>
        ) : (
          <>
            <ul className="space-y-2">
              {history.map(({ s, o, rejected }) => {
                const tag = sourceTag(o)
                const waiting = !rejected && isReviewableOrder(o)
                const reason = rejected ? rejectReasonLabel(o.rejection_reason_code, o.rejection_reason_note) : null
                return (
                  <li key={o.id} className={cn('flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm', rejected ? 'border-red-200 bg-red-50/60' : waiting ? 'border-amber-300 bg-white' : 'border-slate-200 bg-white')}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('shrink-0 rounded px-1.5 text-[11px] leading-5 font-bold text-white', tag.className)}>{tag.label}</span>
                      <span className="min-w-0">
                        <b className="font-semibold text-slate-900">{orderLabel(s, o)}</b>
                        <span className="text-slate-500"> · {gio(o.created_at)} · {o.items.length} món{list.length > 1 ? ` · ${name(s)}` : ''}</span>
                        {waiting && <span className="ml-1 text-[12px] font-semibold text-amber-700">· chờ duyệt</span>}
                        {rejected && (
                          <span className="block text-[13px] text-red-700">
                            <b className="font-semibold">Đã từ chối</b>
                            {o.rejected_at ? ` lúc ${gio(o.rejected_at)}` : ''}
                            {reason ? ` · ${reason}` : ''} · không tính tiền
                          </span>
                        )}
                      </span>
                    </span>
                    {o.order_source === 'reservation_preorder'
                      ? preorderButton(o.id, true)
                      : !waiting && !rejected && (
                        <IconButton icon={<Printer />} label={`In lại ${orderLabel(s, o)}`} onClick={() => props.onPrintOrder(o.id)} className="size-8 shrink-0 md:size-8" />
                      )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[13px] text-slate-500">Bấm icon in để in lại một lượt (kẹt giấy, hết giấy). In lại không làm lệch bill.</p>
          </>
        )
      )}
    </Khung>
    </>
  )
}

/** Một dòng món dạng bảng (P01): tên · SL · thành tiền · menu ⋮ (Tặng / Bỏ / Khôi phục). */
function ItemRow({ item: it, busy, onAdjust, onQty, onRestore }: {
  item: SessionOrderItem
  busy: boolean
  onAdjust: (itemId: string, type: 'cancelled' | 'gift') => void
  onQty: (item: SessionOrderItem) => void
  onRestore: (itemId: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const cancelled = it.void_type === 'cancelled'
  const gift = it.void_type === 'gift'
  const toppingText = it.toppings?.map((t) => t.name).join(', ')
  return (
    <li className={cn('relative grid grid-cols-[1fr_40px_92px_28px] items-center gap-2 py-2 text-sm', gift && 'bg-amber-50/60')}>
      <span className="min-w-0">
        <span className={cn('block font-semibold', cancelled ? 'text-red-600 line-through' : 'text-slate-900')}>{it.name}</span>
        {toppingText && <span className="block text-[12px] text-slate-500">+ {toppingText}</span>}
        {cancelled && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px]">
            <span className="rounded bg-red-100 px-1 font-bold text-red-700">{it.void_reason ? 'Lý do' : 'Đã bỏ'}</span>
            {it.void_reason && <span className="text-slate-600">{it.void_reason}</span>}
          </span>
        )}
        {gift && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px]">
            <span className="rounded bg-amber-200 px-1 font-bold text-amber-900">Đã tặng</span>
            {it.void_reason && <span className="text-slate-600">Lý do: {it.void_reason}</span>}
          </span>
        )}
        {it.qty_changes?.map((c, i) => (
          <span key={i} className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px]">
            <span className="rounded bg-indigo-100 px-1 font-bold text-indigo-800 tabular">SL {c.old_quantity}→{c.new_quantity}</span>
            <span className="text-slate-600">{c.reason}</span>
          </span>
        ))}
      </span>
      <span className="text-center font-semibold text-slate-700 tabular">x{it.quantity}</span>
      <span className={cn('text-right font-bold tabular', it.void_type ? 'text-slate-400' : 'text-slate-900')}>{dong(lineAmount(it))}</span>
      <span className="relative flex justify-end" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false) }}>
        <button
          type="button"
          aria-label={`Điều chỉnh ${it.name}`}
          aria-expanded={menu}
          disabled={busy}
          onClick={() => setMenu((v) => !v)}
          className="grid size-7 cursor-pointer place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
        >
          <EllipsisVertical className="size-4" aria-hidden />
        </button>
        {menu && (
          <span role="menu" className="absolute top-8 right-0 z-20 flex w-36 flex-col rounded-lg border border-slate-200 bg-white p-1 shadow-modal">
            {it.void_type ? (
              <button type="button" role="menuitem" onClick={() => { setMenu(false); onRestore(it.id) }} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-slate-100">
                <RotateCcw className="size-4 text-slate-500" aria-hidden />Khôi phục
              </button>
            ) : (
              <>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onQty(it) }} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-slate-100">
                  <Hash className="size-4 text-indigo-600" aria-hidden />Số lượng
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onAdjust(it.id, 'gift') }} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-slate-100">
                  <Gift className="size-4 text-amber-600" aria-hidden />Tặng món
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onAdjust(it.id, 'cancelled') }} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-red-700 hover:bg-red-50">
                  <Trash2 className="size-4" aria-hidden />Bỏ món
                </button>
              </>
            )}
          </span>
        )}
      </span>
    </li>
  )
}

/** Mig 098: sửa nhanh số lượng khi khách / nhân viên gọi sai. Lý do bắt buộc — in lên bill cho khách đối chiếu.
 *  Bớt về 0 thì dùng "Bỏ món" (có audit riêng), nên số lượng tối thiểu là 1. */
function QtyDialog({ item, busy, onClose, onSubmit }: {
  item: SessionOrderItem
  busy: boolean
  onClose: () => void
  onSubmit: (qty: number, reason: string) => void
}) {
  const [qty, setQty] = useState(item.quantity)
  const [reason, setReason] = useState('')
  const changed = qty !== item.quantity
  const ok = changed && qty >= 1 && reason.trim().length > 0
  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!busy}
      title={`Sửa số lượng · ${item.name}`}
      description="Bớt hẳn món thì dùng Bỏ món. Lý do được ghi lại và in lên tạm tính / hoá đơn."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button variant="primary" isLoading={busy} disabled={!ok} onClick={() => onSubmit(qty, reason.trim())}>Lưu số lượng</Button>
        </>
      }
    >
      <div className="flex items-center justify-center gap-3">
        <IconButton icon={<Minus />} label="Bớt 1" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={busy || qty <= 1} className="size-11 border border-slate-300" />
        <Input
          aria-label="Số lượng mới"
          inputMode="numeric"
          value={String(qty)}
          onChange={(e) => {
            const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
            setQty(Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1)
          }}
          className="w-20 text-center text-2xl font-bold tabular"
        />
        <IconButton icon={<Plus />} label="Thêm 1" onClick={() => setQty((q) => Math.min(999, q + 1))} disabled={busy} className="size-11 border border-slate-300" />
      </div>
      <p className="mt-2 text-center text-[13px] text-slate-500 tabular">
        Đang là {item.quantity}{changed ? ` → ${qty}` : ''}
      </p>
      <label className="mt-3 block text-[13px] font-semibold text-slate-700" htmlFor="pos-qty-reason">
        Lý do (bắt buộc)
        <Input
          id="pos-qty-reason"
          value={reason}
          maxLength={200}
          placeholder="VD: khách gọi nhầm, nhân viên bấm thừa"
          onChange={(e) => setReason(e.target.value)}
          className="mt-1"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QTY_REASONS.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className="cursor-pointer rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[12px] text-slate-700 hover:bg-slate-50">
            {r}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

const QTY_REASONS = ['Khách gọi nhầm', 'Nhân viên bấm nhầm', 'Khách gọi thêm', 'Bếp báo hết bớt phần']

function OtherActions({ list, freeTables, otherSessions, busy, onReset, onAddTable, onMergeInto, onReleaseHost, onClearPick, picked }: PosBillPanelProps & { list: OpenTableSession[] }) {
  if (list.length > 1) {
    return picked.length > 0 ? <Button variant="ghost" onClick={onClearPick} className="mt-3 w-full">Bỏ chọn {picked.length} mâm</Button> : null
  }
  const s = list[0]
  return (
    <details className="mt-4 rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Thao tác khác</summary>
      <label className="mt-3 block text-[13px] text-slate-500" htmlFor="pos-bill-add-table">Thêm bàn trống vào mâm này</label>
      <div className="mt-1">
        <Select id="pos-bill-add-table" disabled={busy || freeTables.length === 0} defaultValue=""
          onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) onAddTable(s.session_id, v) }}>
          <option value="">— chọn bàn trống —</option>
          {freeTables.map((t) => <option key={t.id} value={t.id}>{t.table_number}</option>)}
        </Select>
      </div>
      <label className="mt-3 block text-[13px] text-slate-500" htmlFor="pos-bill-merge-into">Nhập bàn này vào một mâm khác (gộp cả đơn)</label>
      <div className="mt-1">
        <Select id="pos-bill-merge-into" disabled={busy || otherSessions.length === 0} defaultValue=""
          onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) onMergeInto(s.session_id, v) }}>
          <option value="">— chọn mâm đích —</option>
          {otherSessions.map((o) => <option key={o.session_id} value={o.session_id}>{o.table_number}</option>)}
        </Select>
      </div>
      <Button onClick={() => onReleaseHost(s.session_id)} disabled={busy} className="mt-3 w-full">Nhả quyền gọi món (khách hết pin / đổi máy)</Button>
      <Button variant="danger" onClick={() => onReset(s)} disabled={busy} className="mt-2 w-full" title="Huỷ đơn chưa nấu và chưa thu tiền, đóng phiên">
        Bỏ bàn (không thu tiền)
      </Button>
    </details>
  )
}

/** Màn Thanh toán & đóng mâm — bản Stitch P04. */
function PaymentView({ title, list, total, busy, onAdjust, onQty, onRestore, onBack, onDismiss, onPay, onPrint }: {
  title: string
  list: OpenTableSession[]
  total: number
  busy: boolean
  onAdjust: (itemId: string, type: 'cancelled' | 'gift') => void
  onQty: (item: SessionOrderItem) => void
  onRestore: (itemId: string) => void
  onBack: () => void
  onDismiss: () => void
  onPay: (instrument: 'cash' | 'bank') => void
  onPrint: () => void
}) {
  const [method, setMethod] = useState<'cash' | 'bank'>('cash')
  const [givenText, setGivenText] = useState('')
  const given = parseVnd(givenText)
  const change = cashChange(total, given)
  const items = list.flatMap((s) => s.orders.filter((o) => o.status !== 'cancelled').flatMap((o) => o.items))
  const short = method === 'cash' && change.kind === 'short'
  const giftCount = items.filter((i) => i.void_type === 'gift').length

  return (
    <Khung
      icon={<Receipt />}
      tieuDe="Thanh toán"
      moTa={`Đóng mâm · ${title}`}
      lead={<IconButton icon={<ArrowLeft />} label="Quay lại bill" onClick={onBack} className="text-white hover:bg-white/10 hover:text-white" />}
      right={
        <div className="text-right">
          <p className="text-[11px] font-bold tracking-wide text-slate-400 uppercase">Cần thu</p>
          <p className="text-xl font-bold text-orange-400 tabular">{dong(total)}</p>
        </div>
      }
      onDismiss={onDismiss}
      footer={
        <>
          <Button variant="primary" size="touch" icon={<Banknote />} isLoading={busy} disabled={short} onClick={() => onPay(method)} className="w-full text-base font-bold whitespace-nowrap">
            Xác nhận đã nhận {dong(total)}
          </Button>
          <Button icon={<Printer className="text-blue-600" />} onClick={onPrint} disabled={busy} className="mt-2 w-full font-semibold">In tạm tính / hoá đơn</Button>
          <p className="mt-2 text-[12px] text-slate-500">Máy in lỗi vẫn thu tiền bình thường — in hoá đơn sau cũng được.</p>
        </>
      }
    >
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="flex items-center justify-between gap-2 text-[12px] font-bold tracking-wide text-slate-700 uppercase">
          <span className="flex items-center gap-1.5"><Receipt className="size-4 text-orange-600" aria-hidden />Món đã dùng &amp; điều chỉnh</span>
          <span className="font-semibold text-slate-400 normal-case">{items.length} món</span>
        </h3>
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((it) => <ItemRow key={it.id} item={it} busy={busy} onAdjust={onAdjust} onQty={onQty} onRestore={onRestore} />)}
        </ul>
      </section>

      <section className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
        {giftCount > 0 && <p className="mb-1 flex justify-between text-[13px] text-slate-600"><span>Món tặng (tính 0đ)</span><span className="tabular">{giftCount} món</span></p>}
        <p className="flex items-end justify-between gap-2">
          <span>
            <span className="block text-sm font-bold text-slate-900 uppercase">Tổng thanh toán</span>
            <span className="text-[12px] text-slate-500">{list.length > 1 ? `Gộp ${list.length} mâm · đóng cả loạt sau khi thu` : 'Thu xong bàn tự trống, đơn chuyển Hoàn tất'}</span>
          </span>
          <span className="text-2xl font-bold text-orange-600 tabular">{dong(total)}</span>
        </p>
      </section>

      <section className="mt-3">
        <p className="mb-2 text-[12px] font-bold tracking-wide text-slate-700 uppercase">Phương thức thu tiền thực tế</p>
        <div role="radiogroup" aria-label="Phương thức thu tiền" className="grid grid-cols-2 gap-2">
          {([['cash', 'Tiền mặt', <Banknote key="c" />], ['bank', 'Chuyển khoản', <Landmark key="b" />]] as const).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => setMethod(value)}
              className={cn(
                'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 text-sm font-bold transition-colors [&>svg]:size-4',
                method === value ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      </section>

      {method === 'cash' ? (
        <div className="mt-3 space-y-3">
          <label className="block text-[13px] font-semibold text-slate-700" htmlFor="pos-cash-given">
            Tiền khách đưa (VND)
            <Input
              id="pos-cash-given"
              inputMode="numeric"
              autoComplete="off"
              placeholder={total.toLocaleString('vi-VN')}
              value={givenText}
              onChange={(e) => setGivenText(formatVndInput(e.target.value))}
              className="mt-1 text-lg font-bold tabular"
            />
            <span className="mt-1 block text-[12px] font-normal text-slate-500">Gõ số, dấu chấm tự thêm. Để trống nếu khách đưa vừa đủ</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-slate-500">Gợi ý nhanh:</span>
            {cashSuggestions(total).map((v) => (
              <Button key={v} onClick={() => setGivenText(v.toLocaleString('vi-VN'))} className="min-h-9 font-semibold tabular md:min-h-9">
                {v === total ? `Vừa đủ ${dong(v)}` : dong(v)}
              </Button>
            ))}
          </div>
          {change.kind === 'ok' && (
            <p className="flex items-baseline justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
              <span className="text-sm font-semibold">Tiền thối lại cho khách</span>
              <span className="text-xl font-bold tabular">{dong(change.change)}</span>
            </p>
          )}
          {change.kind === 'short' && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 tabular">
              Khách đưa còn thiếu {dong(change.missing)}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
          Cho khách quét mã QR của quán, <b className="font-bold">nghe loa báo tiền về đủ {dong(total)}</b> rồi mới bấm xác nhận.
        </p>
      )}
    </Khung>
  )
}

/**
 * Khung cột phải, đầu nền tối như bản Stitch. Từ xl: cột 400px cạnh Timeline (X đưa về Việc cần xử lý).
 * Dưới xl: sheet đáy có nền mờ. Tổng + nút thu ở footer đứng yên, phần món cuộn.
 */
function Khung({ icon, tieuDe, badge, moTa, lead, right, headerExtra, top, footer, onDismiss, children }: {
  icon?: ReactNode
  tieuDe: string
  badge?: ReactNode
  moTa?: string
  lead?: ReactNode
  right?: ReactNode
  headerExtra?: ReactNode
  top?: ReactNode
  footer?: ReactNode
  onDismiss: () => void
  children: ReactNode
}) {
  return (
    <>
      <button type="button" aria-label="Đóng bill" onClick={onDismiss} className="fixed inset-0 z-30 bg-foreground/40 xl:hidden" />
      <aside
        aria-label="Bill"
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-modal xl:static xl:max-h-none xl:w-[400px] xl:shrink-0 xl:rounded-none xl:border-l xl:border-slate-200 xl:shadow-none"
      >
        <header className="shrink-0 bg-slate-900 px-3 py-3 text-white">
          <div className="flex items-start gap-2.5">
            {lead}
            {icon && !lead ? <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-orange-600 text-white [&>svg]:size-5" aria-hidden>{icon}</span> : null}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-base font-bold text-white">{tieuDe}</h2>
                {badge}
              </div>
              {moTa ? <p className="mt-0.5 truncate text-[13px] text-slate-300">{moTa}</p> : null}
            </div>
            {right}
            <IconButton icon={<X />} label="Đóng bill" onClick={onDismiss} className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white" />
          </div>
          {headerExtra}
        </header>
        {top}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-3">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>
        ) : null}
      </aside>
    </>
  )
}
