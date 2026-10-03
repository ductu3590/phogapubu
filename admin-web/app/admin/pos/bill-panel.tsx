'use client'

import { useState, type ReactNode } from 'react'
import { ArrowLeft, Banknote, BellRing, Layers, Lock, Plus, Printer, Receipt, X } from 'lucide-react'
import type { OpenTableSession, SessionOrderItem, SessionOrderRow } from '@/lib/actions/table-session'
import { sessionTimeoutMessage } from '@/lib/session-timeout'
import { cashChange, cashSuggestions, formatVndInput, parseVnd } from '@/lib/cash-change'
import { isReviewableOrder, orderRound } from '@/lib/pos-work-queue'
import { clock } from '@/lib/pos-timeline'
import type { TrayAssignment } from '@/lib/tray-colors'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Banner, EmptyState } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/field'
import { Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// Bill của /admin/pos theo bản Stitch P01 (bill dạng tab) + P04 (thanh toán một nút).
// Mọi con số tiền là của server (OpenTableSession.total, order.total_amount); bill KHÔNG tự cộng tổng.
// Tiền khách đưa / tiền thối chỉ để thu ngân đếm tiền, không gửi lên server.

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const gio = (iso: string) => clock(new Date(iso).getTime())

type Tab = 'bill' | 'new' | 'prints'

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
  onRestoreOrderItem: (orderItemId: string) => void
  onClearPick: () => void
  onDismiss: () => void
}

function orderLabel(session: OpenTableSession, order: SessionOrderRow): string {
  if (order.order_source === 'pos') return 'Ghi tay'
  if (order.order_source === 'reservation_preorder') return 'Món đặt trước'
  return `Lượt ${orderRound(session, order.id)}`
}

