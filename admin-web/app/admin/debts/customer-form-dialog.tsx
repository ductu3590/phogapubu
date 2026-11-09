'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { saveDebtCustomer } from '@/lib/actions/debts'
import { DEBT_NAME_MAX, DEBT_NOTE_MAX, debtKindLabel, normalizeDebtPhone, type DebtCustomerKind, type DebtCustomerSummary } from '@/lib/debts'
import { cn } from '@/lib/utils'

// Thêm / sửa khách nợ (chủ quán + quản lý). Quán lấy ở server action, không gửi từ đây. SĐT trùng khách khác thì
// server báo nguyên văn "SĐT … đã có khách …, chọn khách đó".

const KINDS: readonly DebtCustomerKind[] = ['company', 'person']

type Props = {
  open: boolean
  /** null = thêm khách mới. */
  customer: DebtCustomerSummary | null
  onClose: () => void
  onSaved: (customerId: string) => void
}

/** Chỉ dựng khi mở: form lấy giá trị ban đầu mỗi lần mở. */
export default function CustomerFormDialog(props: Props) {
  return props.open ? <CustomerFormDialogOpen {...props} /> : null
}

function CustomerFormDialogOpen({ customer, onClose, onSaved }: Props) {
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [kind, setKind] = useState<DebtCustomerKind>(customer?.kind ?? 'company')
  const [note, setNote] = useState(customer?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phoneError = normalizeDebtPhone(phone).error
  const canSubmit = name.trim() !== '' && !phoneError && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await saveDebtCustomer({ customerId: customer?.id ?? null, name, phone: phone.trim() || null, kind, note: note.trim() || null })
      if (!res.ok) { setError(res.error); return }
      onSaved(res.customerId)
      onClose()
    } catch {
      setError('Lỗi kết nối. Thử lưu lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} title={customer ? 'Sửa khách nợ' : 'Thêm khách nợ'}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="Tên khách / cơ quan" htmlFor="debt-form-name" required>
          <Input id="debt-form-name" autoComplete="off" maxLength={DEBT_NAME_MAX} value={name} disabled={busy}
            onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label="SĐT" htmlFor="debt-form-phone" hint="Không bắt buộc. Mỗi SĐT chỉ một khách.">
          <Input id="debt-form-phone" inputMode="tel" autoComplete="off" value={phone} disabled={busy}
            onChange={(e) => { setPhone(e.target.value); setError(null) }} />
        </Field>
        {phone.trim() && phoneError ? <p role="alert" className="text-sm text-error-text">{phoneError}</p> : null}
        <div role="radiogroup" aria-label="Loại khách" className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k} type="button" role="radio" aria-checked={kind === k} disabled={busy} onClick={() => setKind(k)}
              className={cn(
                'min-h-11 rounded-lg border text-sm font-semibold transition-colors',
                kind === k ? 'border-primary bg-primary-light text-primary' : 'border-border-strong bg-surface text-foreground hover:bg-button-hover',
              )}
            >
              {debtKindLabel(k)}
            </button>
          ))}
        </div>
        <Field label="Ghi chú" htmlFor="debt-form-note" hint="Vd. người liên hệ, hạn thanh toán">
          <Textarea id="debt-form-note" rows={2} maxLength={DEBT_NOTE_MAX} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button type="submit" variant="primary" isLoading={busy} disabled={!canSubmit}>{customer ? 'Lưu' : 'Thêm khách'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
