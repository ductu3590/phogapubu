'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Gift, Printer } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/feedback'
import { ORDER_STATUS_TONE } from '@/components/ui/status'
import { formatVND, cn } from '@/lib/utils'
import { instrumentLabel } from '@/lib/daily-report'
import { printInPlace } from '@/lib/print/print-in-place'
import type { BillRow } from '@/lib/bills-report'
import type { BillDetailOrder } from '@/lib/bill-detail'
import { loadBillDetail, redeemBillSpin, runBillOrderAction, type BillOrderAction } from '@/lib/actions/bill-detail'

const time = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : '—'

const CONFIRM_TEXT: Record<BillOrderAction, string> = {
  confirm: 'Xác nhận ĐÃ NHẬN TIỀN cho lượt này?',
  complete: 'Hoàn tất lượt này? Nếu chưa thu tiền mặt/chuyển khoản, hệ thống sẽ ghi nhận đã nhận tiền luôn.',
  cancel: 'Huỷ lượt này? Đơn chưa có tiền sẽ chuyển sang "Đã huỷ".',
}

// Ngăn kéo chi tiết một dòng của trang Hoá đơn & Báo cáo (A04-2). Mỗi lượt gọi món = một khối, kèm đúng các nút
// trang Đơn hàng cũ có (Đã nhận tiền · Hoàn tất · Huỷ đơn · Đã đổi thưởng). Chỉ chủ quán thấy nút (`canManage`).
export default function BillDrawer({ row, canManage, onClose }: { row: BillRow | null; canManage: boolean; onClose: () => void }) {
  const router = useRouter()
  const [loaded, setLoaded] = useState<BillDetailOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  // Cha dựng lại component theo key của dòng → state tự về ban đầu khi đổi dòng. Ở đây chỉ tải khi danh sách
  // đơn đổi hoặc sau một thao tác (không theo object `row`: router.refresh dựng lại object mỗi lần → tải thừa, nháy).
  const orderKey = row?.orderIds.join(',') ?? ''
  useEffect(() => {
    if (!orderKey) return
    let alive = true
    loadBillDetail(orderKey.split(',')).then(
      (res) => {
        if (!alive) return
        if (res.ok) { setLoaded(res.orders); setError(null) } else setError(res.error)
      },
      () => { if (alive) setError('Lỗi kết nối. Không tải được hoá đơn.') },
    )
    return () => { alive = false }
  }, [orderKey, reloadTick])
  const orders = orderKey ? loaded : []

  const act = async (key: string, run: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key)
    try {
      const res = await run()
      if (!res.ok) { setError(res.error ?? 'Không thực hiện được'); return }
      setReloadTick((t) => t + 1)
      router.refresh()
    } catch {
      setError('Lỗi kết nối. Kiểm tra lại trạng thái đơn rồi thử lại.')
    } finally {
      setBusy(null)
    }
  }

  const onOrderAction = (orderId: string, action: BillOrderAction) => {
    if (!window.confirm(CONFIRM_TEXT[action])) return
    void act(`${orderId}:${action}`, () => runBillOrderAction(orderId, action))
  }

  if (!row) return null
  const sessionPrint = row.sessionIds.length > 0 && row.kind !== 'cancelled'
  const amountLabel = row.kind === 'paid' ? 'Đã thu' : row.kind === 'waiting' ? 'Tạm tính' : 'Giá trị đơn huỷ'

  return (
    <Dialog
      open
      onClose={onClose}
      placement="side"
      className="md:w-[520px]"
      title={<span className="font-mono">{row.code} <span className="font-sans font-semibold">· {row.tableLabel}</span></span>}
      description={
        row.kind === 'paid'
          ? `Thu lúc ${time(row.at)}${row.instrument ? ` · ${instrumentLabel(row.instrument)}` : ''}${row.receivedByName ? ` · ${row.receivedByName}` : ''}`
          : row.kind === 'waiting'
            ? `${row.expired ? 'Hết hạn · còn nợ' : 'Chờ thu'} · vào lúc ${time(row.startedAt)}`
            : `${row.rejected ? 'Từ chối' : 'Đã huỷ'} lúc ${time(row.at)}${row.reasonText ? ` · ${row.reasonText}` : ''}`
      }
      footer={
        <>
          {sessionPrint && (
            <Button icon={<Printer />} onClick={() => printInPlace(`/print/bill?ids=${row.sessionIds.join(',')}`)}>
              {row.kind === 'paid' ? 'In lại hoá đơn' : 'In tạm tính'}
            </Button>
          )}
          <div className="ml-auto text-right">
            <p className="text-[12px] text-muted">{amountLabel}</p>
            <p className={cn('text-lg font-bold tabular', row.kind === 'cancelled' ? 'text-muted line-through' : 'text-foreground')}>{formatVND(row.amount)}</p>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        {(row.customerName || row.partySize) && (
          <p className="text-sm text-foreground">
            Khách: <strong className="font-medium">{row.customerName ?? '—'}</strong>
            {row.partySize ? <span className="text-muted"> · {row.partySize} khách</span> : null}
          </p>
        )}
        {row.kind === 'waiting' && row.sessionIds.length > 0 && (
          <p className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-[13px] text-warning">
            Bàn trả sau: thu tiền cả bàn ở <strong>POS → Thanh toán</strong>. Nút trong từng lượt bên dưới chỉ tác động lên lượt đó.
          </p>
        )}
        {error && <p role="alert" className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[13px] text-critical">{error}</p>}

        {orders === null ? (
          <div className="flex justify-center py-10"><Spinner label="Đang tải hoá đơn" /></div>
        ) : orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Bàn chưa gọi món nào.</p>
        ) : (
          orders.map((o, idx) => (
            <OrderBlock key={o.id} o={o} index={orders.length > 1 ? idx + 1 : null} canManage={canManage} busy={busy}
              onAction={(a) => onOrderAction(o.id, a)}
              onRedeem={() => o.spin && void act(`${o.id}:redeem`, () => redeemBillSpin(o.spin!.id))} />
          ))
        )}
      </div>
    </Dialog>
  )
}

