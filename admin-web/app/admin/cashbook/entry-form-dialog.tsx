'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { createCashBookEntry } from '@/lib/actions/cash-book'
import { formatVndInput } from '@/lib/cash-change'
import type { CashBookCategory, CashBookKind, CashBookMethod } from '@/lib/cash-book'
import { cn, formatVND } from '@/lib/utils'
import { drawerAmount, drawerCategories } from '../pos/cash-drawer-dialog'

// Ghi phiếu ở trang Sổ thu chi (chủ quán + quản lý; mig 122): tiền mặt hoặc chuyển khoản, nguồn 'manual'.
// Ngày luôn là ngày kinh doanh hôm nay (server tự gắn) — không có ô ngày, không ghi lùi.

const KIND_LABEL: Record<CashBookKind, string> = { receipt: 'phiếu thu', payment: 'phiếu chi' }

export function entryCanSubmit(f: {
  categories: CashBookCategory[]; kind: CashBookKind; amountText: string; categoryId: string; note: string
}): boolean {
  const cat = drawerCategories(f.categories, f.kind).find((c) => c.id === f.categoryId)
  if (!cat || drawerAmount(f.amountText) === null) return false
  return !cat.requiresNote || f.note.trim() !== ''
}

/** Thân form (thuần props, test vẽ tĩnh được). */
export function EntryForm({
  kind, categories, method, onMethod, amountText, onAmount, categoryId, onCategory, counterparty, onCounterparty,
  note, onNote, error, busy, locked, notice, onSubmit, onCancel,
}: {
  kind: CashBookKind
  categories: CashBookCategory[]
  method: CashBookMethod
  onMethod: (m: CashBookMethod) => void
  amountText: string
  onAmount: (v: string) => void
  categoryId: string
  onCategory: (id: string) => void
  counterparty: string
  onCounterparty: (v: string) => void
  note: string
  onNote: (v: string) => void
  error: string | null
  busy: boolean
  /** Lần gửi trước mất phản hồi: khoá các ô, chỉ cho ghi lại đúng phiếu đó (cùng mã chống trùng). */
  locked: boolean
  /** Server báo phiếu đã ghi từ trước: chỉ còn nút Đóng. */
  notice: string | null
  onSubmit: () => void
  onCancel: () => void
}) {
  const off = busy || locked || notice !== null
  const options = drawerCategories(categories, kind)
  const selected = options.find((c) => c.id === categoryId)
  const canSubmit = entryCanSubmit({ categories, kind, amountText, categoryId, note })
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (canSubmit && !busy) onSubmit() }}>
      <div role="radiogroup" aria-label="Phương thức" className="grid grid-cols-2 gap-2">
        {(['cash', 'bank'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            disabled={off}
            onClick={() => onMethod(m)}
            className={cn(
              'min-h-11 rounded-lg border text-sm font-semibold transition-colors',
              method === m ? 'border-primary bg-primary-light text-primary' : 'border-border-strong bg-surface text-foreground hover:bg-button-hover',
            )}
          >
            {m === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
          </button>
        ))}
      </div>
      {method === 'cash' ? (
        <p className="text-[13px] text-muted">Quán bật ca thì phiếu tiền mặt gắn vào ca đang mở (két chung).</p>
      ) : null}
      <Field label="Số tiền" htmlFor="entry-amount" required>
        <Input
          id="entry-amount" inputMode="numeric" autoComplete="off" placeholder="Ví dụ 80.000" value={amountText} disabled={off}
          onChange={(e) => onAmount(formatVndInput(e.target.value))}
        />
      </Field>
      <Field label="Danh mục" htmlFor="entry-category" required>
        <Select id="entry-category" value={categoryId} disabled={off} onChange={(e) => onCategory(e.target.value)}>
          {options.length === 0 ? <option value="">Chưa có danh mục</option> : null}
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Người nộp / Người nhận" htmlFor="entry-counterparty" hint="Không bắt buộc">
        <Input id="entry-counterparty" maxLength={120} value={counterparty} disabled={off} onChange={(e) => onCounterparty(e.target.value)} />
      </Field>
      <Field
        label="Ghi chú" htmlFor="entry-note" required={selected?.requiresNote}
        hint={selected?.requiresNote ? 'Danh mục này cần ghi chú' : undefined}
      >
        <Textarea id="entry-note" rows={2} maxLength={500} value={note} disabled={off} onChange={(e) => onNote(e.target.value)} />
      </Field>
      {notice ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {notice ? (
          <Button type="button" variant="primary" onClick={onCancel}>Đóng</Button>
        ) : (
          <>
            <Button type="button" onClick={onCancel} disabled={busy}>Huỷ</Button>
            <Button type="submit" variant="primary" isLoading={busy} disabled={!canSubmit}>
              {locked ? 'Ghi lại' : `Ghi ${KIND_LABEL[kind]}`}
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

type Props = { kind: CashBookKind | null; categories: CashBookCategory[]; onClose: () => void; onSaved: () => void }

/** Chỉ dựng khi mở (kind khác null): form trống + mã chống ghi trùng mới mỗi lần mở, giữ qua mọi lần bấm lại. */
export default function EntryFormDialog(props: Props) {
  return props.kind ? <EntryFormDialogOpen {...props} kind={props.kind} /> : null
}

function EntryFormDialogOpen({ kind, categories, onClose, onSaved }: Props & { kind: CashBookKind }) {
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [method, setMethod] = useState<CashBookMethod>('cash')
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState(() => drawerCategories(categories, kind)[0]?.id ?? '')
  const [counterparty, setCounterparty] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    const amount = drawerAmount(amountText)
    if (amount === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await createCashBookEntry({
        kind, method, categoryId, amount, note: note.trim() || null, counterparty: counterparty.trim() || null,
        source: 'manual', clientRequestId,
      })
      if (!res.ok) { setError(res.error); return }
      onSaved()
      if (res.already) {
        setNotice(`${kind === 'receipt' ? 'Phiếu thu' : 'Phiếu chi'} ${formatVND(amount)} đã được ghi ở lần bấm trước — không ghi thêm.`)
        return
      }
      onClose()
    } catch {
      setLocked(true)
      setError('Lỗi kết nối. Bấm Ghi lại — các ô đã khoá để không ghi nhầm thành phiếu khác.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} title={kind === 'receipt' ? 'Thêm phiếu thu' : 'Thêm phiếu chi'}>
      <EntryForm
        kind={kind} categories={categories} method={method} onMethod={(m) => { setMethod(m); setError(null) }}
        amountText={amountText} onAmount={(v) => { setAmountText(v); setError(null) }}
        categoryId={categoryId} onCategory={(id) => { setCategoryId(id); setError(null) }}
        counterparty={counterparty} onCounterparty={setCounterparty} note={note} onNote={setNote}
        error={error} busy={busy} locked={locked} notice={notice}
        onSubmit={() => void submit()} onCancel={onClose}
      />
    </Dialog>
  )
}
