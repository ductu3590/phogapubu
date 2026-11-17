'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandCoins, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ErrorState, Spinner } from '@/components/ui/feedback'
import { loadSupplierDetail, setSupplierActive, voidSupplierPayment } from '@/lib/actions/suppliers'
import { shiftDateTimeLabel } from '@/lib/cash-shift'
import { debtDateLabel } from '@/lib/debts'
import {
  selectedOutstanding, supplierDocHref, SUPPLIER_VOID_REASON_MAX,
  type SupplierDetail, type SupplierDoc, type SupplierPaymentRow, type SupplierSummary,
} from '@/lib/suppliers'
import { cn, formatVND } from '@/lib/utils'
import ConfirmDialog from '../pos/confirm-dialog'
import SupplierFormDialog from './supplier-form-dialog'
import SupplierPayDialog from './supplier-pay-dialog'

// Ngăn kéo một nhà cung cấp (mig 145). Đọc chi tiết MỘT lần khi mở và sau mỗi thao tác (không poll). Mọi số tiền của
// server. Tích chọn phiếu còn nợ ngay trên dòng → thanh dính đáy "Trả các phiếu đã chọn" → hộp trả nợ điền sẵn số tiền.
// Chỉ chủ quán + quản lý mở được ngăn kéo này (tab NCC chỉ hiện cho họ).

const METHOD_LABEL = { cash: 'Tiền mặt', bank: 'Chuyển khoản' } as const

function DocLine({ d, checked, busy, onToggle }: { d: SupplierDoc; checked: boolean | null; busy: boolean; onToggle: (id: string) => void }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {checked !== null ? (
        <input type="checkbox" aria-label={`Chọn ${d.docNo}`} checked={checked} disabled={busy} onChange={() => onToggle(d.id)}
          className="mt-1 size-5 shrink-0 cursor-pointer accent-orange-600" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0">
            <a href={supplierDocHref(d.id)} className="tabular font-semibold text-primary hover:underline">{d.docNo}</a>
            <span className="tabular text-muted"> · {debtDateLabel(d.docDate)}</span>
          </span>
          <span className={cn('tabular shrink-0 font-bold', d.outstanding > 0 ? 'text-orange-700' : 'text-muted')}>
            {formatVND(d.outstanding)}
          </span>
        </div>
        <div className="tabular mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
          <span>Tổng {formatVND(d.totalAmount)}</span>
          <span>Đã trả {formatVND(d.paidAmount)}</span>
        </div>
      </div>
    </li>
  )
}

function PaymentLine({ p, busy, onVoid }: { p: SupplierPaymentRow; busy: boolean; onVoid: (p: SupplierPaymentRow) => void }) {
  const voided = p.voidedAt !== null
  return (
    <li className={cn('py-2', voided && 'text-muted')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('min-w-0 text-sm', voided && 'line-through')}>
          {shiftDateTimeLabel(p.createdAt)} · {METHOD_LABEL[p.method]}{p.createdByName ? ` · ${p.createdByName}` : ''}
        </span>
        <span className={cn('tabular shrink-0 font-semibold', voided && 'line-through')}>{formatVND(p.amount)}</span>
      </div>
      <p className={cn('tabular text-[13px]', voided && 'line-through')}>{p.allocations.map((a) => a.docNo).join(', ')}</p>
      {p.note ? <p className={cn('text-[13px]', voided && 'line-through')}>{p.note}</p> : null}
      {voided ? (
        <p className="text-[13px] text-red-700">Đã huỷ{p.voidedByName ? ` (${p.voidedByName})` : ''}: {p.voidReason}</p>
      ) : (
        <div className="mt-1 text-right">
          <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => onVoid(p)}>Huỷ</Button>
        </div>
      )}
    </li>
  )
}

