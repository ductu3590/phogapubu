'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Check, Gift, Landmark, Printer } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/feedback'
import { ORDER_STATUS_TONE } from '@/components/ui/status'
import { formatVND, cn } from '@/lib/utils'
import { printInPlace } from '@/lib/print/print-in-place'
import { billInstrumentLabel, type BillRow } from '@/lib/bills-report'
import type { BillDetailOrder, SessionMove } from '@/lib/bill-detail'
import { collectSessionBill, getSessionMoves, loadBillDetail, redeemBillSpin, runBillOrderAction, type BillOrderAction } from '@/lib/actions/bill-detail'
import { getSessionsBill } from '@/lib/actions/table-session'
import ConfirmDialog from '../pos/confirm-dialog'
import { isAmountMismatch, runCollect } from '@/lib/collect-outcome'
import { paymentRows } from '@/lib/collect-payment'

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
  // Bước 2 của "Đã nhận tiền": hộp xác nhận + mã chống thu trùng của lần thu này.
  const [pendingCollect, setPendingCollect] = useState<
    { instrument: 'cash' | 'bank'; amount: number; requestId: string; text: string } | null
  >(null)
  const [collectError, setCollectError] = useState<string | null>(null)
  const [collectNotice, setCollectNotice] = useState<string | null>(null)

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

  // Lịch sử chuyển bàn: chỉ bill có phiên bàn mới gọi (đơn mang về/ship không có phiên). Lỗi thì bỏ qua êm —
  // khối này chỉ là thông tin phụ, không được che bill chính.
  // Lưu kèm khoá của bill đã tải: đổi bill thì kết quả của bill trước không bao giờ hiện nhầm dưới bill mới.
  const [movesLoaded, setMovesLoaded] = useState<{ key: string; moves: SessionMove[] }>({ key: '', moves: [] })
  const sessionKey = row?.sessionIds.join(',') ?? ''
  useEffect(() => {
    if (!sessionKey) return
    let alive = true
    getSessionMoves(sessionKey.split(',')).then(
      (res) => { if (alive && res.ok) setMovesLoaded({ key: sessionKey, moves: res.moves }) },
      () => {},
    )
    return () => { alive = false }
  }, [sessionKey])
  const shownMoves = sessionKey && movesLoaded.key === sessionKey ? movesLoaded.moves : []

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

  // Bàn trả sau: thu CẢ BÀN một lần → đóng bill (như POS → Thanh toán). Hai bước: (1) đọc bill để có số SAU giảm
  // giá rồi mở hộp xác nhận, (2) xác nhận → collect_table_bill. Xong thì dòng chuyển sang "Đã thanh toán" với key
  // khác → đóng ngăn kéo. requestId sinh ở bước 1 và giữ tới khi thu xong hoặc huỷ hộp: bấm lại sau lỗi / mất
  // mạng gửi lại đúng mã, server không ghi khoản thứ hai.
  const onCollect = async (instrument: 'cash' | 'bank') => {
    if (!row) return
    // Giảm giá đặt ở POS nằm trên phiên; server trừ nó lúc thu (mig 108) → hỏi và gửi đúng số SAU giảm,
    // không thì server từ chối vì lệch. Phiên hết hạn: server trả 0.
    setBusy(`collect:${instrument}`)
    let discount = 0
    try {
      const bill = await getSessionsBill(row.sessionIds)
      if (!bill.ok) { setError(bill.error); return }
      discount = bill.bill.grand_discount ?? 0
    } catch {
      setError('Lỗi kết nối. Thử lại sau.')
      return
    } finally {
      setBusy(null)
    }
    if (discount > row.amount) {
      setError('Giảm giá lớn hơn tiền hàng. Sửa giảm giá ở POS → Thanh toán rồi thu lại.')
      return
    }
    const due = row.amount - discount
    const text = discount > 0
      ? `Tạm tính ${formatVND(row.amount)}, đã trừ giảm giá ${formatVND(discount)}.`
      : ''
    setCollectError(null)
    setPendingCollect({ instrument, amount: due, requestId: crypto.randomUUID(), text })
  }

  const confirmCollect = async () => {
    if (!row || !pendingCollect) return
    const { instrument, amount, requestId } = pendingCollect
    setBusy(`collect:${instrument}`)
    setCollectError(null)
    // runCollect không ném. Lỗi khác / mất mạng: giữ hộp + giữ mã, bấm lại an toàn (lần lỗi không ghi gì).
    // Bill vừa đổi (số lệch): số trong hộp đã cũ → khoá nút xác nhận, bảo huỷ rồi bấm lại để đọc bill mới.
    const out = await runCollect(() => collectSessionBill(row.sessionIds, instrument, amount, requestId))
    setBusy(null)
    if (out.kind !== 'done') { setCollectError(out.error); return }
    setPendingCollect(null)
    router.refresh()
    // Đã thu từ trước (mất phản hồi / máy khác): GIỮ ngăn kéo mở để thu ngân đọc khoản ĐÃ GHI (có thể khác
    // phương tiện vừa chọn). Thu mới bình thường thì đóng ngăn kéo như cũ.
    if (out.message) { setCollectNotice(out.message); return }
    onClose()
  }

  const onOrderAction = (orderId: string, action: BillOrderAction) => {
    if (!window.confirm(CONFIRM_TEXT[action])) return
    void act(`${orderId}:${action}`, () => runBillOrderAction(orderId, action))
  }

  if (!row) return null
  const sessionPrint = row.sessionIds.length > 0 && row.kind !== 'cancelled'
  // Mig 112a: từng khoản + khách đưa + tiền thối của bill đã thu (bill thu trước 112a thì rỗng → ẩn khối).
  const paidRows = row.kind === 'paid'
    ? paymentRows({ payments: row.payments, cashGiven: row.cashGiven, changeAmount: row.changeAmount })
    : []
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
          ? `Thu lúc ${time(row.at)}${billInstrumentLabel(row) ? ` · ${billInstrumentLabel(row)}` : ''}${row.receivedByName ? ` · ${row.receivedByName}` : ''}`
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
          <div className="rounded-xl border border-warning-border bg-warning-bg p-3">
            <p className="text-[13px] text-warning">
              {row.expired ? 'Bàn đã hết hạn nhưng còn nợ. ' : ''}Thu <strong>cả bàn một lần</strong> — thu xong bill đóng lại, mọi lượt chuyển Hoàn tất (giống POS → Thanh toán).
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button variant="primary" icon={<Banknote />} isLoading={busy === 'collect:cash'} disabled={busy !== null} onClick={() => void onCollect('cash')}>
                Đã nhận tiền mặt
              </Button>
              <Button icon={<Landmark />} isLoading={busy === 'collect:bank'} disabled={busy !== null} onClick={() => void onCollect('bank')}>
                Đã nhận chuyển khoản
              </Button>
            </div>
          </div>
        )}
        {paidRows.length > 0 && (
          <section className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <h3 className="text-[13px] font-semibold text-foreground">Các khoản đã thu</h3>
            <ul className="mt-1 space-y-0.5">
              {paidRows.map((p) => (
                <li key={p.label} className="flex justify-between text-[13px] text-muted">
                  <span>{p.label}</span>
                  <span className="font-semibold text-foreground tabular">{formatVND(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {shownMoves.length > 0 && (
          <section className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <h3 className="text-[13px] font-semibold text-foreground">Chuyển bàn</h3>
            <ul className="mt-1 space-y-0.5">
              {shownMoves.map((m, i) => (
                <li key={`${m.moved_at}-${i}`} className="text-[13px] text-muted">
                  <span className="tabular">{time(m.moved_at)}</span> · {m.from_table} → {m.to_table}{m.moved_by_name ? ` · ${m.moved_by_name}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}
        {collectNotice && <p role="status" className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-[13px] text-warning">{collectNotice}</p>}
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
      <ConfirmDialog
        open={pendingCollect !== null}
        title={pendingCollect
          ? `Đã nhận ${formatVND(pendingCollect.amount)} bằng ${pendingCollect.instrument === 'cash' ? 'tiền mặt' : 'chuyển khoản'}?`
          : ''}
        description={pendingCollect && (
          <>
            {row.tableLabel}. {pendingCollect.text} Bill sẽ đóng lại, mọi lượt chuyển Hoàn tất.
            {collectError && (
              <span role="alert" className="mt-2 block rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[13px] text-critical">
                {collectError}
                {isAmountMismatch(collectError) && <strong className="mt-1 block font-semibold">Huỷ rồi bấm lại Đã nhận tiền</strong>}
              </span>
            )}
          </>
        )}
        confirmLabel="Đã nhận tiền"
        confirmDisabled={isAmountMismatch(collectError)}
        busy={busy?.startsWith('collect:') ?? false}
        onConfirm={() => void confirmCollect()}
        onCancel={() => { setPendingCollect(null); setCollectError(null) }}
      />
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
        {o.billDiscount > 0 && (
          <p className="flex justify-between text-sm text-success">
            <span>Giảm giá bill</span>
            <span className="tabular">−{formatVND(o.billDiscount)}</span>
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
