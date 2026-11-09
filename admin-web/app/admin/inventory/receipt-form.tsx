'use client'

import { useState, type ReactNode } from 'react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { type DraftLine, type StockRow } from '@/lib/inventory'
import { cn } from '@/lib/utils'
import { addDaysIso, DocumentFormShell, MAX_BACKDATE_DAYS, useDocumentSubmit } from './document-form'
import LinesEditor, { emptyDraft } from './lines-editor'

type PaidStatus = 'paid' | 'unpaid'
type PaidMethod = 'cash' | 'bank'

export type ReceiptDraft = {
  docDate: string
  supplierName: string
  note: string
  paidStatus: PaidStatus | null
  paidMethod: PaidMethod | null
  drafts: DraftLine[]
}

/** Lý do chưa lưu được — null là lưu được (dòng sai thì báo lúc bấm Lưu). */
export function receiptBlocker(d: ReceiptDraft): string | null {
  if (!d.drafts.some((l) => l.inventoryItemId)) return 'Chọn ít nhất một hàng'
  if (d.paidStatus === null) return 'Chọn đã trả hay chưa trả'
  if (d.paidStatus === 'paid' && d.paidMethod === null) return 'Chọn phương thức trả tiền'
  return null
}

/** Nhóm nút chọn một (radio). */
function Choice<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 cursor-pointer rounded-lg border px-4 text-sm font-medium transition-colors md:min-h-10',
            value === o.value ? 'border-primary bg-accent-bg text-accent' : 'border-border-strong bg-surface text-foreground hover:bg-button-hover',
          )}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** Phiếu nhập: ngày (lùi ≤ 7 ngày), nhà cung cấp (gợi ý tên cũ), ghi chú, dòng có giá, đã trả / chưa trả. */
export default function ReceiptForm({ today, items, suppliers, onClose, onSaved, initial }: {
  today: string
  items: StockRow[]
  suppliers: string[]
  onClose: () => void
  onSaved: () => void
  /** Giá trị ban đầu (test / mở lại form). */
  initial?: Partial<ReceiptDraft>
}) {
  const start: ReceiptDraft = {
    docDate: today, supplierName: '', note: '', paidStatus: null, paidMethod: null, drafts: [emptyDraft()], ...initial,
  }
  const [form, setForm] = useState(start)
  const [pristine] = useState(() => JSON.stringify(start))
  const { busy, error, submit } = useDocumentSubmit('receipt', today, onSaved)
  const set = (patch: Partial<ReceiptDraft>) => setForm((f) => ({ ...f, ...patch }))

  const save = () => submit({
    docDate: form.docDate || today,
    supplierName: form.supplierName.trim() || null,
    note: form.note.trim() || null,
    paidStatus: form.paidStatus,
    paidMethod: form.paidStatus === 'paid' ? form.paidMethod : null,
  }, form.drafts)

  return (
    <DocumentFormShell
      title="Tạo phiếu nhập"
      description="Hàng mua về: số lượng, đơn giá, nhà cung cấp."
      dirty={JSON.stringify(form) !== pristine}
      busy={busy}
      blocker={receiptBlocker(form)}
      error={error}
      onClose={onClose}
      onSave={save}
    >
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Ngày nhập" htmlFor="inv-receipt-date" hint={`Ghi lùi tối đa ${MAX_BACKDATE_DAYS} ngày`}>
          <Input id="inv-receipt-date" type="date" value={form.docDate} min={addDaysIso(today, -MAX_BACKDATE_DAYS)} max={today}
            onChange={(e) => set({ docDate: e.target.value })} />
        </Field>
        <Field label="Nhà cung cấp" htmlFor="inv-receipt-supplier">
          <Input id="inv-receipt-supplier" list="inv-receipt-suppliers" value={form.supplierName} maxLength={120}
            autoComplete="off" placeholder="Đại lý bia…" onChange={(e) => set({ supplierName: e.target.value })} />
          <datalist id="inv-receipt-suppliers">
            {suppliers.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>
      </div>

      <Section title="Hàng nhập">
        <LinesEditor kind="receipt" items={items} drafts={form.drafts} onChange={(drafts) => set({ drafts })} />
      </Section>

      <Section title="Trả tiền">
        <Choice label="Trạng thái trả tiền" value={form.paidStatus}
          options={[{ value: 'unpaid', label: 'Chưa trả' }, { value: 'paid', label: 'Đã trả' }]}
          onChange={(paidStatus) => set({ paidStatus, paidMethod: paidStatus === 'paid' ? form.paidMethod : null })} />
        {form.paidStatus === 'paid' ? (
          <>
            <Choice label="Phương thức trả tiền" value={form.paidMethod}
              options={[{ value: 'cash', label: 'Tiền mặt' }, { value: 'bank', label: 'Chuyển khoản' }]}
              onChange={(paidMethod) => set({ paidMethod })} />
            {/* Mig 122b: lưu phiếu nhập đã trả = ghi luôn phiếu chi "Nhập hàng" trong cùng giao dịch. */}
            <p className="text-[13px] text-muted">
              Lưu phiếu sẽ ghi luôn một phiếu chi &quot;Nhập hàng&quot; vào Sổ thu chi
              {form.paidMethod === 'cash' ? ' — tiền mặt lấy từ két, quán bật ca thì cần mở ca trên POS trước.' : '.'}
            </p>
            {/* Ghi lùi ngày nhập: tồn kho tính theo ngày nhập, nhưng tiền mặt ra khỏi két HÔM NAY (phiếu chi mang ngày hôm nay,
                gắn ca đang mở) — cash_book_create_internal không ghi lùi ngày. */}
            {form.paidMethod === 'cash' && form.docDate !== today ? (
              <p className="text-[13px] text-amber-800">
                Ngày nhập khác hôm nay: tiền mặt vẫn tính ra khỏi két hôm nay (ca đang mở), không ghi lùi vào ngày nhập.
              </p>
            ) : null}
          </>
        ) : null}
      </Section>

      <Field label="Ghi chú" htmlFor="inv-receipt-note">
        <Textarea id="inv-receipt-note" value={form.note} maxLength={500} onChange={(e) => set({ note: e.target.value })}
          className="min-h-16" />
      </Field>
    </DocumentFormShell>
  )
}