/** Thân ngăn kéo (thuần props — test vẽ tĩnh được). selected = các phiếu còn nợ đang tích. */
export function SupplierDrawerBody({ detail, selected, busy, onToggle, onToggleAll, onPaySelected, onPay, onVoid, onEdit, onToggleActive }: {
  detail: SupplierDetail
  selected: string[]
  busy: boolean
  onToggle: (id: string) => void
  onToggleAll: () => void
  onPaySelected: () => void
  onPay: () => void
  onVoid: (p: SupplierPaymentRow) => void
  onEdit: () => void
  onToggleActive: () => void
}) {
  const s = detail.supplier
  const open = detail.documents.filter((d) => d.outstanding > 0)
  const paid = detail.documents.filter((d) => d.outstanding <= 0)
  const allTicked = open.length > 0 && open.every((d) => selected.includes(d.id))
  const pickedTotal = selectedOutstanding(open, selected)
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background p-3">
        <p className="text-sm text-muted">
          {s.phone ?? 'Chưa có SĐT'}
          {s.isActive ? null : <Badge className="ml-2">Đã ngừng</Badge>}
        </p>
        {s.note ? <p className="mt-1 text-sm">{s.note}</p> : null}
        <p className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">Đang nợ</span>
          <span className="tabular text-2xl font-bold text-orange-700">{formatVND(s.outstanding)}</span>
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {s.outstanding > 0 ? <Button variant="primary" icon={<HandCoins />} disabled={busy} onClick={onPay}>Trả nợ</Button> : null}
        <Button icon={<Pencil />} disabled={busy} onClick={onEdit}>Sửa NCC</Button>
        <Button disabled={busy} onClick={onToggleActive}>{s.isActive ? 'Ngừng theo dõi' : 'Dùng lại'}</Button>
      </div>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold tracking-wide text-slate-700 uppercase">Phiếu còn nợ ({open.length})</h3>
          {open.length > 0 ? (
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={allTicked} disabled={busy} onChange={onToggleAll} className="size-5 accent-orange-600" />
              Chọn tất cả
            </label>
          ) : null}
        </div>
        {open.length === 0 ? <p className="py-2 text-sm text-muted">Không còn phiếu nợ.</p> : (
          <ul className="divide-y divide-border">
            {open.map((d) => <DocLine key={d.id} d={d} checked={selected.includes(d.id)} busy={busy} onToggle={onToggle} />)}
          </ul>
        )}
        {selected.length > 0 ? (
          // Thanh dính đáy ngăn kéo: chỉ hiện khi có phiếu được tích.
          <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 shadow-sm">
            <span className="tabular text-sm font-semibold text-orange-900">
              Đã chọn {selected.length} phiếu · {formatVND(pickedTotal)}
            </span>
            <Button variant="primary" icon={<HandCoins />} disabled={busy} onClick={onPaySelected}>Trả các phiếu đã chọn</Button>
          </div>
        ) : null}
        {paid.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-semibold text-muted">Đã trả hết ({paid.length})</summary>
            <ul className="divide-y divide-border">
              {paid.map((d) => <DocLine key={d.id} d={d} checked={null} busy={busy} onToggle={onToggle} />)}
            </ul>
          </details>
        ) : null}
      </section>

      <section>
        <h3 className="text-[13px] font-bold tracking-wide text-slate-700 uppercase">Lịch sử trả nợ</h3>
        {detail.payments.length === 0 ? <p className="py-2 text-sm text-muted">Chưa có lần trả nào.</p> : (
          <ul className="divide-y divide-border">
            {detail.payments.map((p) => <PaymentLine key={p.id} p={p} busy={busy} onVoid={onVoid} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

export default function SupplierDrawer({ supplier, onClose }: { supplier: SupplierSummary; onClose: () => void }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  // Hộp trả nợ: undefined = đóng; null = mọi phiếu (nút Trả nợ); mảng = các phiếu đã tích.
  const [paying, setPaying] = useState<string[] | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [voidTarget, setVoidTarget] = useState<SupplierPaymentRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Đọc một lần khi mở và sau mỗi thao tác (reloadTick). Cha dựng lại theo key = id NCC.
  useEffect(() => {
    let alive = true
    loadSupplierDetail(supplier.id).then(
      (res) => {
        if (!alive) return
        if (res.ok) {
          setDetail(res.detail)
          setError(null)
          // Phiếu đã hết nợ / không còn sau khi tải lại thì bỏ tích.
          const openIds = new Set(res.detail.documents.filter((d) => d.outstanding > 0).map((d) => d.id))
          setSelected((cur) => cur.filter((id) => openIds.has(id)))
        } else setError(res.error)
      },
      () => { if (alive) setError('Lỗi kết nối. Không tải được nhà cung cấp.') },
    )
    return () => { alive = false }
  }, [supplier.id, reloadTick])

  const afterWrite = () => {
    setReloadTick((t) => t + 1)
    router.refresh()
  }

  const run = async (op: () => Promise<{ ok: boolean; error?: string }>, done: () => void) => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await op()
      if (!res.ok) { setActionError(res.error ?? 'Không thực hiện được'); return }
      done()
      afterWrite()
    } catch {
      setActionError('Lỗi kết nối. Thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const shown = detail ?? { supplier, documents: [], payments: [] }
  const openIds = shown.documents.filter((d) => d.outstanding > 0).map((d) => d.id)

  return (
    <>
      <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} placement="side" className="md:w-[520px]"
        title={supplier.name} description="Nhà cung cấp">
        {notice ? <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}
        {error ? (
          <ErrorState title="Không tải được nhà cung cấp" reason={error} onRetry={() => setReloadTick((t) => t + 1)} />
        ) : (
          <>
            {detail ? null : <Spinner label="Đang tải" className="mb-3" />}
            <SupplierDrawerBody
              detail={shown}
              selected={selected}
              busy={busy || detail === null}
              onToggle={(id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
              onToggleAll={() => setSelected((cur) => (openIds.length > 0 && openIds.every((id) => cur.includes(id)) ? [] : openIds))}
              onPaySelected={() => { setNotice(null); setPaying(selected) }}
              onPay={() => { setNotice(null); setPaying(null) }}
              onVoid={(p) => { setVoidTarget(p); setVoidReason(''); setActionError(null) }}
              onEdit={() => setEditing(true)}
              onToggleActive={() => {
                if (shown.supplier.isActive) { setActionError(null); setConfirmStop(true) }
                else void run(() => setSupplierActive(supplier.id, true), () => undefined)
              }}
            />
          </>
        )}
        {actionError && !voidTarget && !confirmStop ? <p role="alert" className="mt-3 text-sm text-error-text">{actionError}</p> : null}
      </Dialog>

      {paying !== undefined && detail ? (
        <SupplierPayDialog
          supplier={shown.supplier}
          docs={detail.documents}
          initialSelected={paying}
          onClose={() => setPaying(undefined)}
          onDone={(n) => { setPaying(undefined); setSelected([]); setNotice(n); afterWrite() }}
        />
      ) : null}

      <SupplierFormDialog open={editing} supplier={shown.supplier} onClose={() => setEditing(false)} onSaved={() => afterWrite()} />
      <ConfirmDialog
        open={voidTarget !== null}
        title="Huỷ lần trả nợ"
        description={voidTarget ? (
          <span className="block space-y-2">
            <span className="block">
              {METHOD_LABEL[voidTarget.method]} {formatVND(voidTarget.amount)} lúc {shiftDateTimeLabel(voidTarget.createdAt)}. Số nợ của
              các phiếu được trả lại như trước lần trả này, phiếu chi đi kèm trong Sổ thu chi bị huỷ cùng.
              {voidTarget.method === 'cash' ? ' Tiền mặt chỉ huỷ được khi ca của lần trả còn mở.' : ''}
            </span>
            <label className="block text-sm font-medium text-foreground" htmlFor="supplier-void-reason">Lý do huỷ</label>
            <textarea
              id="supplier-void-reason" rows={2} maxLength={SUPPLIER_VOID_REASON_MAX} value={voidReason} disabled={busy}
              onChange={(e) => { setVoidReason(e.target.value); setActionError(null) }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
            />
            {actionError ? <span role="alert" className="block text-error-text">{actionError}</span> : null}
          </span>
        ) : undefined}
        confirmLabel="Huỷ lần trả"
        tone="danger"
        busy={busy}
        confirmDisabled={voidReason.trim() === ''}
        onConfirm={() => {
          const target = voidTarget
          if (target) void run(() => voidSupplierPayment({ paymentId: target.id, reason: voidReason }), () => setVoidTarget(null))
        }}
        onCancel={() => setVoidTarget(null)}
      />
      <ConfirmDialog
        open={confirmStop}
        title="Ngừng theo dõi nhà cung cấp này?"
        description={
          <span className="block space-y-2">
            <span className="block">NCC đã ngừng không hiện trong gợi ý khi lập phiếu nhập. Nợ và lịch sử vẫn giữ, vẫn trả nợ được. Bấm Dùng lại bất cứ lúc nào.</span>
            {actionError ? <span role="alert" className="block text-error-text">{actionError}</span> : null}
          </span>
        }
        confirmLabel="Ngừng theo dõi"
        busy={busy}
        onConfirm={() => void run(() => setSupplierActive(supplier.id, false), () => setConfirmStop(false))}
        onCancel={() => setConfirmStop(false)}
      />
    </>
  )
}
