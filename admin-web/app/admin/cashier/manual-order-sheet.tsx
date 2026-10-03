'use client'

import { useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { PosManualItem } from '@/lib/actions/pos-order'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

export type PosTopping = { id: string; name: string; price: number }
export type PosVariant = { id: string; name: string; price: number }
export type PosMenuItem = {
  id: string
  name: string
  price: number
  toppings: PosTopping[]
  variants: PosVariant[]
  hasVariantGroup: boolean
}
export type PosMenuCategory = { id: string; name: string; items: PosMenuItem[] }

type DraftLine = PosManualItem & { lineId: string; name: string; unitPrice: number }

const dong = (n: number) => `${n.toLocaleString('vi-VN')}đ`

function Stepper({ value, onMinus, onPlus, label }: { value: number; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Số lượng ${label}`}>
      <IconButton icon={<Minus />} label={`Bớt ${label}`} onClick={onMinus} className="size-9 border border-border-strong md:size-9" />
      <span className="w-7 text-center text-sm font-semibold tabular">{value}</span>
      <IconButton icon={<Plus />} label={`Thêm ${label}`} onClick={onPlus} className="size-9 border border-border-strong md:size-9" />
    </div>
  )
}

export default function ManualOrderSheet({
  tableNumber,
  categories,
  busy,
  onClose,
  onSubmit,
}: {
  tableNumber: string
  categories: PosMenuCategory[]
  busy: boolean
  onClose: () => void
  onSubmit: (items: PosManualItem[], clientRequestId: string) => Promise<boolean>
}) {
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [selected, setSelected] = useState<PosMenuItem | null>(null)
  const requestId = useRef<string | null>(null)

  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi-VN')
    if (keyword) {
      return categories.flatMap((category) => category.items).filter((item) =>
        item.name.toLocaleLowerCase('vi-VN').includes(keyword),
      )
    }
    return categories.find((category) => category.id === activeCategory)?.items ?? []
  }, [activeCategory, categories, query])

  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)

  const addSimple = (item: PosMenuItem) => {
    setLines((previous) => [
      ...previous,
      {
        lineId: crypto.randomUUID(),
        menu_item_id: item.id,
        name: item.name,
        quantity: 1,
        unitPrice: item.price,
        topping_ids: [],
        variant_id: null,
        note: null,
      },
    ])
    requestId.current = null
  }

  const changeQuantity = (lineId: string, delta: number) => {
    setLines((previous) =>
      previous
        .map((line) => (line.lineId === lineId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    )
    requestId.current = null
  }

  const submit = async () => {
    if (lines.length === 0 || busy) return
    if (!requestId.current) requestId.current = crypto.randomUUID()
    const ok = await onSubmit(
      lines.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
        variant_id: line.variant_id ?? null,
        topping_ids: line.topping_ids ?? [],
        note: line.note ?? null,
      })),
      requestId.current,
    )
    if (ok) onClose()
  }

  return (
    <>
      <Dialog
        open
        // Đang có món nháp thì không đóng khi bấm ra ngoài — mất giỏ nháp là mất công gõ lại.
        dismissible={!busy && lines.length === 0}
        onClose={() => { if (!busy) onClose() }}
        title={`Thêm món tay · ${tableNumber}`}
        description="Món chỉ bổ sung vào bill, không gửi thông báo bếp."
        className="max-w-2xl sm:max-w-2xl"
        footer={
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Tạm tính</span>
              <b className="text-lg font-semibold tabular">{dong(total)}</b>
            </div>
            <Button variant="primary" size="touch" isLoading={busy} onClick={() => void submit()} disabled={lines.length === 0} className="w-full">
              Thêm vào bill · không báo bếp
            </Button>
          </div>
        }
      >
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm món..." aria-label="Tìm món" type="search" />
        {!query && (
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Danh mục">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  'h-9 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activeCategory === category.id ? 'bg-primary-light text-primary' : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground',
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        {visibleItems.length === 0 ? (
          <EmptyState>{query ? 'Không có món nào khớp từ khoá này.' : 'Danh mục này chưa có món đang bán.'}</EmptyState>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleItems.map((item) => {
              const soldOut = item.hasVariantGroup && item.variants.length === 0
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.hasVariantGroup || item.toppings.length > 0) setSelected(item)
                    else addSimple(item)
                  }}
                  disabled={soldOut}
                  className="cursor-pointer rounded-xl border border-border-strong bg-surface p-3 text-left text-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block font-medium text-foreground">{item.name}</span>
                  <span className="mt-1 block text-[13px] text-muted tabular">{dong(item.price)}</span>
                  {soldOut && <span className="mt-1 block text-[13px] text-critical">Tạm hết lựa chọn</span>}
                </button>
              )
            })}
          </div>
        )}

        {lines.length > 0 && (
          <div className="mt-5 border-t border-border pt-3">
            <p className="text-sm font-semibold text-foreground">Món bổ sung</p>
            <ul className="mt-2 divide-y divide-border">
              {lines.map((line) => (
                <li key={line.lineId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{line.name}</p>
                    <p className="text-[13px] text-muted tabular">{dong(line.unitPrice)} / phần</p>
                  </div>
                  <Stepper value={line.quantity} label={line.name} onMinus={() => changeQuantity(line.lineId, -1)} onPlus={() => changeQuantity(line.lineId, 1)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog>

      {selected && (
        <ItemOptions
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={(line) => {
            setLines((previous) => [...previous, line])
            requestId.current = null
            setSelected(null)
          }}
        />
      )}
    </>
  )
}

function ItemOptions({ item, onClose, onAdd }: { item: PosMenuItem; onClose: () => void; onAdd: (line: DraftLine) => void }) {
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? '')
  const [toppingIds, setToppingIds] = useState<string[]>([])
  const [quantity, setQuantity] = useState(1)
  const variant = item.variants.find((option) => option.id === variantId) ?? null
  const selectedToppings = item.toppings.filter((topping) => toppingIds.includes(topping.id))
  const price = item.price + (variant?.price ?? 0) + selectedToppings.reduce((sum, topping) => sum + topping.price, 0)

  const toggleTopping = (id: string) => setToppingIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id])

  return (
    <Dialog
      open
      onClose={onClose}
      title={item.name}
      footer={
        <Button
          variant="primary"
          size="touch"
          className="w-full"
          disabled={item.hasVariantGroup && !variant}
          onClick={() => onAdd({ lineId: crypto.randomUUID(), menu_item_id: item.id, name: item.name + (variant ? ` (${variant.name})` : ''), quantity, unitPrice: price, variant_id: variant?.id ?? null, topping_ids: toppingIds, note: null })}
        >
          Thêm · {dong(price * quantity)}
        </Button>
      }
    >
      {item.hasVariantGroup && <>
        <p className="text-sm font-medium text-foreground">Chọn loại</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {item.variants.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={variantId === option.id}
              onClick={() => setVariantId(option.id)}
              className={cn(
                'cursor-pointer rounded-lg border p-2.5 text-left text-sm transition-colors',
                variantId === option.id ? 'border-primary bg-primary-light' : 'border-border-strong hover:bg-surface-hover',
              )}
            >
              <span className="font-medium text-foreground">{option.name}</span>
              <span className="block text-[13px] text-muted tabular">+{dong(option.price)}</span>
            </button>
          ))}
        </div>
      </>}
      {item.toppings.length > 0 && <>
        <p className={cn('text-sm font-medium text-foreground', item.hasVariantGroup && 'mt-4')}>Topping</p>
        <div className="mt-2 divide-y divide-border">
          {item.toppings.map((topping) => (
            <label key={topping.id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={toppingIds.includes(topping.id)} onChange={() => toggleTopping(topping.id)} className="size-4 accent-[var(--primary)]" />
                {topping.name}
              </span>
              <span className="text-[13px] text-muted tabular">+{dong(topping.price)}</span>
            </label>
          ))}
        </div>
      </>}
      <div className="mt-5 flex items-center justify-between">
        <span className="text-sm text-muted">Số lượng</span>
        <Stepper value={quantity} label={item.name} onMinus={() => setQuantity((value) => Math.max(1, value - 1))} onPlus={() => setQuantity((value) => value + 1)} />
      </div>
    </Dialog>
  )
}
