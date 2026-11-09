'use client'

import { useState } from 'react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { type DraftLine, type StockRow } from '@/lib/inventory'
import { addDaysIso, DocumentFormShell, MAX_BACKDATE_DAYS, useDocumentSubmit } from './document-form'
import LinesEditor, { emptyDraft } from './lines-editor'

export type WriteoffDraft = { docDate: string; note: string; drafts: DraftLine[] }

export function writeoffBlocker(d: WriteoffDraft): string | null {
  if (!d.drafts.some((l) => l.inventoryItemId)) return 'Chọn ít nhất một hàng'
  if (!d.note.trim()) return 'Nhập lý do huỷ'
  return null
}

/** Phiếu xuất huỷ: hàng hỏng, vỡ, mất. Lý do bắt buộc (lưu vào ghi chú phiếu). */
export default function WriteoffForm({ today, items, onClose, onSaved, initial }: {
  today: string
  items: StockRow[]
  onClose: () => void
  onSaved: () => void
  initial?: Partial<WriteoffDraft>
}) {
  const start: WriteoffDraft = { docDate: today, note: '', drafts: [emptyDraft()], ...initial }
  const [form, setForm] = useState(start)
  const [pristine] = useState(() => JSON.stringify(start))
  const { busy, error, submit } = useDocumentSubmit('writeoff', today, onSaved)
  const set = (patch: Partial<WriteoffDraft>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <DocumentFormShell
      title="Tạo phiếu xuất huỷ"
      description="Hàng hỏng, vỡ, mất — trừ khỏi tồn kho."
      dirty={JSON.stringify(form) !== pristine}
      busy={busy}
      blocker={writeoffBlocker(form)}
      error={error}
      onClose={onClose}
      onSave={() => submit({
        docDate: form.docDate || today, supplierName: null, note: form.note.trim(), paidStatus: null, paidMethod: null,
      }, form.drafts)}
    >
      <Field label="Ngày huỷ" htmlFor="inv-writeoff-date" hint={`Ghi lùi tối đa ${MAX_BACKDATE_DAYS} ngày`}>
        <Input id="inv-writeoff-date" type="date" value={form.docDate} min={addDaysIso(today, -MAX_BACKDATE_DAYS)} max={today}
          onChange={(e) => set({ docDate: e.target.value })} className="sm:max-w-56" />
      </Field>
      <Field label="Lý do" htmlFor="inv-writeoff-note" required>
        <Textarea id="inv-writeoff-note" value={form.note} maxLength={500} placeholder="Vỡ 2 lon khi chuyển két…"
          onChange={(e) => set({ note: e.target.value })} className="min-h-16" />
      </Field>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Hàng huỷ</h3>
        <LinesEditor kind="writeoff" items={items} drafts={form.drafts} onChange={(drafts) => set({ drafts })} />
      </section>
    </DocumentFormShell>
  )
}
