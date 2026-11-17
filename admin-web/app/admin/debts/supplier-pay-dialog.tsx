'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { paySupplier } from '@/lib/actions/suppliers'
import { formatVndInput, parseVnd } from '@/lib/cash-change'
import { debtDateLabel } from '@/lib/debts'
import {
  allocateSupplierPayment, selectedOutstanding, SUPPLIER_NOTE_MAX, type SupplierDoc, type SupplierSummary,
} from '@/lib/suppliers'
import { cn, formatVND } from '@/lib/utils'

// Hộp trả nợ nhà cung cấp (mig 145). Một lần trả = phân bổ cũ nhất trước + đúng một phiếu chi "Nhập hàng" ở Sổ thu chi.
// Xem trước phân bổ đúng cách server làm; server kiểm lại và báo nguyên văn (Chưa mở ca, vượt số còn nợ, tải lại…).

const METHOD_LABEL = { cash: 'Tiền mặt', bank: 'Chuyển khoản' } as const

/** Form trả nợ (thuần props — test vẽ tĩnh được). selected = null nghĩa là mọi phiếu còn nợ. */
export function SupplierPayForm({
  docs, amountText, onAmount, method, onMethod, note, onNote, selected, onSelected, error, busy, locked, onSubmit, onCancel,
}: {
  docs: SupplierDoc[]
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
  /** Lần gửi trước mất phản hồi: khoá các ô, chỉ cho gửi lại đúng lần trả đó (cùng mã chống trùng). */
  locked: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const off = busy || locked
  const open = docs.filter((d) => d.outstanding > 0)
  const ticked = (id: string) => selected === null || selected.includes(id)
  const pickedTotal = selectedOutstanding(open, open.filter((d) => ticked(d.id)).map((d) => d.id))
  const amount = parseVnd(amountText)
  const preview = amount === null ? null : allocateSupplierPayment(docs, amount, selected)
  const canSend = locked ? !busy : !off && preview !== null && preview.error === null
  const toggle = (id: string, on: boolean) => {
    const cur = selected ?? open.map((d) => d.id)
    const next = on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)
    // Tích hết = mọi phiếu còn nợ → gửi null (server tự lấy mọi phiếu, cũ nhất trước).
    onSelected(next.length === open.length ? null : next)
  }
  const byId = (id: string) => docs.find((d) => d.id === id)

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (canSend) onSubmit() }}>
      <Field label="Số tiền trả" htmlFor="supplier-pay-amount" required>
        <div className="flex gap-2">
          <Input id="supplier-pay-amount" inputMode="numeric" autoComplete="off" placeholder="Ví dụ 4.000.000" value={amountText}
            disabled={off} onChange={(e) => onAmount(formatVndInput(e.target.value))} className="tabular" />
          <Button type="button" disabled={off || pickedTotal <= 0} onClick={() => onAmount(pickedTotal.toLocaleString('vi-VN'))}
            className="shrink-0">
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
      <p className="text-[13px] text-muted">
        Lưu sẽ ghi một phiếu chi &quot;Nhập hàng&quot; vào Sổ thu chi
        {method === 'cash' ? ' — tiền mặt lấy từ két, quán bật ca thì cần ca đang mở.' : '.'}
      </p>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Trả cho phiếu</legend>
        {open.map((d) => (
          <label key={d.id} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={ticked(d.id)} disabled={off}
              onChange={(e) => toggle(d.id, e.target.checked)} className="size-4 accent-orange-600" />
            <span className="tabular font-semibold">{d.docNo}</span>
            <span className="tabular min-w-0 flex-1 truncate text-muted">{debtDateLabel(d.docDate)}</span>
            <span className="tabular font-semibold">{formatVND(d.outstanding)}</span>
          </label>
        ))}
      </fieldset>

      {preview?.error ? <p role="alert" className="text-sm font-semibold text-error-text">{preview.error}</p> : null}
      {preview && !preview.error ? (
        <div className="rounded-lg border border-border bg-background p-2 text-[13px]">
          <p className="font-semibold">Dự kiến trả cho từng phiếu (phiếu cũ nhất trước)</p>
          <ul>
            {preview.allocations.map((a) => (
              <li key={a.documentId} className="tabular flex justify-between gap-2">
                <span>{byId(a.documentId)?.docNo} · {debtDateLabel(byId(a.documentId)?.docDate ?? '')}</span>
                <span>{formatVND(a.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field label="Ghi chú" htmlFor="supplier-pay-note" hint="Không bắt buộc">
        <Textarea id="supplier-pay-note" rows={2} maxLength={SUPPLIER_NOTE_MAX} value={note} disabled={off}
          onChange={(e) => onNote(e.target.value)} />
      </Field>
      {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" onClick={onCancel} disabled={busy}>Huỷ</Button>
        <Button type="submit" variant="primary" isLoading={busy} disabled={!canSend}>
          {locked ? 'Gửi lại' : 'Xác nhận trả'}
        </Button>
      </div>
    </form>
  )
}

/**
 * Hộp trả nợ: chỉ dựng khi mở → mã chống trả trùng mới mỗi lần mở, giữ nguyên qua mọi lần bấm lại.
 * initialSelected: các phiếu đã tích ở ngăn kéo (điền sẵn số tiền = tổng còn nợ của chúng); null = mọi phiếu, ô tiền trống.
 */
export default function SupplierPayDialog({ supplier, docs, initialSelected, onClose, onDone }: {
  supplier: SupplierSummary
  docs: SupplierDoc[]
  initialSelected: string[] | null
  onClose: () => void
  onDone: (notice: string) => void
}) {
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [amountText, setAmountText] = useState(() =>
    initialSelected ? selectedOutstanding(docs, initialSelected).toLocaleString('vi-VN') : '')
  const [method, setMethod] = useState<'cash' | 'bank'>('cash')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string[] | null>(initialSelected)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)

  const submit = async () => {
    const amount = parseVnd(amountText)
    if (amount === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await paySupplier({
        supplierId: supplier.id, amount, method, documentIds: selected, note: note.trim() || null, clientRequestId,
      })
      // Lỗi server hiện nguyên văn (Chưa mở ca, vượt số còn nợ, tải lại…): ô vẫn mở để sửa rồi gửi lại cùng mã.
      if (!res.ok) { setError(res.error); return }
      onDone(res.already
        ? `Lần trả ${formatVND(amount)} đã được ghi ở lần bấm trước — không ghi thêm.`
        : `Đã trả ${formatVND(amount)} và ghi phiếu chi vào Sổ thu chi.`)
    } catch {
      setLocked(true)
      setError('Lỗi kết nối. Bấm Gửi lại — các ô đã khoá để không ghi nhầm thành lần trả khác.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} title={`Trả nợ · ${supplier.name}`}>
      <SupplierPayForm
        docs={docs} amountText={amountText} onAmount={(v) => { setAmountText(v); setError(null) }}
        method={method} onMethod={(m) => { setMethod(m); setError(null) }} note={note} onNote={setNote}
        selected={selected} onSelected={(v) => { setSelected(v); setError(null) }}
        error={error} busy={busy} locked={locked} onSubmit={() => void submit()} onCancel={onClose}
      />
    </Dialog>
  )
}
