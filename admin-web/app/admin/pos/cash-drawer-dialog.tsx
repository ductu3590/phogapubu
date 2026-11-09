'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { createCashBookEntry } from '@/lib/actions/cash-book'
import { formatVndInput, parseVnd } from '@/lib/cash-change'
import { MAX_CASH_AMOUNT, type CashBookKind } from '@/lib/cash-common'
import type { CashBookCategory } from '@/lib/cash-book'
import { cn } from '@/lib/utils'

// Hộp "Thu/Chi két" trên POS (mig 122): phiếu thu / chi TIỀN MẶT tại két, gắn ca đang mở (server gắn).
// Ai có quyền POS dùng được; luôn method 'cash', nguồn 'pos_drawer'.

/** Danh mục chọn được: đúng loại, đang dùng, bỏ danh mục hệ thống (Nhập hàng chỉ ghi qua phiếu nhập kho). */
export function drawerCategories(categories: CashBookCategory[], kind: CashBookKind): CashBookCategory[] {
  return categories
    .filter((c) => c.kind === kind && c.isActive && !c.isSystem)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Ô số tiền: kiểu Việt Nam ("80.000", "80k"); phải từ 1đ tới 2 tỉ. */
export function drawerAmount(text: string): number | null {
  const v = parseVnd(text)
  return v !== null && v >= 1 && v <= MAX_CASH_AMOUNT ? v : null
}

export function drawerCanSubmit(f: {
  categories: CashBookCategory[]
  kind: CashBookKind
  amountText: string
  categoryId: string
  note: string
}): boolean {
  const cat = drawerCategories(f.categories, f.kind).find((c) => c.id === f.categoryId)
  if (!cat || drawerAmount(f.amountText) === null) return false
  return !cat.requiresNote || f.note.trim() !== ''
}

/** Thân hộp (thuần props) — test vẽ tĩnh được. Nút nằm trong thân để form tự quyết trạng thái khoá. */
export function CashDrawerForm({
  categories, kind, onKind, amountText, onAmount, categoryId, onCategory, note, onNote, error, busy, onSubmit, onCancel,
}: {
  categories: CashBookCategory[]
  kind: CashBookKind
  onKind: (k: CashBookKind) => void
  amountText: string
  onAmount: (v: string) => void
  categoryId: string
  onCategory: (id: string) => void
  note: string
  onNote: (v: string) => void
  error: string | null
  busy: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  const options = drawerCategories(categories, kind)
  const selected = options.find((c) => c.id === categoryId)
  const canSubmit = drawerCanSubmit({ categories, kind, amountText, categoryId, note })
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); if (canSubmit && !busy) onSubmit() }}
    >
      <div role="radiogroup" aria-label="Loại phiếu" className="grid grid-cols-2 gap-2">
        {(['receipt', 'payment'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            disabled={busy}
            onClick={() => onKind(k)}
            className={cn(
              'min-h-11 rounded-lg border text-sm font-semibold transition-colors',
              kind === k ? 'border-primary bg-primary-light text-primary' : 'border-border-strong bg-surface text-foreground hover:bg-button-hover',
            )}
          >
            {k === 'receipt' ? 'Thu' : 'Chi'}
          </button>
        ))}
      </div>
      <Field label="Số tiền" htmlFor="drawer-amount" required>
        <Input
          id="drawer-amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ví dụ 80.000"
          value={amountText}
          disabled={busy}
          onChange={(e) => onAmount(formatVndInput(e.target.value))}
        />
      </Field>
      <Field label="Danh mục" htmlFor="drawer-category" required>
        <Select id="drawer-category" value={categoryId} disabled={busy} onChange={(e) => onCategory(e.target.value)}>
          {options.length === 0 ? <option value="">Chưa có danh mục</option> : null}
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field
        label="Ghi chú"
        htmlFor="drawer-note"
        required={selected?.requiresNote}
        hint={selected?.requiresNote ? 'Danh mục này cần ghi chú' : undefined}
      >
        <Textarea id="drawer-note" rows={2} maxLength={500} value={note} disabled={busy} onChange={(e) => onNote(e.target.value)} />
      </Field>
      {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" onClick={onCancel} disabled={busy}>Huỷ</Button>
        <Button type="submit" variant="primary" isLoading={busy} disabled={!canSubmit}>
          {kind === 'receipt' ? 'Ghi phiếu thu' : 'Ghi phiếu chi'}
        </Button>
      </div>
    </form>
  )
}

type Props = { open: boolean; onClose: () => void; categories: CashBookCategory[]; onSaved: () => void }

/**
 * Chỉ dựng khi mở: mỗi lần mở là form trống và một mã chống ghi trùng MỚI; mã giữ nguyên qua các lần bấm lại
 * sau lỗi / mất mạng (server trả lại phiếu cũ thay vì ghi phiếu thứ hai).
 */
export default function CashDrawerDialog(props: Props) {
  return props.open ? <CashDrawerDialogOpen {...props} /> : null
}

function CashDrawerDialogOpen({ onClose, categories, onSaved }: Props) {
  const [clientRequestId] = useState(() => crypto.randomUUID())
  const [kind, setKind] = useState<CashBookKind>('payment')
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState(() => drawerCategories(categories, 'payment')[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const changeKind = (k: CashBookKind) => {
    setKind(k)
    setCategoryId(drawerCategories(categories, k)[0]?.id ?? '')
    setError(null)
  }

  const submit = async () => {
    const amount = drawerAmount(amountText)
    if (amount === null) return
    setBusy(true)
    setError(null)
    try {
      const res = await createCashBookEntry({
        kind, method: 'cash', categoryId, amount, note: note.trim() || null, counterparty: null,
        source: 'pos_drawer', clientRequestId,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Lỗi kết nối. Bấm ghi lại — cùng một phiếu nên không bị ghi trùng.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} title="Thu/Chi két">
      <CashDrawerForm
        categories={categories}
        kind={kind}
        onKind={changeKind}
        amountText={amountText}
        onAmount={(v) => { setAmountText(v); setError(null) }}
        categoryId={categoryId}
        onCategory={(id) => { setCategoryId(id); setError(null) }}
        note={note}
        onNote={setNote}
        error={error}
        busy={busy}
        onSubmit={() => void submit()}
        onCancel={onClose}
      />
    </Dialog>
  )
}
