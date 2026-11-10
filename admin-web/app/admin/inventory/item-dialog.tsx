'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { saveInventoryItem } from '@/lib/actions/inventory'
import { runAction } from '@/lib/run-action'
import { formatQty, KIND_LABEL, parseQty, qtyWarning, type InventoryKind, type StockRow } from '@/lib/inventory'
import { cn } from '@/lib/utils'
import ConfirmDialog from '../pos/confirm-dialog'
import { closeAction } from './document-form'

const UNIT_SUGGESTIONS = ['lon', 'chai', 'két', 'kg', 'gói', 'thùng']
const FORM_ID = 'inventory-item-form'

/**
 * Thêm / sửa một hàng hoá. Mount khi mở (cha đặt `key` theo hàng) nên state khởi tạo thẳng từ `item`.
 * Đã gõ dở thì không đóng khi bấm ra ngoài; Huỷ / X / Esc lúc đó hỏi "Bỏ thay đổi?", đang lưu thì không đóng. Lỗi server (trùng tên, đổi loại khi đang gắn món…) hiện nguyên văn.
 */
export default function ItemDialog({ item, onClose, onSaved }: {
  /** null = thêm mới. */
  item: StockRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const initial = {
    name: item?.name ?? '',
    unit: item?.unit ?? '',
    kind: (item?.kind ?? 'goods') as InventoryKind,
    sku: item?.sku ?? '',
    minStock: item?.minStock != null ? formatQty(item.minStock).replace(/\./g, '') : '',
  }
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ name?: string; unit?: string; minStock?: string }>({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => form[k] !== initial[k])
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setFieldError((e) => ({ ...e, [key]: undefined }))
  }

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (busy) return
    const name = form.name.trim()
    const unit = form.unit.trim()
    const minRaw = form.minStock.trim()
    const minStock = minRaw === '' ? null : parseQty(minRaw)
    const errors: typeof fieldError = {}
    if (!name) errors.name = 'Nhập tên hàng hoá'
    if (!unit) errors.unit = 'Nhập đơn vị tính'
    if (minRaw !== '' && minStock === null) errors.minStock = 'Mức tối thiểu phải lớn hơn 0, tối đa 3 chữ số thập phân'
    setFieldError(errors)
    if (Object.keys(errors).length > 0) return

    setBusy(true)
    setError(null)
    const res = await runAction(() => saveInventoryItem({
      id: item?.id ?? null,
      name,
      unit,
      kind: form.kind,
      sku: form.sku.trim() || null,
      minStock,
    }))
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    toast({ tone: 'success', title: 'Đã lưu hàng hoá', description: name })
    onSaved()
  }

  const requestClose = () => {
    const action = closeAction(dirty, busy)
    if (action === 'confirm') setConfirmDiscard(true)
    else if (action === 'close') onClose()
  }

  const minHint = qtyWarning(form.minStock) ?? 'Tồn dưới mức này thì hiện "Sắp hết". Để trống nếu không cần.'

  return (
    <>
    <Dialog
      open
      placement="side"
      dismissible={!dirty && !busy}
      onClose={requestClose}
      onEscape={requestClose}
      title={item ? 'Sửa hàng hoá' : 'Thêm hàng hoá'}
      description={item ? item.name : 'Thứ quán mua về và đếm được: bia lon, nước chai, thịt, rau…'}
      footer={
        <>
          <Button onClick={requestClose} disabled={busy}>Huỷ</Button>
          <Button variant="primary" type="submit" form={FORM_ID} isLoading={busy}>Lưu</Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} className="space-y-3" noValidate>
        {error ? <p role="alert" className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-sm text-critical">{error}</p> : null}

        <Field label="Tên hàng hoá" htmlFor="inv-item-name" required error={fieldError.name}>
          <Input id="inv-item-name" value={form.name} maxLength={80} autoComplete="off" invalid={!!fieldError.name}
            onChange={(e) => set('name', e.target.value)} placeholder="Bia Hà Nội lon" />
        </Field>

        <Field label="Đơn vị tính" htmlFor="inv-item-unit" required error={fieldError.unit}>
          <Input id="inv-item-unit" value={form.unit} maxLength={20} autoComplete="off" invalid={!!fieldError.unit}
            onChange={(e) => set('unit', e.target.value)} placeholder="lon" />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {UNIT_SUGGESTIONS.map((u) => (
              <button key={u} type="button" onClick={() => set('unit', u)}
                className={cn(
                  'h-8 cursor-pointer rounded-full border px-3 text-[13px] transition-colors',
                  form.unit.trim() === u ? 'border-primary bg-accent-bg text-accent' : 'border-border text-foreground/80 hover:bg-foreground/5',
                )}>
                {u}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Loại" htmlFor="inv-item-kind"
          hint={form.kind === 'goods'
            ? 'Bán nguyên: tự trừ kho khi bán (bia, nước). Gắn với món ở trang Món.'
            : 'Nguyên liệu: chỉ nhập và kiểm kho, không tự trừ khi bán.'}>
          <Select id="inv-item-kind" value={form.kind} onChange={(e) => set('kind', e.target.value as InventoryKind)}>
            {(Object.keys(KIND_LABEL) as InventoryKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>

        <Field label="Mã hàng (tuỳ chọn)" htmlFor="inv-item-sku">
          <Input id="inv-item-sku" value={form.sku} maxLength={40} autoComplete="off" onChange={(e) => set('sku', e.target.value)} />
        </Field>

        <Field label="Mức tối thiểu (tuỳ chọn)" htmlFor="inv-item-min" error={fieldError.minStock} hint={minHint}>
          <Input id="inv-item-min" value={form.minStock} inputMode="decimal" autoComplete="off" invalid={!!fieldError.minStock}
            onChange={(e) => set('minStock', e.target.value)} placeholder="24" />
        </Field>
      </form>
    </Dialog>
    {confirmDiscard ? (
      <ConfirmDialog
        open
        title="Bỏ thay đổi?"
        description="Những gì vừa gõ sẽ mất."
        confirmLabel="Bỏ thay đổi"
        tone="danger"
        busy={false}
        onConfirm={() => { setConfirmDiscard(false); onClose() }}
        onCancel={() => setConfirmDiscard(false)}
      />
    ) : null}
    </>
  )
}
