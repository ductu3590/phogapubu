'use client'

import { useState } from 'react'
import { Banknote, BellRing, ChevronDown, ChevronUp, Landmark, Layers, Plus, Printer, X } from 'lucide-react'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { sessionTimeoutMessage } from '@/lib/session-timeout'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Banner, EmptyState } from '@/components/ui/feedback'
import { Select } from '@/components/ui/field'
import { cn } from '@/lib/utils'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'
const gio = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

const nguon = (source: string | null | undefined) =>
  source === 'reservation_preorder' ? 'món đặt trước' : source === 'staff' ? 'nhân viên' : source === 'pos' ? 'ghi tay' : 'khách'

export default function BillPanel({
  selected,
  picked,
  freeTables,
  otherSessions,
  pickedFreeTables,
  busy,
  onPay,
  onPrint,
  onReset,
  onCreateTray,
  onAddTable,
  onMergeInto,
  onReleaseHost,
  onConfirmOrder,
  onRejectOrder,
  onPrintOrder,
  onOpenManualOrder,
  onVoidOrderItem,
  onRestoreOrderItem,
  onClearPick,
  onDismiss,
}: {
  /** Phiên đang mở bill (bấm 1 bàn có khách) */
  selected: OpenTableSession | null
  /** Các phiên đã tick để gộp bill */
  picked: OpenTableSession[]
  /** Bàn TRỐNG — để thêm vào mâm đang chọn */
  freeTables: { id: string; table_number: string }[]
  /** Các phiên đang mở KHÁC phiên đang chọn — để nhập phiên lẻ vào mâm */
  otherSessions: OpenTableSession[]
  /** Số bàn trống đang tick — để ghép mâm */
  pickedFreeTables: number
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
  /** Màn hẹp: đóng sheet bill (bỏ chọn bàn). Desktop panel luôn đứng cạnh sơ đồ nên không cần. */
  onDismiss?: () => void
}) {
  // Đơn đang mở bảng món để soát trước khi xác nhận. null = chưa mở đơn nào.
  const [xemDon, setXemDon] = useState<string | null>(null)

  const list = picked.length > 0 ? picked : selected ? [selected] : []
  const tong = list.reduce((n, s) => n + s.total, 0)
  const chuaXong = list.reduce((n, s) => n + s.cooking_count, 0)
  // Đơn `pos` chỉ là ghi bổ sung đã phục vụ: không qua xác nhận, không in phiếu bếp.
  const donCho = list.flatMap((s) => s.orders.filter((o) => o.status === 'pending' && o.order_source !== 'pos' && o.order_source !== 'reservation_preorder'))

  const dieuChinh = (itemId: string, type: 'cancelled' | 'gift') => {
    const label = type === 'cancelled' ? 'bỏ món này' : 'tặng món này'
    if (!confirm(`Xác nhận ${label}? Tổng bill sẽ được tính lại.`)) return
    const reason = prompt(`Lý do ${label} (có thể để trống):`) ?? undefined
    onVoidOrderItem(itemId, type, reason)
  }

  if (pickedFreeTables >= 2) {
    return (
      <Khung tieuDe={`Đã chọn ${pickedFreeTables} bàn trống`} onDismiss={onDismiss ?? onClearPick}>
        <div className="space-y-2">
          <Button variant="primary" size="touch" icon={<Layers />} onClick={onCreateTray} disabled={busy} className="w-full">
            Ghép thành một mâm
          </Button>
          <Button variant="ghost" onClick={onClearPick} className="w-full">
            Bỏ chọn
          </Button>
        </div>
      </Khung>
    )
  }

  if (list.length === 0) {
    return (
      <Khung tieuDe="Chưa chọn bàn" emptyOnMobile>
        <div className="space-y-1.5 text-sm text-muted">
          <p>Bấm một bàn có khách để mở bill và thu tiền.</p>
          <p>Bấm nhiều bàn <b className="font-semibold text-foreground">trống</b> để ghép mâm.</p>
          <p>Ctrl/Cmd + bấm nhiều mâm để gộp bill.</p>
          <p className="pt-3 tabular">{freeTables.length} bàn đang trống.</p>
        </div>
      </Khung>
    )
  }

  return (
    <Khung
      tieuDe={list.length > 1 ? `Gộp bill ${list.length} mâm` : list[0].table_number}
      moTa={
        list.length === 1
          ? `Mở lúc ${gio(list[0].opened_at)} · ${list[0].order_count} đơn${list[0].opened_by === 'staff' ? ' · nhân viên mở' : ''}`
          : undefined
      }
      onDismiss={onDismiss}
      footer={
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Tổng</span>
            <span className="text-2xl font-semibold text-foreground tabular">{dong(tong)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="primary" size="touch" icon={<Banknote />} onClick={() => onPay(list, 'cash')} disabled={busy}>
              Tiền mặt
            </Button>
            <Button size="touch" icon={<Landmark />} onClick={() => onPay(list, 'bank')} disabled={busy}>
              Chuyển khoản
            </Button>
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Chuyển khoản: cho khách quét mã QR của quán, nghe loa báo tiền về rồi mới bấm.
          </p>
        </>
      }
    >
      {list.length === 1 && list[0].needs_review && (
        <Banner tone="warning" title={`${sessionTimeoutMessage(list[0].idle_timeout_minutes)} nên bàn đã mở khoá`} className="mb-3">
          Còn <b className="font-semibold tabular">{dong(list[0].unpaid_total)} chưa thu</b>.
        </Banner>
      )}

      {donCho.length > 0 && (
        <section className="mb-4 rounded-xl border border-warning-border bg-warning-bg p-3" aria-label="Đơn chờ xác nhận">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <BellRing className="size-4" aria-hidden />
            {donCho.length} đơn chờ xác nhận
          </p>
          <ul className="mt-2 space-y-2">
            {donCho.map((o) => {
              const open = xemDon === o.id
              return (
                <li key={o.id} className="rounded-lg border border-border bg-surface p-3">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setXemDon(open ? null : o.id)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 text-left text-sm"
                  >
                    <span className="font-medium text-foreground">
                      {gio(o.created_at)} · {o.items.length} món · {o.order_source === 'staff' ? 'nhân viên' : 'khách'}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-muted tabular">
                      {dong(o.total_amount)}
                      {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                    </span>
                  </button>

                  {open && (
                    <ul className="mt-2 space-y-1 border-t border-border pt-2">
                      {o.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-2 text-sm text-foreground">
                          <span className="min-w-0">{it.name}</span>
                          <span className="shrink-0 font-medium tabular">×{it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                    <Button variant="danger" onClick={() => onRejectOrder(o.id)} disabled={busy}>
                      Từ chối
                    </Button>
                    {open ? (
                      <Button variant="primary" icon={<Printer />} onClick={() => onConfirmOrder(o.id)} disabled={busy}>
                        Xác nhận &amp; in 2 liên
                      </Button>
                    ) : (
                      <Button onClick={() => setXemDon(o.id)}>Xem món để xác nhận</Button>
                    )}
                  </div>
                  {open && <p className="mt-1.5 text-[13px] text-muted">In ra: 1 phiếu cho bếp, 1 phiếu đặt ở bàn khách.</p>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {list.length === 1 && (
        <Button
          icon={<Plus />}
          onClick={() => onOpenManualOrder(list[0].session_id)}
          disabled={busy}
          className="mb-4 w-full border-dashed"
        >
          Thêm món tay <span className="font-normal text-muted">· không báo bếp</span>
        </Button>
      )}

      <ul className="divide-y divide-border border-y border-border">
        {list.flatMap((s) =>
          s.orders.map((o) => (
            <li key={o.id} className="py-3">
              <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
                <span className="flex flex-wrap items-center gap-1.5">
                  {gio(o.created_at)} · {nguon(o.order_source)}
                  {o.status === 'pending' && <Badge tone="warning">chờ xác nhận</Badge>}
                  {o.status === 'cancelled' && <Badge tone="critical">đã từ chối</Badge>}
                </span>
                <span className="flex shrink-0 items-center gap-1 tabular">
                  {dong(o.total_amount)}
                  {o.payment_received_at && <span className="text-success" aria-label="đã thu">✓</span>}
                  {o.order_source !== 'reservation_preorder' && (
                    <IconButton
                      icon={<Printer />}
                      label="In lại 2 liên của đơn này"
                      onClick={() => onPrintOrder(o.id)}
                      className="size-8 md:size-8"
                    />
                  )}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {o.items.map((it) => {
                  const cancelled = it.void_type === 'cancelled'
                  const gift = it.void_type === 'gift'
                  const toppingText = it.toppings?.map((topping) => topping.name).join(', ')
                  return (
                    <li key={it.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className={cn('min-w-0', cancelled ? 'text-critical line-through' : 'text-foreground')}>
                        {it.name} <span className="tabular">×{it.quantity}</span>
                        {toppingText && <span className="text-[13px] text-muted"> + {toppingText}</span>}
                        {cancelled && <Badge tone="critical" className="ml-1.5 no-underline">Khách bỏ</Badge>}
                        {gift && <Badge tone="neutral" className="ml-1.5">Tặng · 0đ</Badge>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {it.void_type ? (
                          <Button variant="ghost" onClick={() => onRestoreOrderItem(it.id)} disabled={busy} className="min-h-8 px-2 text-[13px] md:min-h-8">
                            Khôi phục
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" onClick={() => dieuChinh(it.id, 'cancelled')} disabled={busy} className="min-h-8 px-2 text-[13px] text-danger hover:bg-danger-bg hover:text-danger md:min-h-8">
                              Bỏ
                            </Button>
                            <Button variant="ghost" onClick={() => dieuChinh(it.id, 'gift')} disabled={busy} className="min-h-8 px-2 text-[13px] md:min-h-8">
                              Tặng
                            </Button>
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
                {o.items.length === 0 && <li className="text-sm text-muted">Không có món</li>}
              </ul>
            </li>
          )),
        )}
      </ul>
      {list.every((s) => s.orders.length === 0) && <EmptyState>Mâm này chưa gọi món nào.</EmptyState>}

      {chuaXong > 0 && (
        <Banner tone="warning" title={`Còn ${chuaXong} món chưa xong`} className="mt-3">
          Vẫn thu tiền và đóng bàn? Món đang làm vẫn nằm ở màn bếp.
        </Banner>
      )}

      <div className="mt-4 flex gap-2">
        <Button icon={<Printer />} onClick={() => onPrint(list)} disabled={busy} className="flex-1">
          In bill
        </Button>
        {list.length === 1 && (
          <Button
            variant="danger"
            onClick={() => onReset(list[0])}
            disabled={busy}
            title="Bỏ bàn: huỷ đơn chưa nấu và chưa thu tiền, đóng phiên"
          >
            Bỏ bàn
          </Button>
        )}
      </div>

      {list.length === 1 && (
        <details className="mt-4 rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">Thao tác khác</summary>

          <label className="mt-3 block text-[13px] text-muted" htmlFor="bill-add-table">Thêm bàn trống vào mâm này</label>
          <div className="mt-1">
            <Select
              id="bill-add-table"
              disabled={busy || freeTables.length === 0}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value
                e.target.value = ''
                if (v) onAddTable(list[0].session_id, v)
              }}
            >
              <option value="">— chọn bàn trống —</option>
              {freeTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.table_number}
                </option>
              ))}
            </Select>
          </div>

          <label className="mt-3 block text-[13px] text-muted" htmlFor="bill-merge-into">
            Nhập bàn này vào một mâm khác (gộp cả đơn)
          </label>
          <div className="mt-1">
            <Select
              id="bill-merge-into"
              disabled={busy || otherSessions.length === 0}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value
                e.target.value = ''
                if (v) onMergeInto(list[0].session_id, v)
              }}
            >
              <option value="">— chọn mâm đích —</option>
              {otherSessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.table_number}
                </option>
              ))}
            </Select>
          </div>

          <Button onClick={() => onReleaseHost(list[0].session_id)} disabled={busy} className="mt-3 w-full">
            Nhả quyền gọi món (khách hết pin / đổi máy)
          </Button>
        </details>
      )}

      {picked.length > 0 && (
        <Button variant="ghost" onClick={onClearPick} className="mt-2 w-full">
          Bỏ chọn {picked.length} mâm
        </Button>
      )}
    </Khung>
  )
}

/**
 * Khung panel bill.
 * - Từ `xl` (1280px): cột 400px đứng cạnh sơ đồ. Dưới đó sidebar + bill 400px chỉ chừa ~380px cho sơ đồ.
 * - Dưới `xl`: sheet trượt từ dưới, chỉ hiện khi đã chọn bàn (`emptyOnMobile` = ẩn hẳn khi trống).
 * Tổng tiền + nút thu ở `footer` đứng yên, phần món cuộn — nút thu không bao giờ bị đẩy khỏi màn.
 */
function Khung({
  tieuDe,
  moTa,
  footer,
  onDismiss,
  emptyOnMobile = false,
  children,
}: {
  tieuDe: string
  moTa?: string
  footer?: React.ReactNode
  onDismiss?: () => void
  emptyOnMobile?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      {!emptyOnMobile && onDismiss ? (
        <button type="button" aria-label="Đóng bill" onClick={onDismiss} className="fixed inset-0 z-30 bg-foreground/40 xl:hidden" />
      ) : null}
      <aside
        aria-label="Bill"
        className={cn(
          'flex-col border-border bg-surface',
          emptyOnMobile
            ? 'hidden xl:flex'
            : 'fixed inset-x-0 bottom-0 z-40 flex max-h-[88dvh] rounded-t-2xl border-t shadow-modal xl:static xl:max-h-none xl:rounded-none xl:border-t-0 xl:shadow-none',
          'xl:w-[400px] xl:shrink-0 xl:border-l',
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border py-3 pr-2 pl-4 md:pl-5">
          <div className="min-w-0 py-1">
            <h2 className="truncate text-lg font-semibold text-foreground">{tieuDe}</h2>
            {moTa ? <p className="mt-0.5 text-[13px] text-muted">{moTa}</p> : null}
          </div>
          {onDismiss && !emptyOnMobile ? (
            <IconButton icon={<X />} label="Đóng bill" onClick={onDismiss} className="xl:hidden" />
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">{children}</div>
        {footer ? (
          <footer className="shrink-0 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">{footer}</footer>
        ) : null}
      </aside>
    </>
  )
}
