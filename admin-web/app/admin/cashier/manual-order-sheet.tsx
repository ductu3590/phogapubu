'use client'

import { useMemo, useRef, useState } from 'react'
import type { PosManualItem } from '@/lib/actions/pos-order'

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <section className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900">Thêm món tay · {tableNumber}</h2>
            <p className="mt-0.5 text-xs text-amber-700">Món chỉ bổ sung vào bill, không gửi thông báo bếp.</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded p-1 text-xl text-gray-400 hover:bg-gray-100">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm món..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          {!query && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    activeCategory === category.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.hasVariantGroup || item.toppings.length > 0) setSelected(item)
                  else addSimple(item)
                }}
                disabled={item.hasVariantGroup && item.variants.length === 0}
                className="rounded-xl border border-gray-200 p-3 text-left text-sm hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="block font-semibold text-gray-800">{item.name}</span>
                <span className="mt-1 block text-xs text-orange-600">{dong(item.price)}</span>
                {item.hasVariantGroup && item.variants.length === 0 && <span className="mt-1 block text-[10px] text-red-500">Tạm hết lựa chọn</span>}
              </button>
            ))}
          </div>

          {lines.length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Món bổ sung</p>
              <ul className="mt-2 space-y-2">
                {lines.map((line) => (
                  <li key={line.lineId} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0"><p className="truncate font-medium text-gray-800">{line.name}</p><p className="text-xs text-gray-500">{dong(line.unitPrice)} / phần</p></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQuantity(line.lineId, -1)} className="h-7 w-7 rounded border border-gray-200 font-bold">−</button>
                      <span className="w-4 text-center font-semibold">{line.quantity}</span>
                      <button onClick={() => changeQuantity(line.lineId, 1)} className="h-7 w-7 rounded border border-gray-200 font-bold">+</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 p-4">
          <div className="mb-3 flex justify-between text-sm"><span className="text-gray-500">Tạm tính</span><b>{dong(total)}</b></div>
          <button
            onClick={() => void submit()}
            disabled={busy || lines.length === 0}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Đang thêm...' : 'Thêm vào bill · không báo bếp'}
          </button>
        </footer>
      </section>

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
    </div>
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <section className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex justify-between gap-3"><h3 className="font-bold text-gray-900">{item.name}</h3><button onClick={onClose} className="text-xl text-gray-400">×</button></div>
        {item.hasVariantGroup && <>
          <p className="mt-4 text-xs font-bold text-gray-500">CHỌN LOẠI</p>
          <div className="mt-2 grid grid-cols-2 gap-2">{item.variants.map((option) => <button key={option.id} onClick={() => setVariantId(option.id)} className={`rounded-lg border p-2 text-left text-sm ${variantId === option.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}><span className="font-medium">{option.name}</span><span className="block text-xs text-orange-600">+{dong(option.price)}</span></button>)}</div>
        </>}
        {item.toppings.length > 0 && <>
          <p className="mt-4 text-xs font-bold text-gray-500">TOPPING</p>
          <div className="mt-2 space-y-1">{item.toppings.map((topping) => <label key={topping.id} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 hover:bg-gray-50"><span className="flex items-center gap-2"><input type="checkbox" checked={toppingIds.includes(topping.id)} onChange={() => toggleTopping(topping.id)} />{topping.name}</span><span className="text-xs text-orange-600">+{dong(topping.price)}</span></label>)}</div>
        </>}
        <div className="mt-5 flex items-center justify-between"><span className="text-sm text-gray-500">Số lượng</span><div className="flex items-center gap-3"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="h-8 w-8 rounded border">−</button><b>{quantity}</b><button onClick={() => setQuantity((value) => value + 1)} className="h-8 w-8 rounded border">+</button></div></div>
        <button onClick={() => onAdd({ lineId: crypto.randomUUID(), menu_item_id: item.id, name: item.name + (variant ? ` (${variant.name})` : ''), quantity, unitPrice: price, variant_id: variant?.id ?? null, topping_ids: toppingIds, note: null })} disabled={item.hasVariantGroup && !variant} className="mt-5 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white disabled:opacity-50">Thêm · {dong(price * quantity)}</button>
      </section>
    </div>
  )
}
