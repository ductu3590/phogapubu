'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { saveSupplier } from '@/lib/actions/suppliers'
import { normalizeDebtPhone } from '@/lib/debts'
import { SUPPLIER_NAME_MAX, SUPPLIER_NOTE_MAX, type SupplierSummary } from '@/lib/suppliers'

// Thêm / sửa nhà cung cấp (chủ quán + quản lý). Quán lấy ở server action. Trùng tên (không phân biệt hoa thường)
// thì server báo "Đã có nhà cung cấp tên này".

type Props = {
  open: boolean
  /** null = thêm NCC mới. */
  supplier: SupplierSummary | null
  onClose: () => void
  onSaved: (supplierId: string) => void
}

/** Chỉ dựng khi mở: form lấy giá trị ban đầu mỗi lần mở. */
export default function SupplierFormDialog(props: Props) {
  return props.open ? <SupplierFormDialogOpen {...props} /> : null
}

function SupplierFormDialogOpen({ supplier, onClose, onSaved }: Props) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [note, setNote] = useState(supplier?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phoneError = normalizeDebtPhone(phone).error
  const canSubmit = name.trim() !== '' && !phoneError && !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await saveSupplier({ supplierId: supplier?.id ?? null, name, phone: phone.trim() || null, note: note.trim() || null })
      if (!res.ok) { setError(res.error); return }
      onSaved(res.supplierId)
      onClose()
    } catch {
      setError('Lỗi kết nối. Thử lưu lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }} dismissible={!busy} title={supplier ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="Tên nhà cung cấp" htmlFor="supplier-form-name" required>
          <Input id="supplier-form-name" autoComplete="off" maxLength={SUPPLIER_NAME_MAX} value={name} disabled={busy}
            placeholder="Đại lý bia…" onChange={(e) => { setName(e.target.value); setError(null) }} />
        </Field>
        <Field label="SĐT" htmlFor="supplier-form-phone" hint="Không bắt buộc">
          <Input id="supplier-form-phone" inputMode="tel" autoComplete="off" value={phone} disabled={busy}
            onChange={(e) => { setPhone(e.target.value); setError(null) }} />
        </Field>
        {phone.trim() && phoneError ? <p role="alert" className="text-sm text-error-text">{phoneError}</p> : null}
        <Field label="Ghi chú" htmlFor="supplier-form-note" hint="Vd. người liên hệ, số tài khoản, lịch giao hàng">
          <Textarea id="supplier-form-note" rows={2} maxLength={SUPPLIER_NOTE_MAX} value={note} disabled={busy}
            onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button type="submit" variant="primary" isLoading={busy} disabled={!canSubmit}>{supplier ? 'Lưu' : 'Thêm NCC'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