function OrderBlock({ o, index, canManage, busy, onAction, onRedeem }: {
  o: BillDetailOrder
  index: number | null
  canManage: boolean
  busy: string | null
  onAction: (a: BillOrderAction) => void
  onRedeem: () => void
}) {
  const showActions = canManage && (o.actions.confirm || o.actions.complete || o.actions.cancel)
  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">{index ? `Lượt ${index}` : 'Đơn'}</span>
        <span className="font-mono text-[12px] text-muted">{o.code}</span>
        <span className="text-[12px] text-muted tabular">· {time(o.createdAt)}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}>{o.statusLabel}</Badge>
          {/* Đơn đã huỷ không thu tiền — nhãn "chưa thu" ở đây dễ đọc thành "còn nợ". */}
          {o.status !== 'cancelled' && <Badge tone={o.payment.tone === 'received' ? 'success' : 'warning'}>{o.payment.label}</Badge>}
        </span>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        {o.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {o.tags.map((t) => (
              <span key={t.label} className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium', t.tone === 'source' ? 'bg-info-bg text-info' : 'bg-background text-muted')}>{t.label}</span>
            ))}
          </div>
        )}
        {(o.customerName || o.customerPhone || o.deliveryAddress) && (
          <p className="text-[13px] text-muted">
            {[o.customerName, o.customerPhone, o.deliveryAddress].filter(Boolean).join(' · ')}
          </p>
        )}

        <ul className="divide-y divide-border/60">
          {o.items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 py-1.5 text-sm">
              <div className="min-w-0">
                <p className={cn('text-foreground', it.voidType === 'cancelled' && 'text-muted line-through')}>
                  <span className="font-medium tabular">{it.quantity}×</span> {it.name}
                </p>
                {it.toppings.length > 0 && <p className="text-[12px] text-muted">+ {it.toppings.join(', ')}</p>}
                {it.note && <p className="text-[12px] italic text-muted">Ghi chú: {it.note}</p>}
                {it.voidType && (
                  <p className={cn('text-[12px]', it.voidType === 'gift' ? 'text-violet-700' : 'text-critical')}>
                    {it.voidType === 'gift' ? 'Tặng' : 'Bỏ'}{it.voidReason ? ` — ${it.voidReason}` : ''}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-right tabular text-foreground">{formatVND(it.lineTotal)}</span>
            </li>
          ))}
        </ul>

        {o.discount > 0 && (
          <p className="flex justify-between text-sm text-success">
            <span>Giảm giá{o.voucherCode ? ` (mã ${o.voucherCode})` : ''}</span>
            <span className="tabular">−{formatVND(o.discount)}</span>
          </p>
        )}
        <p className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
          <span>Cộng lượt</span><span className="tabular">{formatVND(o.total)}</span>
        </p>
        {o.note && <p className="text-[13px] italic text-muted">Ghi chú đơn: {o.note}</p>}
        {o.rejected && <p className="text-[13px] text-critical">Bị từ chối{o.rejectReason ? `: ${o.rejectReason}` : ''}</p>}

        {o.spin && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Gift className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="flex-1 text-sm text-foreground">{o.spin.label}</span>
            {o.spin.status === 'redeemed' && <span className="text-[12px] font-medium text-success">✓ Đã đổi</span>}
            {canManage && o.actions.redeem && (
              <Button variant="primary" isLoading={busy === `${o.id}:redeem`} disabled={busy !== null} onClick={onRedeem}>Đã đổi thưởng</Button>
            )}
          </div>
        )}

        {showActions && (
          <div className="flex flex-wrap gap-2 pt-1">
            {o.actions.confirm && (
              <Button icon={<Check />} isLoading={busy === `${o.id}:confirm`} disabled={busy !== null} onClick={() => onAction('confirm')}>Đã nhận tiền</Button>
            )}
            {o.actions.complete && (
              <Button variant="primary" isLoading={busy === `${o.id}:complete`} disabled={busy !== null} onClick={() => onAction('complete')}>Hoàn tất</Button>
            )}
            {o.actions.cancel && (
              <Button variant="danger" isLoading={busy === `${o.id}:cancel`} disabled={busy !== null} onClick={() => onAction('cancel')}>Huỷ đơn</Button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
