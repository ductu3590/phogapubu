'use client'

import { useState, useTransition } from 'react'
import { PackageMinus, Search } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { setMenuItemAvailable } from '@/lib/actions/menu'
import type { MenuStockData } from '@/lib/inventory'
import { cn, formatVND } from '@/lib/utils'
import { stripVietnamese } from '@/lib/menu/sku'
import StockLinkEditor, { linkSummary } from './stock-link-editor'

type Item = {
  id: string
  name: string
  price: number
  is_available: boolean
  sku?: string | null
  /** Chỉ có khi trang tải cho quản lý (ô Trừ kho theo từng lựa chọn). */
  menu_item_variants?: { id: string; name: string; sort_order?: number }[] | null
}
type Category = { id: string; name: string; menu_items?: Item[] | null }

// Thực đơn cho THU NGÂN (PA-2) + QUẢN LÝ (mig 116): bật/tắt "Tạm hết". Không có nút thêm/sửa/xoá/kéo — server cũng
// không cho (RPC set_menu_item_available chỉ đổi is_available).
// Có `stock` (chỉ quản lý — trang gọi readMenuStock khi isBackOfficeRole): mỗi món thêm nút "Trừ kho" mở hộp gắn món với
// hàng bán nguyên. Thu ngân không có `stock` → không thấy gì mới.
export default function MenuAvailabilityClient({ categories, stock }: { categories: Category[]; stock?: MenuStockData | null }) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.flatMap((c) => (c.menu_items ?? []).map((i) => [i.id, i.is_available]))))
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [stockItem, setStockItem] = useState<Item | null>(null)
  // Tìm không dấu theo tên, hoặc theo mã món (PA-4).
  const needle = stripVietnamese(q.trim()).toLowerCase()

  const toggle = (id: string) => {
    const next = !state[id]
    setState((s) => ({ ...s, [id]: next }))
    setError(null)
    start(async () => {
      const res = await setMenuItemAvailable(id, next)
      if (!res.ok) { setState((s) => ({ ...s, [id]: !next })); setError(res.error) }
    })
  }

  /** Dòng phụ "Trừ kho: Tiger lon × 3" (liên kết cả món; chỉ gắn theo lựa chọn thì báo số lựa chọn). */
  const stockCaption = (i: Item): string | null => {
    if (!stock) return null
    const own = stock.links.filter((l) => l.menuItemId === i.id)
    const whole = own.find((l) => l.variantId === null)
    if (whole) return `Trừ kho: ${linkSummary(stock.goods, whole)}`
    if (own.length > 0) return `Trừ kho theo ${own.length} lựa chọn`
    return null
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <label className="mb-4 flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Search className="size-4 text-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên hoặc mã món…" aria-label="Tìm món" className="w-full bg-transparent text-sm outline-none" />
      </label>
      {error && <p role="alert" className="mb-3 text-sm text-error-text">{error}</p>}
      <div className="space-y-5">
        {categories.map((c) => {
          const items = (c.menu_items ?? []).filter((i) => !needle || stripVietnamese(i.name).toLowerCase().includes(needle) || (i.sku ?? '').toLowerCase().includes(needle))
          if (items.length === 0) return null
          return (
            <section key={c.id}>
              <h2 className="mb-2 text-sm font-semibold text-foreground">{c.name}</h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {items.map((i) => {
                  const caption = stockCaption(i)
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', state[i.id] ? 'text-foreground' : 'text-muted line-through')}>
                          {i.name} <span className="text-[13px] text-muted tabular">· {formatVND(i.price)}</span>
                          {i.sku && <span className="ml-1.5 font-mono text-xs text-muted">{i.sku}</span>}
                        </span>
                        {caption ? <span className="block truncate text-[13px] text-muted">{caption}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {stock ? (
                          <button type="button" onClick={() => setStockItem(i)} aria-label={`Trừ kho: ${i.name}`}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground hover:bg-foreground/5 md:min-h-9">
                            <PackageMinus className="size-4" aria-hidden />Trừ kho
                          </button>
                        ) : null}
                        <button type="button" disabled={pending} onClick={() => toggle(i.id)} aria-pressed={!state[i.id]}
                          className={cn('shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                            stock && 'min-h-11 md:min-h-9',
                            state[i.id] ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100')}>
                          {state[i.id] ? 'Đang bán' : 'Tạm hết'}
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      {stock && stockItem ? (
        <Dialog open placement="side" onClose={() => setStockItem(null)} title={`Trừ kho · ${stockItem.name}`}
          description="Bán món này thì kho tự trừ hàng bán nguyên đã gắn.">
          <StockLinkEditor item={stockItem} stock={stock} />
        </Dialog>
      ) : null}
    </div>
  )
}
