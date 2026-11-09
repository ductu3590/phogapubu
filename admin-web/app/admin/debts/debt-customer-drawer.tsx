'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HandCoins, Pencil, Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ErrorState, Spinner } from '@/components/ui/feedback'
import { Field, Input, Textarea } from '@/components/ui/field'
import { collectDebt, loadDebtCustomerDetail, setDebtCustomerActive, voidDebtPayment } from '@/lib/actions/debts'
import { formatVndInput, parseVnd } from '@/lib/cash-change'
import { shiftDateTimeLabel } from '@/lib/cash-shift'
import {
  allocateDebt, debtBillHref, debtDateLabel, debtKindLabel, DEBT_NOTE_MAX, DEBT_VOID_REASON_MAX,
  type DebtBill, type DebtCustomerDetail, type DebtCustomerSummary, type DebtPaymentRow,
} from '@/lib/debts'
import { printDocument } from '@/lib/print/print-document'
import { cn, formatVND } from '@/lib/utils'
import ConfirmDialog from '../pos/confirm-dialog'
import CustomerFormDialog from './customer-form-dialog'

// Ngăn kéo một khách nợ (mig 123). Đọc chi tiết MỘT lần khi mở và sau mỗi thao tác (không poll). Mọi số tiền của
// server; lần trả đã huỷ vẫn liệt kê (gạch ngang + lý do) nhưng server đã bỏ khỏi "Đã trả" / "Còn nợ".
// Thu nợ: thu ngân / quản lý / chủ quán. Huỷ lần trả, sửa, ngừng khách: chỉ canManage (chủ quán, quản lý).

const METHOD_LABEL = { cash: 'Tiền mặt', bank: 'Chuyển khoản' } as const

function BillLine({ b }: { b: DebtBill }) {
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">
          <a href={debtBillHref(b.businessDate)} className="tabular font-semibold text-primary hover:underline">{debtDateLabel(b.businessDate) || '—'}</a>
          <span className="text-muted"> · {b.tableLabel}</span>
        </span>
        <span className="tabular shrink-0 font-bold text-orange-700">{formatVND(b.outstanding)}</span>
      </div>
      <div className="tabular mt-0.5 grid grid-cols-[auto_1fr] gap-x-3 text-[13px]">
        <span className="text-muted">Tổng bill</span><span>{formatVND(b.billTotal)}</span>
        <span className="text-muted">Ghi nợ</span><span>{formatVND(b.debtAmount)}</span>
        <span className="text-muted">Đã trả</span><span>{formatVND(b.paidAmount)}</span>
        <span className="text-muted">Còn nợ</span><span>{formatVND(b.outstanding)}</span>
      </div>
    </li>
  )
}

function PaymentLine({ p, canManage, busy, onVoid }: { p: DebtPaymentRow; canManage: boolean; busy: boolean; onVoid: (p: DebtPaymentRow) => void }) {
  const voided = p.voidedAt !== null
  return (
    <li className={cn('py-2', voided && 'text-muted')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('min-w-0 text-sm', voided && 'line-through')}>
          {shiftDateTimeLabel(p.createdAt)} · {METHOD_LABEL[p.method]}{p.createdByName ? ` · ${p.createdByName}` : ''}
        </span>
        <span className={cn('tabular shrink-0 font-semibold', voided && 'line-through')}>{formatVND(p.amount)}</span>
      </div>
      {p.note ? <p className={cn('text-[13px]', voided && 'line-through')}>{p.note}</p> : null}
      {voided ? (
        <p className="text-[13px] text-red-700">Đã huỷ{p.voidedByName ? ` (${p.voidedByName})` : ''}: {p.voidReason}</p>
      ) : canManage ? (
        <div className="mt-1 text-right">
          <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => onVoid(p)}>Huỷ</Button>
        </div>
      ) : null}
    </li>
  )
}

