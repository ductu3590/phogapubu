'use client'

import { useState, type ReactNode } from 'react'
import {
  ArrowLeft, Banknote, BellRing, Clock3, EllipsisVertical, Gift, Hash, Layers, Link2, Lock, Minus, Plus, Printer, Receipt,
  RotateCcw, Smartphone, Trash2, UserRound, X,
} from 'lucide-react'
import type { OpenTableSession, SessionOrderItem, SessionOrderRow } from '@/lib/actions/table-session'
import type { ReservationPreorderRow } from '@/lib/actions/reservation-preorders'
import { sessionTimeoutMessage } from '@/lib/session-timeout'
import { cashChange, parseVnd } from '@/lib/cash-change'
import { buildPaymentLines, fillOtherSide, type PayMethod, type PaymentLine } from '@/lib/collect-payment'
import { billTotals, combinedDiscount, sessionDiscountOf, type BillDiscount } from '@/lib/bill-discount'
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
import type { MoveTarget } from '@/lib/table-move'
import { groupTablesByArea, type StaffArea } from '@/lib/staff-area-groups'
import DiscountDialog from './discount-dialog'
import PaymentMethodFields from './payment-method-fields'

// Bill của /admin/pos theo bản Stitch P01 (bill dạng tab) + P03 (lượt gọi mới) + P04 (thanh toán một nút).
// Mọi con số tiền là của server (OpenTableSession.total, order.total_amount); bill KHÔNG tự cộng tổng.
// Thành tiền từng dòng món chỉ để đọc (đơn giá snapshot × số lượng). Thu tiền (mig 112a): gửi từng khoản +
// tiền khách đưa lên collect_table_bill; server tự tính số phải thu và từ chối nếu lệch.

