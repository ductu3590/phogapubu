'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import {
  KIND_LABEL,
  lineAmount,
  parseQty,
  qtyWarning,
  type DocKind,
  type DraftLine,
  type InventoryKind,
  type StockRow,
} from '@/lib/inventory'
import { formatVndTyping, parseVnd } from '@/lib/money'
import { cn, formatVND } from '@/lib/utils'

export const emptyDraft = (): DraftLine => ({ inventoryItemId: '', qty: '', unitCost: '', countedQty: '' })

const KIND_ORDER: InventoryKind[] = ['goods', 'ingredient']

/**
 * Bảng dòng phiếu: thêm / xoá dòng, chọn hàng đang dùng (nhóm theo loại), số lượng, đơn giá.
 * Dùng cho phiếu nhập (SL + đơn giá + thành tiền), phiếu huỷ (SL), phiếu kiểm (SL đếm, đơn giá khi `withCost`).
 * Ô số lượng đọc bằng parseQty (không có dấu ngăn nghìn) và luôn hiện qtyWarning ngay dưới; ô tiền là formatVndTyping
 * / parseVnd ("10.500" = mười nghìn rưỡi). Dưới md mỗi dòng xếp dọc.
 */
export default function LinesEditor({ kind, items, drafts, onChange, withCost = false }: {
  kind: DocKind
  items: StockRow[]
  drafts: DraftLine[]
  onChange: (drafts: DraftLine[]) => void
  withCost?: boolean
}) {
  const isCount = kind === 'count'
  const showCost = kind === 'receipt' || (isCount && withCost)
  const showAmount = kind === 'receipt'
  const qtyKey: 'qty' | 'countedQty' = isCount ? 'countedQty' : 'qty'
  const active = items.filter((i) => i.isActive)
  const byId = new Map(items.map((i) => [i.id, i]))

  const update = (index: number, patch: Partial<DraftLine>) =>
    onChange(drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  const remove = (index: number) => onChange(drafts.filter((_, i) => i !== index))
  const add = () => onChange([...drafts, emptyDraft()])

  const amountOf = (d: DraftLine): number | null => {
    const qty = parseQty(d.qty)
    const cost = parseVnd(d.unitCost)
    return qty !== null && cost !== null ? lineAmount(qty, cost) : null
  }
  const total = drafts.reduce((sum, d) => sum + (d.inventoryItemId ? amountOf(d) ?? 0 : 0), 0)

  const cols = cn(
    'md:grid md:items-start md:gap-2',
    showCost && showAmount && 'md:grid-cols-[minmax(0,1fr)_7rem_8.5rem_7.5rem_2.75rem]',
    showCost && !showAmount && 'md:grid-cols-[minmax(0,1fr)_7rem_8.5rem_2.75rem]',
    !showCost && 'md:grid-cols-[minmax(0,1fr)_8rem_2.75rem]',
  )

  return (
    <div className="space-y-2">
      <div className={cn('hidden px-1 text-[13px] text-muted', cols)} aria-hidden>
        <span>Hàng hoá</span>
        <span>{isCount ? 'SL đếm' : 'Số lượng'}</span>
        {showCost ? <span>Đơn giá</span> : null}
        {showAmount ? <span className="text-right">Thành tiền</span> : null}
        <span />
      </div>

      <ol className="space-y-2">
        {drafts.map((d, index) => {
          const n = index + 1
          const item = byId.get(d.inventoryItemId)
          const warning = qtyWarning(d[qtyKey])
          const amount = showAmount ? amountOf(d) : null
          return (
            <li key={index} className={cn('rounded-lg border border-border bg-surface p-3 md:border-0 md:bg-transparent md:p-1', cols)}>
              <div className="min-w-0">
                <label className="mb-1 block text-[13px] text-muted md:sr-only" htmlFor={`inv-line-item-${index}`}>Dòng {n} · Hàng hoá</label>
                <Select id={`inv-line-item-${index}`} value={d.inventoryItemId} onChange={(e) => update(index, { inventoryItemId: e.target.value })}>
                  <option value="">Chọn hàng…</option>
                  {KIND_ORDER.map((k) => {
                    const group = active.filter((i) => i.kind === k)
                    return group.length > 0 ? (
                      <optgroup key={k} label={KIND_LABEL[k]}>
                        {group.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                      </optgroup>
                    ) : null
                  })}
                </Select>
              </div>

              <div className={cn('mt-2 grid gap-2 md:contents', showCost ? 'grid-cols-2' : 'grid-cols-1')}>
                <div className="min-w-0">
                  <label className="mb-1 block text-[13px] text-muted md:sr-only" htmlFor={`inv-line-qty-${index}`}>
                    {isCount ? 'SL đếm' : 'Số lượng'}{item ? ` (${item.unit})` : ''} · dòng {n}
                  </label>
                  <Input id={`inv-line-qty-${index}`} inputMode="decimal" autoComplete="off" value={d[qtyKey]}
                    placeholder={isCount ? '0' : '1,5'}
                    onChange={(e) => update(index, isCount ? { countedQty: e.target.value } : { qty: e.target.value })} />
                  {warning ? <p className="mt-1 text-[13px] text-warning">{warning}</p> : null}
                </div>
                {showCost ? (
                  <div className="min-w-0">
                    <label className="mb-1 block text-[13px] text-muted md:sr-only" htmlFor={`inv-line-cost-${index}`}>Đơn giá · dòng {n}</label>
                    <Input id={`inv-line-cost-${index}`} inputMode="numeric" autoComplete="off" value={d.unitCost}
                      placeholder={isCount ? 'Không bắt buộc' : '10.500'}
                      onChange={(e) => update(index, { unitCost: formatVndTyping(e.target.value) })} />
                  </div>
                ) : null}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 md:contents">
                {showAmount ? (
                  <p className="text-sm tabular-nums md:pt-2.5 md:text-right">
                    <span className="text-muted md:hidden">Thành tiền </span>
                    <span className="font-semibold">{amount === null ? '—' : formatVND(amount)}</span>
                  </p>
                ) : <span className="md:hidden" />}
                <IconButton icon={<Trash2 />} label={`Xoá dòng ${n}`} onClick={() => remove(index)} />
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button icon={<Plus />} onClick={add}>Thêm dòng</Button>
        {showAmount ? (
          <p className="text-sm">
            <span className="text-muted">Tổng tiền hàng </span>
            <span className="text-base font-semibold tabular-nums">{formatVND(total)}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