/** Thân ngăn kéo (thuần props — test vẽ tĩnh được). */
export function DebtCustomerDetailBody({ detail, canManage, busy, onCollect, onPrint, onVoid, onEdit, onToggleActive }: {
  detail: DebtCustomerDetail
  canManage: boolean
  busy: boolean
  onCollect: () => void
  onPrint: () => void
  onVoid: (p: DebtPaymentRow) => void
  onEdit: () => void
  onToggleActive: () => void
}) {
  const c = detail.customer
  // Còn nợ trước (cũ nhất trước, như thứ tự phân bổ), bill đã trả hết thu gọn ở dưới.
  const open = detail.bills.filter((b) => b.outstanding > 0)
  const paid = detail.bills.filter((b) => b.outstanding <= 0)
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background p-3">
        <p className="text-sm text-muted">
          {debtKindLabel(c.kind)}{c.phone ? ` · ${c.phone}` : ''}
          {c.isActive ? null : <Badge className="ml-2">Đã ngừng</Badge>}
        </p>
        {c.note ? <p className="mt-1 text-sm">{c.note}</p> : null}
        <p className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">Đang nợ</span>
          <span className="tabular text-2xl font-bold text-orange-700">{formatVND(c.outstanding)}</span>
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        {c.outstanding > 0 ? <Button variant="primary" icon={<HandCoins />} disabled={busy} onClick={onCollect}>Thu nợ</Button> : null}
        <Button icon={<Printer />} disabled={busy} onClick={onPrint}>In bảng kê</Button>
        {canManage ? (
          <>
            <Button icon={<Pencil />} disabled={busy} onClick={onEdit}>Sửa khách</Button>
            <Button disabled={busy} onClick={onToggleActive}>{c.isActive ? 'Ngừng theo dõi' : 'Dùng lại'}</Button>
          </>
        ) : null}
      </div>

      <section>
        <h3 className="text-[13px] font-bold tracking-wide text-slate-700 uppercase">Bill còn nợ ({open.length})</h3>
        {open.length === 0 ? <p className="py-2 text-sm text-muted">Không còn bill nợ.</p> : (
          <ul className="divide-y divide-border">{open.map((b) => <BillLine key={b.billPaymentId} b={b} />)}</ul>
        )}
        {paid.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-semibold text-muted">Đã trả hết ({paid.length})</summary>
            <ul className="divide-y divide-border">{paid.map((b) => <BillLine key={b.billPaymentId} b={b} />)}</ul>
          </details>
        ) : null}
      </section>

      <section>
        <h3 className="text-[13px] font-bold tracking-wide text-slate-700 uppercase">Lịch sử trả nợ</h3>
        {detail.payments.length === 0 ? <p className="py-2 text-sm text-muted">Chưa có lần trả nào.</p> : (
          <ul className="divide-y divide-border">
            {detail.payments.map((p) => <PaymentLine key={p.id} p={p} canManage={canManage} busy={busy} onVoid={onVoid} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Form thu nợ (thuần props). selected = null nghĩa là mọi bill còn nợ. Xem trước phân bổ đúng cách server làm. */
export function DebtCollectForm({
  bills, amountText, onAmount, method, onMethod, note, onNote, selected, onSelected, error, busy, locked, onSubmit, onCancel,
}: {
  bills: DebtBill[]
  amountText: string
  onAmount: (v: string) => void
  method: 'cash' | 'bank'
  onMethod: (m: 'cash' | 'bank') => void
  note: string
  onNote: (v: string) => void
  selected: string[] | null
  onSelected: (v: string[] | null) => void
  error: string | null
  busy: boolean
  /** Lần gửi trước mất phản hồi: khoá các ô, chỉ cho gửi lại đúng lần thu đó (cùng mã chống trùng). */
  locked: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const off = busy || locked
  const open = bills.filter((b) => b.outstanding > 0)
  const ticked = (id: string) => selected === null || selected.includes(id)
  const pickedTotal = open.filter((b) => ticked(b.billPaymentId)).reduce((s, b) => s + b.outstanding, 0)
  const amount = parseVnd(amountText)
  const preview = amount === null ? null : allocateDebt(bills, amount, selected)
  const canSubmit = !off && preview !== null && preview.error === null
  // Đã khoá sau lỗi mạng: gửi lại đúng lần thu cũ (số tiền / bill không đổi được nữa).
  const canSend = locked ? !busy : canSubmit
  const toggle = (id: string, on: boolean) => {
    const cur = selected ?? open.map((b) => b.billPaymentId)
    const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)
    // Tick hết = mọi bill còn nợ → gửi null (server tự lấy mọi bill, cũ nhất trước).
    onSelected(next.length === open.length ? null : next)
  }
  const label = (id: string) => open.find((b) => b.billPaymentId === id)

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (canSend) onSubmit() }}>
      <Field label="Số tiền khách trả" htmlFor="debt-pay-amount" required>
        <div className="flex gap-2">
          <Input id="debt-pay-amount" inputMode="numeric" autoComplete="off" placeholder="Ví dụ 500.000" value={amountText} disabled={off}
            onChange={(e) => onAmount(formatVndInput(e.target.value))} className="tabular" />
          <Button type="button" disabled={off || pickedTotal <= 0} onClick={() => onAmount(pickedTotal.toLocaleString('vi-VN'))} className="shrink-0">
            Trả hết
          </Button>
        </div>
      </Field>
      <div role="radiogroup" aria-label="Phương thức" className="grid grid-cols-2 gap-2">
        {(['cash', 'bank'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} disabled={off} onClick={() => onMethod(m)}
            className={cn(
              'min-h-11 rounded-lg border text-sm font-semibold transition-colors',
              method === m ? 'border-primary bg-primary-light text-primary' : 'border-border-strong bg-surface text-foreground hover:bg-button-hover',
            )}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      {method === 'cash' ? <p className="text-[13px] text-muted">Quán bật ca thì tiền mặt vào két của ca đang mở.</p> : null}

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Trả cho bill</legend>
        {open.map((b) => (
          <label key={b.billPaymentId} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={ticked(b.billPaymentId)} disabled={off}
              onChange={(e) => toggle(b.billPaymentId, e.target.checked)} className="size-4 accent-orange-600" />
            <span className="tabular">{debtDateLabel(b.businessDate)}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{b.tableLabel}</span>
            <span className="tabular font-semibold">{formatVND(b.outstanding)}</span>
          </label>
        ))}
      </fieldset>

      {preview?.error ? <p role="alert" className="text-sm font-semibold text-error-text">{preview.error}</p> : null}
      {preview && !preview.error ? (
        <div className="rounded-lg border border-border bg-background p-2 text-[13px]">
          <p className="font-semibold">Phân bổ (bill cũ nhất trước)</p>
          <ul>
            {preview.allocations.map((a) => (
              <li key={a.billPaymentId} className="tabular flex justify-between gap-2">
                <span>{debtDateLabel(label(a.billPaymentId)?.businessDate ?? '')} · {label(a.billPaymentId)?.tableLabel}</span>
                <span>{formatVND(a.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field label="Ghi chú" htmlFor="debt-pay-note" hint="Không bắt buộc">
        <Textarea id="debt-pay-note" rows={2} maxLength={DEBT_NOTE_MAX} value={note} disabled={off} onChange={(e) => onNote(e.target.value)} />
      </Field>
      {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" onClick={onCancel} disabled={busy}>Huỷ</Button>
        <Button type="submit" variant="primary" isLoading={busy} disabled={!canSend}>
          {locked ? 'Gửi lại' : 'Xác nhận thu nợ'}
        </Button>
      </div>
    </form>
  )
}

/** Hộp thu nợ: chỉ dựng khi mở → mã chống thu trùng mới mỗi lần mở, giữ nguyên qua mọi lần bấm lại. */
function CollectDialog({ customer, bills, onClose, onDone }: {
  customer: DebtCustomerSummary
  bills: DebtBill[]
  onClose: () => void
  onDone: (notice: string | null) => void
}) {
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<'cash' | 'bank'>('cash')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)

  const submit = async () => {
    const amount = parseVnd(amountText)
    if (amount === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await collectDebt({ customerId: customer.id, amount, method, billPaymentIds: selected, note: note.trim() || null, clientRequestId })
      // Lỗi server hiện nguyên văn (kể cả "Chưa mở ca", "vượt số nợ"): ô vẫn mở để sửa rồi gửi lại cùng mã.
      if (!res.ok) { setError(res.error); return }
      onDone(res.already ? `Lần thu ${formatVND(amount)} đã được ghi ở lần bấm trước — không ghi thêm.` : null)
    } catch {
      setLocked(true)
      setError('Lỗi kết nối. Bấm Gửi lại — các ô đã khoá để không ghi nhầm thành lần thu khác.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} title={`Thu nợ · ${customer.name}`}>
      <DebtCollectForm
        bills={bills} amountText={amountText} onAmount={(v) => { setAmountText(v); setError(null) }}
        method={method} onMethod={(m) => { setMethod(m); setError(null) }} note={note} onNote={setNote}
        selected={selected} onSelected={(v) => { setSelected(v); setError(null) }}
        error={error} busy={busy} locked={locked} onSubmit={() => void submit()} onCancel={onClose}
      />
    </Dialog>
  )
}

export default function DebtCustomerDrawer({ customer, canManage, onClose }: {
  customer: DebtCustomerSummary
  canManage: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<DebtCustomerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [collecting, setCollecting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [voidTarget, setVoidTarget] = useState<DebtPaymentRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Đọc một lần khi mở và sau mỗi thao tác (reloadTick). Cha dựng lại theo key = id khách.
  useEffect(() => {
    let alive = true
    loadDebtCustomerDetail(customer.id).then(
      (res) => {
        if (!alive) return
        if (res.ok) { setDetail(res.detail); setError(null) } else setError(res.error)
      },
      () => { if (alive) setError('Lỗi kết nối. Không tải được khách nợ.') },
    )
    return () => { alive = false }
  }, [customer.id, reloadTick])

  // Sau mỗi ghi: tải lại chi tiết rồi làm mới danh sách (số nợ trên bảng).
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

  const shown = detail ?? { customer, bills: [], payments: [] }

  return (
    <>
      <Dialog open onClose={onClose} placement="side" className="md:w-[520px]" title={customer.name}
        description={customer.phone ?? debtKindLabel(customer.kind)}>
        {notice ? <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}
        {error ? (
          <ErrorState title="Không tải được khách nợ" reason={error} onRetry={() => setReloadTick((t) => t + 1)} />
        ) : (
          <>
            {detail ? null : <Spinner label="Đang tải" className="mb-3" />}
            <DebtCustomerDetailBody
              detail={shown}
              canManage={canManage}
              busy={busy || detail === null}
              onCollect={() => { setNotice(null); setCollecting(true) }}
              onPrint={() => {
                // Qua printDocument như mọi lần in khác (bảng kê chỉ in bằng trình duyệt, xem print-request.ts).
                void printDocument({ kind: 'debt_statement', customerId: customer.id }).then((r) => { if (!r.ok) setActionError(r.error) })
              }}
              onVoid={(p) => { setVoidTarget(p); setVoidReason(''); setActionError(null) }}
              onEdit={() => setEditing(true)}
              onToggleActive={() => {
                if (shown.customer.isActive) { setActionError(null); setConfirmStop(true) }
                else void run(() => setDebtCustomerActive(customer.id, true), () => undefined)
              }}
            />
          </>
        )}
        {actionError && !voidTarget && !confirmStop ? <p role="alert" className="mt-3 text-sm text-error-text">{actionError}</p> : null}
      </Dialog>

      {collecting && detail ? (
        <CollectDialog
          customer={shown.customer}
          bills={detail.bills}
          onClose={() => setCollecting(false)}
          onDone={(n) => { setCollecting(false); setNotice(n); afterWrite() }}
        />
      ) : null}

      {canManage ? (
        <>
          <CustomerFormDialog open={editing} customer={shown.customer} onClose={() => setEditing(false)} onSaved={() => afterWrite()} />
          <ConfirmDialog
            open={voidTarget !== null}
            title="Huỷ lần trả nợ"
            description={voidTarget ? (
              <span className="block space-y-2">
                <span className="block">
                  {METHOD_LABEL[voidTarget.method]} {formatVND(voidTarget.amount)} lúc {shiftDateTimeLabel(voidTarget.createdAt)}. Số nợ của các bill
                  được trả lại như trước lần thu này.
                  {voidTarget.method === 'cash' ? ' Tiền mặt chỉ huỷ được khi ca của lần thu còn mở.' : ''}
                </span>
                <label className="block text-sm font-medium text-foreground" htmlFor="debt-void-reason">Lý do huỷ</label>
                <textarea
                  id="debt-void-reason" rows={2} maxLength={DEBT_VOID_REASON_MAX} value={voidReason} disabled={busy}
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
              if (target) void run(() => voidDebtPayment({ paymentId: target.id, reason: voidReason }), () => setVoidTarget(null))
            }}
            onCancel={() => setVoidTarget(null)}
          />
          <ConfirmDialog
            open={confirmStop}
            title="Ngừng theo dõi khách này?"
            description={
              <span className="block space-y-2">
                <span className="block">Khách đã ngừng không hiện khi chọn khách ghi nợ ở POS. Lịch sử vẫn giữ, bấm Dùng lại bất cứ lúc nào.</span>
                {actionError ? <span role="alert" className="block text-error-text">{actionError}</span> : null}
              </span>
            }
            confirmLabel="Ngừng theo dõi"
            busy={busy}
            onConfirm={() => void run(() => setDebtCustomerActive(customer.id, false), () => setConfirmStop(false))}
            onCancel={() => setConfirmStop(false)}
          />
        </>
      ) : null}
    </>
  )
}
