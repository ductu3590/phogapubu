'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Tabs } from '@/components/ui/tabs'
import { loadInventoryStock } from '@/lib/actions/inventory'
import {
  formatQty,
  KIND_LABEL,
  parseCountedQty,
  qtyWarning,
  type DraftLine,
  type InventoryKind,
  type StockRow,
} from '@/lib/inventory'
import { formatVndTyping } from '@/lib/money'
import { cn } from '@/lib/utils'
import { formatDocDate } from './doc-format'
import { DocumentFormShell, useDocumentSubmit } from './document-form'

type KindFilter = 'all' | InventoryKind
export type CountEntry = { counted: string; cost: string }
export type CountDraft = { kind: KindFilter; withCost: boolean; counts: Record<string, CountEntry> }

const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'goods', label: KIND_LABEL.goods },
  { value: 'ingredient', label: KIND_LABEL.ingredient },
]

const hasCount = (e: CountEntry | undefined) => !!e && e.counted.trim() !== ''

/**
 * Lý do chưa lưu được — null là lưu được. Xét MỌI hàng đang dùng (kể cả hàng bị lọc loại ẩn đi, vì số đã gõ ở đó vẫn
 * được lưu): số đếm sai thì nêu tên hàng (tối đa 3) để người dùng tìm ra mà sửa.
 */
export function countBlocker(counts: Record<string, CountEntry>, rows: { id: string; name: string }[]): string | null {
  const typed = rows.filter((r) => hasCount(counts[r.id]))
  const invalid = typed.filter((r) => parseCountedQty(counts[r.id].counted) === null).map((r) => r.name)
  if (invalid.length > 0) {
    return `Số đếm không hợp lệ: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`
  }
  return typed.length > 0 ? null : 'Nhập số đếm ít nhất một hàng'
}

/** RPC không trả số hàng lệch nên không đoán con số (tồn máy trên form có thể đã cũ). */
export function countSuccessTitle(docNo: string): string {
  return `Đã chốt ${docNo}`
}

/** Chênh lệch đếm − máy (null khi chưa đếm / số sai). Sai số thực dưới 0,0005 coi như khớp. */
function difference(entry: CountEntry | undefined, machine: number): { counted: number; diff: number } | 'invalid' | null {
  if (!hasCount(entry)) return null
  const counted = parseCountedQty(entry!.counted)
  if (counted === null) return 'invalid'
  const diff = counted - machine
  return { counted, diff: Math.abs(diff) < 0.0005 ? 0 : diff }
}

function DiffCell({ value }: { value: ReturnType<typeof difference> }) {
  if (value === null) return <span className="text-[13px] text-muted">Không kiểm</span>
  if (value === 'invalid') return <span className="text-[13px] text-critical">Số không hợp lệ</span>
  if (value.diff === 0) return <span className="text-sm text-muted">Khớp</span>
  return value.diff > 0
    ? <span className="text-sm font-semibold tabular-nums text-success">+{formatQty(value.diff)}</span>
    : <span className="text-sm font-semibold tabular-nums text-critical">{formatQty(value.diff)}</span>
}

/**
 * Phiếu kiểm kho: mỗi hàng đang dùng một dòng (máy · đếm · chênh), ô đếm để trống = không kiểm hàng đó.
 * Ngày cố định hôm nay (server chỉ nhận phiếu kiểm hôm nay). Bật "Kiểm đầu kỳ — nhập giá vốn" thì thêm ô đơn giá
 * (giá vốn đầu kỳ, spec §5). Tồn máy chỉ để nhìn: server tự chụp system_qty lúc bấm Lưu.
 */