export default function PosBillPanel(props: PosBillPanelProps) {
  const { selected, picked, pickedFreeTables, trayColors, busy } = props
  const [tab, setTab] = useState<Tab>('bill')
  const [paying, setPaying] = useState(false)

  const list = picked.length > 0 ? picked : selected ? [selected] : []
  const name = (s: OpenTableSession) => {
    const tray = trayColors.get(s.session_id)
    return tray ? `Mâm ${tray.index} · ${s.table_number}` : s.table_number
  }

  if (pickedFreeTables >= 2 && list.length === 0) {
    return (
      <Khung tieuDe={`Đã chọn ${pickedFreeTables} bàn trống`} onDismiss={props.onClearPick}>
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

  const dieuChinh = (itemId: string, type: 'cancelled' | 'gift') => {
    const label = type === 'cancelled' ? 'bỏ món này' : 'tặng món này'
    if (!confirm(`Xác nhận ${label}? Tổng bill sẽ được tính lại.`)) return
    const reason = prompt(`Lý do ${label} (có thể để trống):`) ?? undefined
    props.onVoidOrderItem(itemId, type, reason)
  }

  const itemRow = (it: SessionOrderItem) => (
    <ItemRow key={it.id} item={it} busy={busy} onAdjust={dieuChinh} onRestore={props.onRestoreOrderItem} />
  )

  if (paying) {
    return (
      <PaymentView
        title={title}
        list={list}
        total={tong}
        busy={busy}
        itemRow={itemRow}
        onBack={() => setPaying(false)}
        onDismiss={props.onDismiss}
        onPay={(instrument) => props.onPay(list, instrument)}
        onPrint={() => props.onPrint(list)}
      />
    )
  }

  const meta = list.length === 1
    ? `Mở lúc ${gio(list[0].opened_at)} · ${list[0].opened_by === 'staff' ? 'nhân viên mở' : 'khách quét QR'}`
    : list.map((s) => name(s)).join(' + ')

  const settled = list.flatMap((s) => s.orders.filter((o) => !isReviewableOrder(o)).map((o) => ({ s, o })))
    .sort((a, b) => a.o.created_at.localeCompare(b.o.created_at))
  // list_open_table_sessions KHÔNG trả confirmed_at (kiểu SessionOrderRow khai thừa) → không lọc theo nó.
  // Lượt khách / nhân viên gọi đã qua bước duyệt (không còn 'pending') = đã in 2 liên lúc duyệt.
  const printed = settled.filter(({ o }) => o.status !== 'pending' && o.order_source !== 'pos' && o.order_source !== 'reservation_preorder')
    .sort((a, b) => b.o.created_at.localeCompare(a.o.created_at))
  const giftCount = settled.reduce((n, { o }) => n + o.items.filter((i) => i.void_type === 'gift').length, 0)

  return (
    <Khung
      tieuDe={title}
      moTa={meta}
      onDismiss={props.onDismiss}
      top={
        <>
          <div className="grid grid-cols-2 gap-2 px-4 pt-3 md:px-5">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <p className="text-[13px] text-muted">Đã duyệt</p>
              <p className="text-base font-semibold text-foreground tabular">{dong(tong - pendingTotal)}</p>
            </div>
            <div className={cn('rounded-lg border px-3 py-2', pending.length > 0 ? 'border-warning-border bg-warning-bg' : 'border-border bg-background')}>
              <p className={cn('text-[13px]', pending.length > 0 ? 'text-warning' : 'text-muted')}>Chờ duyệt · {pending.length} lượt</p>
              <p className={cn('text-base font-semibold tabular', pending.length > 0 ? 'text-warning' : 'text-foreground')}>{dong(pendingTotal)}</p>
            </div>
          </div>
          <div className="border-b border-border px-4 pt-3 md:px-5">
            <Tabs
              variant="underline"
              label="Nội dung bill"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'bill', label: 'Hoá đơn' },
                { value: 'new', label: 'Lượt gọi mới', count: pending.length },
                { value: 'prints', label: 'Lịch sử in', count: printed.length },
              ]}
            />
          </div>
        </>
      }
      footer={
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Tạm tính</span>
            <span className="text-2xl font-semibold text-foreground tabular">{dong(tong)}</span>
          </div>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <Button size="touch" icon={<Printer />} onClick={() => props.onPrint(list)} disabled={busy}>In tạm tính</Button>
            <Button
              variant="primary"
              size="touch"
              icon={pending.length > 0 ? <Lock /> : <Receipt />}
              disabled={busy || pending.length > 0}
              onClick={() => setPaying(true)}
            >
              Thanh toán
            </Button>
          </div>
          {pending.length > 0 && (
            <p className="mt-2 text-[13px] text-warning">
              Còn {pending.length} lượt chờ duyệt — duyệt hoặc từ chối ở tab Lượt gọi mới rồi mới thu tiền.
            </p>
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
            <button
              type="button"
              onClick={() => setTab('new')}
              className="mb-3 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-left text-sm font-medium text-warning"
            >
              <span className="flex items-center gap-2"><BellRing className="size-4" aria-hidden />Có {pending.length} lượt món đang chờ duyệt</span>
              <span className="shrink-0 underline-offset-4 hover:underline">Duyệt ngay →</span>
            </button>
          )}
          {list.length === 1 && (
            <Button icon={<Plus />} onClick={() => props.onOpenManualOrder(list[0].session_id)} disabled={busy} className="mb-3 w-full border-dashed">
              Gọi thêm món <span className="font-normal text-muted">· ghi tay, không báo bếp</span>
            </Button>
          )}

          {settled.length === 0 ? (
            <EmptyState>{pending.length > 0 ? 'Chưa có lượt nào được duyệt.' : 'Mâm này chưa gọi món nào.'}</EmptyState>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {settled.map(({ s, o }) => (
                <li key={o.id} className={cn('py-3', o.status === 'cancelled' && 'opacity-60')}>
                  <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <b className="font-semibold text-foreground">{orderLabel(s, o)}</b>
                      · {gio(o.created_at)}
                      {list.length > 1 && <> · {name(s)}</>}
                      {o.status === 'cancelled' && <Badge tone="critical">Đã từ chối</Badge>}
                    </span>
                    <span className="shrink-0 tabular">{dong(o.total_amount)}</span>
                  </div>
                  <ul className="mt-1.5 space-y-1.5">
                    {o.items.map(itemRow)}
                    {o.items.length === 0 && <li className="text-sm text-muted">Không có món</li>}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {giftCount > 0 && <p className="mt-2 text-[13px] text-muted">Đã tặng {giftCount} món (tính 0đ trong tạm tính).</p>}

          <OtherActions {...props} list={list} />
        </>
      )}

      {tab === 'new' && (
        pending.length === 0 ? (
          <EmptyState>Không có lượt nào chờ duyệt.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {pending.map(({ s, o }) => (
              <li key={o.id} className="rounded-xl border border-warning-border bg-surface p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {orderLabel(s, o)} <span className="font-normal text-muted">· {gio(o.created_at)}{list.length > 1 ? ` · ${name(s)}` : ''}</span>
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular">{dong(o.total_amount)}</p>
                </div>
                <p className="text-[13px] text-muted">{o.order_source === 'staff' ? 'Nhân viên đặt hộ' : 'Khách gọi qua QR'}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {o.items.filter((i) => i.void_type !== 'cancelled').map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="min-w-0"><b className="font-semibold tabular">{i.quantity}×</b> {i.name}
                        {i.toppings.length > 0 && <span className="block text-[13px] text-muted">+ {i.toppings.map((t) => t.name).join(', ')}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                  <Button onClick={() => props.onRejectOrder(o.id)} disabled={busy}>Từ chối</Button>
                  <Button variant="primary" icon={<Printer />} onClick={() => props.onConfirmOrder(o.id)} disabled={busy}>Duyệt &amp; in bếp</Button>
                </div>
              </li>
            ))}
            <li className="text-[13px] text-muted">Duyệt xong in 2 liên: phiếu bếp + phiếu đặt ở bàn khách.</li>
          </ul>
        )
      )}

      {tab === 'prints' && (
        printed.length === 0 ? (
          <EmptyState>Chưa duyệt lượt nào nên chưa có phiếu in.</EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-border border-y border-border">
              {printed.map(({ s, o }) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <b className="font-semibold">{orderLabel(s, o)}</b>
                    <span className="text-muted"> · gọi lúc {gio(o.created_at)} · {o.items.length} món{list.length > 1 ? ` · ${name(s)}` : ''}</span>
                  </span>
                  <Button icon={<Printer />} onClick={() => props.onPrintOrder(o.id)} className="min-h-9 shrink-0 md:min-h-9">In lại</Button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted">Kẹt giấy / hết giấy: bấm In lại bất cứ lúc nào, không làm lệch bill.</p>
          </>
        )
      )}
    </Khung>
  )
}

function ItemRow({ item: it, busy, onAdjust, onRestore }: {
  item: SessionOrderItem
  busy: boolean
  onAdjust: (itemId: string, type: 'cancelled' | 'gift') => void
  onRestore: (itemId: string) => void
}) {
  const cancelled = it.void_type === 'cancelled'
  const gift = it.void_type === 'gift'
  const toppingText = it.toppings?.map((t) => t.name).join(', ')
  return (
    <li className="flex items-start justify-between gap-2 text-sm">
      <span className={cn('min-w-0', cancelled ? 'text-critical line-through' : 'text-foreground')}>
        <b className="font-semibold tabular">{it.quantity}×</b> {it.name}
        {toppingText && <span className="text-[13px] text-muted"> + {toppingText}</span>}
        {cancelled && <Badge tone="critical" className="ml-1.5 no-underline">Khách bỏ</Badge>}
        {gift && <Badge tone="neutral" className="ml-1.5">Tặng · 0đ</Badge>}
        {it.void_reason && <span className="block text-[13px] text-muted no-underline">Lý do: {it.void_reason}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {it.void_type ? (
          <Button variant="ghost" onClick={() => onRestore(it.id)} disabled={busy} className="min-h-8 px-2 text-[13px] md:min-h-8">Khôi phục</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onAdjust(it.id, 'gift')} disabled={busy} className="min-h-8 px-2 text-[13px] md:min-h-8">Tặng</Button>
            <Button variant="ghost" onClick={() => onAdjust(it.id, 'cancelled')} disabled={busy} className="min-h-8 px-2 text-[13px] text-danger hover:bg-danger-bg hover:text-danger md:min-h-8">Bỏ</Button>
          </>
        )}
      </span>
    </li>
  )
}

function OtherActions({ list, freeTables, otherSessions, busy, onReset, onAddTable, onMergeInto, onReleaseHost, onClearPick, picked }: PosBillPanelProps & { list: OpenTableSession[] }) {
  if (list.length > 1) {
    return picked.length > 0 ? <Button variant="ghost" onClick={onClearPick} className="mt-3 w-full">Bỏ chọn {picked.length} mâm</Button> : null
  }
  const s = list[0]
  return (
    <details className="mt-4 rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Thao tác khác</summary>
      <label className="mt-3 block text-[13px] text-muted" htmlFor="pos-bill-add-table">Thêm bàn trống vào mâm này</label>
      <div className="mt-1">
        <Select id="pos-bill-add-table" disabled={busy || freeTables.length === 0} defaultValue=""
          onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) onAddTable(s.session_id, v) }}>
          <option value="">— chọn bàn trống —</option>
          {freeTables.map((t) => <option key={t.id} value={t.id}>{t.table_number}</option>)}
        </Select>
      </div>
      <label className="mt-3 block text-[13px] text-muted" htmlFor="pos-bill-merge-into">Nhập bàn này vào một mâm khác (gộp cả đơn)</label>
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

function PaymentView({ title, list, total, busy, itemRow, onBack, onDismiss, onPay, onPrint }: {
  title: string
  list: OpenTableSession[]
  total: number
  busy: boolean
  itemRow: (it: SessionOrderItem) => ReactNode
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

  return (
    <Khung
      tieuDe="Thanh toán & đóng mâm"
      moTa={title}
      onDismiss={onDismiss}
      lead={<IconButton icon={<ArrowLeft />} label="Quay lại bill" onClick={onBack} />}
      footer={
        <>
          <Button variant="primary" size="touch" icon={<Banknote />} isLoading={busy} disabled={short} onClick={() => onPay(method)} className="w-full">
            Xác nhận đã nhận {dong(total)}
          </Button>
          <p className="mt-2 text-[13px] text-muted">Máy in lỗi vẫn thu tiền bình thường — in hoá đơn sau cũng được.</p>
        </>
      }
    >
      <div className="rounded-xl border border-border bg-background px-4 py-3">
        <p className="text-[13px] text-muted">Cần thu</p>
        <p className="text-3xl font-semibold text-foreground tabular">{dong(total)}</p>
        <p className="mt-0.5 text-[13px] text-muted">{list.length > 1 ? `Gộp ${list.length} mâm · đóng cả loạt sau khi thu` : 'Thu xong bàn tự trống'}</p>
      </div>

      <details className="mt-3 rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Món đã dùng ({items.length}) · tặng / bỏ món</summary>
        <ul className="mt-2 space-y-1.5">{items.map(itemRow)}</ul>
      </details>

      <div className="mt-4">
        <Tabs
          variant="segmented"
          label="Phương thức thu tiền"
          value={method}
          onValueChange={setMethod}
          items={[{ value: 'cash', label: 'Tiền mặt' }, { value: 'bank', label: 'Chuyển khoản' }]}
          className="w-full"
        />
      </div>

      {method === 'cash' ? (
        <div className="mt-3 space-y-3">
          <Field label="Tiền khách đưa" htmlFor="pos-cash-given" hint="Gõ số, dấu chấm tự thêm. Để trống nếu khách đưa vừa đủ">
            <Input
              id="pos-cash-given"
              inputMode="numeric"
              autoComplete="off"
              placeholder={total.toLocaleString('vi-VN')}
              value={givenText}
              onChange={(e) => setGivenText(formatVndInput(e.target.value))}
              className="text-lg tabular"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {cashSuggestions(total).map((v) => (
              <Button key={v} onClick={() => setGivenText(v.toLocaleString('vi-VN'))} className="min-h-9 tabular md:min-h-9">
                {v === total ? 'Vừa đủ' : dong(v)}
              </Button>
            ))}
          </div>
          {change.kind === 'ok' && (
            <p className="flex items-baseline justify-between rounded-lg bg-success-bg px-3 py-2 text-success">
              <span className="text-sm font-medium">Tiền thối lại</span>
              <span className="text-xl font-semibold tabular">{dong(change.change)}</span>
            </p>
          )}
          {change.kind === 'short' && (
            <p role="alert" className="rounded-lg bg-critical-bg px-3 py-2 text-sm font-medium text-critical tabular">
              Khách đưa còn thiếu {dong(change.missing)}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground">
          Cho khách quét mã QR của quán, <b className="font-semibold">nghe loa báo tiền về đủ {dong(total)}</b> rồi mới bấm xác nhận.
        </p>
      )}

      <Button variant="ghost" icon={<Printer />} onClick={onPrint} disabled={busy} className="mt-4 w-full">In hoá đơn</Button>
    </Khung>
  )
}

/**
 * Khung cột phải. Từ xl: cột 400px cạnh Timeline (nút X đưa về Việc cần xử lý).
 * Dưới xl: sheet đáy có nền mờ. Tổng + nút thu ở footer đứng yên, phần món cuộn.
 */
function Khung({ tieuDe, moTa, lead, top, footer, onDismiss, children }: {
  tieuDe: string
  moTa?: string
  lead?: ReactNode
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
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-modal xl:static xl:max-h-none xl:w-[400px] xl:shrink-0 xl:rounded-none xl:border-t-0 xl:border-l xl:shadow-none"
      >
        <header className="flex shrink-0 items-start gap-1 border-b border-border py-2.5 pr-2 pl-2">
          {lead ?? <span className="w-2" />}
          <div className="min-w-0 flex-1 py-1">
            <h2 className="truncate text-lg font-semibold text-foreground">{tieuDe}</h2>
            {moTa ? <p className="mt-0.5 truncate text-[13px] text-muted">{moTa}</p> : null}
          </div>
          <IconButton icon={<X />} label="Đóng bill" onClick={onDismiss} />
        </header>
        {top}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">{footer}</footer>
        ) : null}
      </aside>
    </>
  )
}
