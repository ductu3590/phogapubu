'use client'

import { useState, useTransition } from 'react'
import { Search } from 'lucide-react'
import { setMenuItemAvailable } from '@/lib/actions/menu'
import { cn, formatVND } from '@/lib/utils'
import { stripVietnamese } from '@/lib/menu/sku'

type Item = { id: string; name: string; price: number; is_available: boolean; sku?: string | null }
type Category = { id: string; name: string; menu_items?: Item[] | null }

// Thực đơn cho THU NGÂN (PA-2): chỉ bật/tắt "Tạm hết". Không có nút thêm/sửa/xoá/kéo — server cũng
// không cho (RPC set_menu_item_available chỉ đổi is_available).
export default function MenuAvailabilityClient({ categories }: { categories: Category[] }) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.flatMap((c) => (c.menu_items ?? []).map((i) => [i.id, i.is_available]))))
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
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
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className={cn('min-w-0 truncate text-sm', state[i.id] ? 'text-foreground' : 'text-muted line-through')}>
                      {i.name} <span className="text-[13px] text-muted tabular">· {formatVND(i.price)}</span>
                      {i.sku && <span className="ml-1.5 font-mono text-xs text-muted">{i.sku}</span>}
                    </span>
                    <button type="button" disabled={pending} onClick={() => toggle(i.id)} aria-pressed={!state[i.id]}
                      className={cn('shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                        state[i.id] ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 text-red-700 hover:bg-red-100')}>
                      {state[i.id] ? 'Đang bán' : 'Tạm hết'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