export default function CountForm({ today, items, onClose, onSaved, initial }: {
  today: string
  items: StockRow[]
  onClose: () => void
  onSaved: () => void
  /** Giá trị ban đầu (test / mở lại form). */
  initial?: Partial<CountDraft>
}) {
  const [form, setForm] = useState<CountDraft>({ kind: 'all', withCost: false, counts: {}, ...initial })
  const [rows, setRows] = useState(items)

  // Mở form → lấy tồn máy mới nhất (khách có thể vừa gọi món). Lỗi thì giữ số đang có.
  useEffect(() => {
    let alive = true
    loadInventoryStock().then((res) => { if (alive && res.ok && res.rows.length > 0) setRows(res.rows) })
    return () => { alive = false }
  }, [])

  const active = rows.filter((r) => r.isActive)
  const visible = active.filter((r) => form.kind === 'all' || r.kind === form.kind)
  const machine = new Map(active.map((r) => [r.id, r.qty]))
  const entered = active.filter((r) => hasCount(form.counts[r.id])).length

  // Chỉ hàng còn trong danh sách đang dùng; lọc loại chỉ là cách xem, số đã gõ ở loại khác vẫn được lưu.
  const drafts: DraftLine[] = active
    .filter((r) => hasCount(form.counts[r.id]))
    .map((r) => ({ inventoryItemId: r.id, qty: '', countedQty: form.counts[r.id].counted, unitCost: form.withCost ? form.counts[r.id].cost : '' }))

  const { busy, error, submit } = useDocumentSubmit('count', today, onSaved, {
    withCost: form.withCost,
    successTitle: countSuccessTitle,
  })
  const setEntry = (id: string, patch: Partial<CountEntry>) =>
    setForm((f) => {
      const prev: CountEntry = f.counts[id] ?? { counted: '', cost: '' }
      return { ...f, counts: { ...f.counts, [id]: { ...prev, ...patch } } }
    })

  const cols = form.withCost
    ? 'md:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_8.5rem_6rem]'
    : 'md:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_6rem]'

  return (
    <DocumentFormShell
      title="Tạo phiếu kiểm kho"
      description={`Ngày ${formatDocDate(today)} · đếm thực tế, để trống hàng không kiểm.`}
      dirty={Object.values(form.counts).some((e) => e.counted.trim() !== '' || e.cost.trim() !== '')}
      busy={busy}
      blocker={countBlocker(form.counts, active)}
      error={error}
      onClose={onClose}
      onSave={() => submit({ docDate: today, supplierName: null, note: null, paidStatus: null, paidMethod: null }, drafts)}
    >
      <p className="text-[13px] text-muted">
        Tồn máy có thể đổi nếu đang có khách gọi món; số chốt tính theo lúc bấm Lưu.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs label="Lọc loại hàng" variant="segmented" items={KIND_TABS} value={form.kind}
          onValueChange={(kind) => setForm((f) => ({ ...f, kind }))} />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
          <Switch checked={form.withCost} onChange={(e) => setForm((f) => ({ ...f, withCost: e.target.checked }))} />
          Kiểm đầu kỳ — nhập giá vốn
        </label>
        <span className="text-[13px] text-muted md:ml-auto">Đã nhập {entered} / {active.length} hàng</span>
      </div>

      <div className={cn('hidden px-2 text-[13px] text-muted md:grid md:gap-3', cols)} aria-hidden>
        <span>Hàng hoá</span>
        <span className="text-right">Máy</span>
        <span>Đếm</span>
        {form.withCost ? <span>Giá vốn</span> : null}
        <span className="text-right">Chênh</span>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Không có hàng đang dùng ở loại này.</p>
      ) : (
        <ol className="space-y-2 md:space-y-0 md:divide-y md:divide-border">
          {visible.map((r) => {
            const entry = form.counts[r.id]
            const warning = qtyWarning(entry?.counted ?? '')
            return (
              <li key={r.id} className={cn('rounded-lg border border-border bg-surface p-3 md:grid md:items-start md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:px-2 md:py-2', cols)}>
                <div className="min-w-0 md:pt-2.5">
                  <p className="font-medium break-words">{r.name}</p>
                  <p className="text-[13px] text-muted">{r.unit} · {KIND_LABEL[r.kind]}</p>
                </div>
                {/* Dưới md: Máy | Đếm một hàng 2 cột; Giá vốn (kiểm đầu kỳ) một dòng riêng cho ô đủ rộng. */}
                <div className="mt-2 grid grid-cols-2 items-start gap-2 md:contents">
                  <p className="text-sm md:pt-2.5 md:text-right">
                    <span className="block text-[13px] text-muted md:hidden">Máy</span>
                    <span className={cn('tabular-nums', r.qty < 0 && 'text-critical')}>{formatQty(machine.get(r.id) ?? r.qty)}</span>
                  </p>
                  <div className="min-w-0">
                    <label htmlFor={`inv-count-qty-${r.id}`} className="mb-1 block text-[13px] text-muted md:sr-only">Đếm ({r.unit}) · {r.name}</label>
                    <Input id={`inv-count-qty-${r.id}`} inputMode="decimal" autoComplete="off" placeholder="—" value={entry?.counted ?? ''}
                      onChange={(e) => setEntry(r.id, { counted: e.target.value })} />
                    {warning ? <p className="mt-1 text-[13px] text-warning">{warning}</p> : null}
                  </div>
                  {form.withCost ? (
                    <div className="col-span-2 min-w-0 md:col-auto">
                      <label htmlFor={`inv-count-cost-${r.id}`} className="mb-1 block text-[13px] text-muted md:sr-only">Giá vốn · {r.name}</label>
                      <Input id={`inv-count-cost-${r.id}`} inputMode="numeric" autoComplete="off" placeholder="Không bắt buộc"
                        value={entry?.cost ?? ''} onChange={(e) => setEntry(r.id, { cost: formatVndTyping(e.target.value) })} />
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 flex items-center justify-between md:mt-0 md:block md:pt-2.5 md:text-right">
                  <span className="text-[13px] text-muted md:hidden">Chênh</span>
                  <DiffCell value={difference(entry, machine.get(r.id) ?? r.qty)} />
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </DocumentFormShell>
  )
}