/** Một lần bấm "Xác nhận đã nhận" ở màn Thanh toán → tham số của collectTableBill (trừ sessionIds). */
export type PosPayment = { lines: PaymentLine[]; cashGiven: number | null; clientRequestId: string }

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
  onPay: (list: OpenTableSession[], payment: PosPayment) => void
  onPrint: (list: OpenTableSession[]) => void
  onReset: (s: OpenTableSession) => void
  onCreateTray: () => void
  onAddTable: (sessionId: string, tableId: string) => void
  /** Bàn trống chuyển được tới (đã loại bàn trong khung giữ đặt trước) + khu để nhóm danh sách. */
  moveTargets: MoveTarget[]
  moveAreas: StaffArea[]
  onMoveTable: (sessionId: string, fromTableId: string, toTableId: string) => void
  /** Chuyển CẢ mâm (mọi bàn của phiên) sang một bàn trống (mig 106). */
  onMoveTray: (sessionId: string, toTableId: string) => void
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
  /** Giảm giá cả bill (mig 107). 1 phiên → RPC một phiên, gộp bill → RPC nhiều phiên. null = bỏ giảm giá. Trả true khi lưu xong. */
  onSetDiscount: (sessionIds: string[], d: BillDiscount) => Promise<boolean>
  onClearPick: () => void
  onDismiss: () => void
  /** Hàng chờ món đặt trước — để in phiếu món đặt trước ngay trong bill khi khách đã đến. */
  preorders: ReservationPreorderRow[]
  onPrintPreorder: (row: ReservationPreorderRow, reason?: string) => Promise<{ ok: boolean }>
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
  const [discountOpen, setDiscountOpen] = useState(false)

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

  // Số tiền thu + giảm giá cả bill (mig 107/108): tính bằng cùng hàm với server, trên tiền hàng CHƯA thu của từng mâm
  // (đơn đã nhận tiền trước không dính giảm giá, cũng không thu lại). Giảm giá lỗi → payable giữ số trước giảm.
  const { goods, paid, discount, payable, error: discountError } = billTotals(list)
  const discountLabel = discountLabelOf(list)
  // Phiên hết hạn (còn nợ) bị RPC từ chối giảm giá ("Phiên đã đóng") — nói rõ thay vì lặng lẽ bỏ qua.
  const expired = list.filter(isExpiredSession)
  const expiredNote = expired.length === 0
    ? null
    : list.length === 1
      ? 'Phiên hết hạn không giảm giá được'
      : `Phiên hết hạn không giảm giá được: ${expired.map((s) => name(s)).join(', ')}`
  const pending = list.flatMap((s) => s.orders.filter(isReviewableOrder).map((o) => ({ s, o })))
  const pendingTotal = pending.reduce((n, p) => n + p.o.total_amount, 0)
  const pendingUnpaid = pending.reduce((n, p) => n + (p.o.payment_received_at ? 0 : p.o.total_amount), 0)
  const title = list.length > 1 ? `Gộp bill ${list.length} mâm` : name(list[0])
  const isTray = list.length > 1 || trayColors.has(list[0].session_id)

  const preorderOf = (orderId: string) => props.preorders.find((p) => p.orderId === orderId)
  const printPreorder = async (row: ReservationPreorderRow) => {
    const reprint = row.releasedRevision > 0 && !row.needsPrint && !row.needsReview
    const reason = reprint ? prompt('Lý do in lại phiếu') ?? undefined : undefined
    const result = await props.onPrintPreorder(row, reason)
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

  const discountDialog = discountOpen && (
    <DiscountDialog
      current={currentDiscountOf(list)}
      subtotals={list.map((s) => s.unpaid_total)}
      busy={busy}
      onClose={() => setDiscountOpen(false)}
      onSave={async (d) => {
        const ok = await props.onSetDiscount(list.map((s) => s.session_id), d)
        if (ok) setDiscountOpen(false)
        return ok
      }}
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
      {discountDialog}
      <PaymentView
        title={title}
        list={list}
        goods={goods}
        paid={paid}
        expiredNote={expiredNote}
        discount={discount}
        discountLabel={discountLabel}
        discountError={discountError}
        onEditDiscount={() => setDiscountOpen(true)}
        total={payable}
        busy={busy}
        onAdjust={dieuChinh}
        onQty={suaSoLuong}
        onRestore={props.onRestoreOrderItem}
        onBack={() => setPaying(false)}
        onDismiss={props.onDismiss}
        onPay={(payment) => props.onPay(list, payment)}
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
    {discountDialog}
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
            {/* Cùng nền với màn Thanh toán: tiền hàng CHƯA thu của các lượt đã duyệt, trước giảm giá. Lượt đã thu trước
                (dữ liệu cũ, trước mig 110) tách riêng để ô này không lớn hơn số sẽ thu. */}
            <p className="text-[11px] font-bold tracking-wide text-slate-400 uppercase">Đã duyệt · chưa thu</p>
            <p className="text-lg font-bold text-white tabular">{dong(goods - pendingUnpaid)}</p>
            {paid > 0 && <p className="text-[12px] text-slate-400">Đã thu trước {dong(paid)}</p>}
            {discount > 0 && !discountError && <p className="text-[12px] text-slate-400">Chưa trừ giảm giá {dong(discount)}</p>}
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
          {discountError && (
            <p role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">
              {discountError}. Mở Thanh toán để sửa giảm giá.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {list.length === 1 ? (
              <Button icon={<Plus className="text-orange-600" />} onClick={() => props.onOpenManualOrder(list[0].session_id)} disabled={busy} className="font-semibold">
                Gọi thêm món
              </Button>
            ) : <span />}
            <Button icon={<Printer className="text-blue-600" />} onClick={() => props.onPrint(list)} disabled={busy || !!discountError} className="font-semibold">In tạm tính</Button>
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
              Thanh toán · {dong(payable)}
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

          {discount > 0 && !discountError && (
            <p className="mt-3 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-700">Giảm giá{discountLabel ? ` (${discountLabel})` : ''}</span>
              <b className="font-bold text-orange-700 tabular">−{dong(discount)}</b>
            </p>
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

function OtherActions({ list, freeTables, otherSessions, busy, onReset, onAddTable, onMergeInto, onReleaseHost, onClearPick, picked, moveTargets, moveAreas, onMoveTable, onMoveTray }: PosBillPanelProps & { list: OpenTableSession[] }) {
  if (list.length > 1) {
    return picked.length > 0 ? <Button variant="ghost" onClick={onClearPick} className="mt-3 w-full">Bỏ chọn {picked.length} mâm</Button> : null
  }
  const s = list[0]
  return (
    <details className="mt-4 rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">Thao tác khác</summary>
      <MoveTableControl session={s} targets={moveTargets} areas={moveAreas} busy={busy} onMove={onMoveTable} onMoveTray={onMoveTray} />
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

/** Chuyển bàn. Phiên 1 bàn: chọn bàn đích. Mâm nhiều bàn: chọn "Đổi một bàn" (chọn bàn cần đổi rồi bàn đích,
 *  đổi từng bàn một) hoặc "Chuyển cả mâm sang một bàn" (mọi bàn của mâm dồn vào MỘT bàn trống). */
function MoveTableControl({ session, targets, areas, busy, onMove, onMoveTray }: {
  session: OpenTableSession
  targets: MoveTarget[]
  areas: StaffArea[]
  busy: boolean
  onMove: (sessionId: string, fromTableId: string, toTableId: string) => void
  onMoveTray: (sessionId: string, toTableId: string) => void
}) {
  const [fromId, setFromId] = useState('')
  const [mode, setMode] = useState<'one' | 'tray'>('one')
  const multi = session.tables.length > 1
  const tray = multi && mode === 'tray'
  // Sau khi chuyển, bàn vừa đổi không còn trong mâm → bỏ lựa chọn cũ, không để lại id lạc.
  const from = multi ? (session.tables.some((t) => t.id === fromId) ? fromId : '') : session.tables[0]?.id ?? session.table_id
  const groups = groupTablesByArea(targets, areas)
  const needFrom = multi && !tray && !from
  return (
    <div>
      {multi && (
        <div role="radiogroup" aria-label="Cách chuyển bàn" className="mt-3 grid grid-cols-2 gap-1.5">
          {([['one', 'Đổi một bàn'], ['tray', 'Chuyển cả mâm sang một bàn']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              disabled={busy}
              onClick={() => setMode(value)}
              className={cn(
                'min-h-10 cursor-pointer rounded-lg border px-2 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-60',
                mode === value ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {multi && !tray && (
        <>
          <label className="mt-3 block text-[13px] text-slate-500" htmlFor="pos-bill-move-from">Bàn cần đổi</label>
          <div className="mt-1">
            <Select id="pos-bill-move-from" disabled={busy} value={from} onChange={(e) => setFromId(e.target.value)}>
              <option value="">— chọn bàn trong mâm —</option>
              {session.tables.map((t) => <option key={t.id} value={t.id}>{t.table_number}</option>)}
            </Select>
          </div>
        </>
      )}
      <label className="mt-3 block text-[13px] text-slate-500" htmlFor="pos-bill-move-to">
        {tray ? `Chuyển cả mâm (${session.table_number}) sang bàn trống` : 'Chuyển sang bàn trống'}
      </label>
      <div className="mt-1">
        <Select id="pos-bill-move-to" disabled={busy || needFrom || targets.length === 0} defaultValue=""
          onChange={(e) => {
            const v = e.target.value
            e.target.value = ''
            if (!v) return
            if (tray) onMoveTray(session.session_id, v)
            else if (from) onMove(session.session_id, from, v)
          }}>
          <option value="">{needFrom ? '— chọn bàn cần đổi trước —' : targets.length === 0 ? '— không còn bàn trống —' : '— chọn bàn đích —'}</option>
          {groups.map((g) => (
            <optgroup key={g.area?.id ?? 'none'} label={g.area?.name ?? (areas.length > 0 ? 'Chưa phân khu' : 'Bàn trống')}>
              {g.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.table_number}{t.laterReservationAt ? ` · có khách đặt lúc ${gio(t.laterReservationAt)}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
    </div>
  )
}

/** Phiên đã hết hạn (đóng nhưng còn nợ): server không nhận giảm giá cho nó. */
const isExpiredSession = (s: OpenTableSession) => s.needs_review || s.status === 'closed'

/** "10%" khi mọi mâm đang giảm cùng một mức %; còn lại (VNĐ, mỗi mâm một mức, không giảm) → rỗng. */
function discountLabelOf(list: OpenTableSession[]): string {
  const ds = list.map(sessionDiscountOf)
  const first = ds[0]
  if (!first || first.type !== 'percent') return ''
  return ds.every((d) => d?.type === 'percent' && d.value === first.value) ? `${first.value}%` : ''
}

/** Giảm giá đang áp, để mở sẵn trong hộp: 1 mâm → đúng ý định của nó; gộp bill đồng đều % → % đó; còn lại → tổng VNĐ. */
function currentDiscountOf(list: OpenTableSession[]): BillDiscount {
  if (list.length === 1) return sessionDiscountOf(list[0])
  if (discountLabelOf(list)) return sessionDiscountOf(list[0])
  const sum = combinedDiscount(list)
  return sum > 0 ? { type: 'amount', value: sum } : null
}

/** Màn Thanh toán & đóng mâm — bản Stitch P04. */
export function PaymentView({ title, list, goods, paid, expiredNote, discount, discountLabel, discountError, onEditDiscount, total, busy, onAdjust, onQty, onRestore, onBack, onDismiss, onPay, onPrint }: {
  title: string
  list: OpenTableSession[]
  /** Tổng tiền hàng CHƯA thu (trước giảm giá) — nền của giảm giá và của số tiền thu. */
  goods: number
  /** Các đơn đã nhận tiền trước (không thu lại) — hiện riêng để phép tính nhìn thấy được. */
  paid: number
  /** Có phiên hết hạn trong bill → không giảm giá được; null = giảm giá bình thường. */
  expiredNote: string | null
  /** Số tiền giảm cả bill (0 = không giảm). */
  discount: number
  /** "10%" khi giảm theo %, rỗng khi giảm VNĐ / không giảm. */
  discountLabel: string
  /** validateDiscount khác null → khoá nút thu + in, hiện chữ đỏ. */
  discountError: string | null
  onEditDiscount: () => void
  /** Khách cần trả = tiền hàng − giảm giá. */
  total: number
  busy: boolean
  onAdjust: (itemId: string, type: 'cancelled' | 'gift') => void
  onQty: (item: SessionOrderItem) => void
  onRestore: (itemId: string) => void
  onBack: () => void
  onDismiss: () => void
  onPay: (payment: PosPayment) => void
  onPrint: () => void
}) {
  const [method, setMethod] = useState<PayMethod>('cash')
  const [cashText, setCashText] = useState('')
  const [bankText, setBankText] = useState('')
  const [givenText, setGivenText] = useState('')
  // Một mã cho cả lần mở màn này, kể cả bấm lại sau lỗi: lần trước lỗi thì server đã huỷ cả giao dịch; lần
  // trước mất mạng mà server đã thu thì cùng mã trả 'already' — bấm hai lần không thành hai khoản thu.
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const draft = buildPaymentLines(total, method, parseVnd(cashText), parseVnd(bankText))
  const cashPart = method === 'mixed' ? parseVnd(cashText) ?? 0 : method === 'cash' ? total : 0
  const bankPart = method === 'mixed' ? parseVnd(bankText) ?? 0 : method === 'bank' ? total : 0
  const given = parseVnd(givenText)
  const change = cashChange(cashPart, given)
  const items = list.flatMap((s) => s.orders.filter((o) => o.status !== 'cancelled').flatMap((o) => o.items))
  const short = cashPart > 0 && change.kind === 'short'
  const blocked = short || !!draft.error || !!discountError

  const chonPhuongThuc = (m: PayMethod) => {
    setMethod(m)
    setGivenText('') // tiền khách đưa so với phần tiền mặt, đổi phương thức thì phần đó đổi
  }
  const goTienMat = (text: string) => {
    setCashText(text)
    const other = fillOtherSide(total, parseVnd(text))
    setBankText(other === null ? '' : other.toLocaleString('vi-VN'))
  }
  const goChuyenKhoan = (text: string) => {
    setBankText(text)
    const other = fillOtherSide(total, parseVnd(text))
    setCashText(other === null ? '' : other.toLocaleString('vi-VN'))
  }
  const thu = () => onPay({ lines: draft.lines, cashGiven: cashPart > 0 ? given : null, clientRequestId })
  // Giảm giá ĐANG LƯU trên phiên. Lỗi (vd giảm VNĐ > tiền hàng sau khi bỏ món) thì `discount` = 0 để số thu giữ
  // nguyên trước giảm, nhưng vẫn phải cho thu ngân thấy mức đã đặt và sửa nó — không hiện "Thêm giảm giá".
  const storedDiscount = discountError ? combinedDiscount(list) : discount
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
          {method === 'mixed' && !draft.error && total > 0 && (
            <p className="mb-2 text-center text-[13px] text-slate-600 tabular">
              Tiền mặt {dong(cashPart)} · Chuyển khoản {dong(bankPart)}
            </p>
          )}
          <Button variant="primary" size="touch" icon={<Banknote />} isLoading={busy} disabled={blocked} onClick={thu} className="w-full text-base font-bold whitespace-nowrap">
            Xác nhận đã nhận {dong(total)}
          </Button>
          <Button icon={<Printer className="text-blue-600" />} onClick={onPrint} disabled={busy || !!discountError} className="mt-2 w-full font-semibold">In tạm tính / hoá đơn</Button>
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
        {paid > 0 && <p className="mb-1 flex justify-between text-[13px] text-slate-600"><span>Đã thu trước (không tính vào bill này)</span><span className="tabular">{dong(paid)}</span></p>}
        <p className="flex justify-between text-sm text-slate-700"><span>Tổng tiền hàng</span><span className="font-semibold tabular">{dong(goods)}</span></p>
        <p className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-700">
          <span>Giảm giá{discountLabel && !discountError ? ` (${discountLabel})` : ''}</span>
          {expiredNote ? (
            // Bill gộp có mâm hết hạn: không sửa được giảm giá, nhưng mâm còn mở vẫn được trừ → hiện số để
            // Tổng tiền hàng − Giảm giá = Khách cần trả cộng được bằng mắt.
            storedDiscount > 0 ? (
              <span className={cn('font-semibold tabular', discountError ? 'text-red-700' : 'text-orange-700')}>−{dong(storedDiscount)}</span>
            ) : null
          ) : (
            <button
              type="button"
              onClick={onEditDiscount}
              disabled={busy}
              aria-label="Sửa giảm giá hoá đơn"
              className={cn(
                'min-h-9 cursor-pointer rounded-md border bg-white px-2.5 font-semibold tabular disabled:cursor-not-allowed disabled:opacity-60',
                discountError ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-orange-300 text-orange-700 hover:bg-orange-100',
              )}
            >
              {discountError ? `Sửa −${dong(storedDiscount)}` : storedDiscount > 0 ? `−${dong(storedDiscount)}` : 'Thêm giảm giá'}
            </button>
          )}
        </p>
        {expiredNote && <p className="mt-1 text-[13px] text-slate-600">{expiredNote}</p>}
        {discountError && <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[13px] font-semibold text-red-700">{discountError}</p>}
        {giftCount > 0 && <p className="mt-1 flex justify-between text-[13px] text-slate-600"><span>Món tặng (tính 0đ)</span><span className="tabular">{giftCount} món</span></p>}
        <p className="mt-2 flex items-end justify-between gap-2 border-t border-orange-200 pt-2">
          <span>
            <span className="block text-sm font-bold text-slate-900 uppercase">Khách cần trả</span>
            <span className="text-[12px] text-slate-500">{list.length > 1 ? `Gộp ${list.length} mâm · đóng cả loạt sau khi thu` : 'Thu xong bàn tự trống, đơn chuyển Hoàn tất'}</span>
          </span>
          <span className="text-2xl font-bold text-orange-600 tabular">{dong(total)}</span>
        </p>
      </section>

      <PaymentMethodFields
        method={method}
        total={total}
        cashPart={cashPart}
        cashText={cashText}
        bankText={bankText}
        givenText={givenText}
        mixedError={method === 'mixed' && (cashText !== '' || bankText !== '') ? draft.error : null}
        onMethod={chonPhuongThuc}
        onCashText={goTienMat}
        onBankText={goChuyenKhoan}
        onGivenText={setGivenText}
      />
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
