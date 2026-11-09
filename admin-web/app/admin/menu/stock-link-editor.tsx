'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { setMenuStockLink } from '@/lib/actions/inventory'
import { formatQty, parseQty, qtyWarning, type MenuStockData } from '@/lib/inventory'

type Link_ = MenuStockData['links'][number]
type Goods = MenuStockData['goods']

export type StockLinkItem = {
  id: string
  name: string
  menu_item_variants?: { id: string; name: string; sort_order?: number }[] | null
}

/** "Tiger lon × 3" — tên hàng + số trừ mỗi lần bán. */
export function linkSummary(goods: Goods, link: Link_): string {
  const name = goods.find((g) => g.id === link.inventoryItemId)?.name ?? 'Hàng đã ngừng dùng'
  return `${name} × ${formatQty(link.qtyPerSale)}`
}

/** Ô SL ban đầu: không dấu ngăn nghìn (1200 → "1200", 0,5 → "0,5") để parseQty đọc lại đúng số. */
const qtyInput = (n: number) => formatQty(n).replace(/\./g, '')

function LinkRow({ menuItemId, variantId, label, current, fallback, goods }: {
  menuItemId: string
  variantId: string | null
  /** null: món không có lựa chọn — tiêu đề khung đã nói "Trừ kho", không lặp nhãn. */
  label: string | null
  current: Link_ | undefined
  /** Biến thể chưa gắn riêng thì bán theo liên kết của cả món. */
  fallback: Link_ | undefined
  goods: Goods
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [inventoryItemId, setInventoryItemId] = useState(current?.inventoryItemId ?? '')
  const [qty, setQty] = useState(current ? qtyInput(current.qtyPerSale) : '1')
  const [error, setError] = useState<string | null>(null)
  const id = `stock-link-${menuItemId}-${variantId ?? 'all'}`
  const warning = qtyWarning(qty)

  const status = current
    ? linkSummary(goods, current)
    : fallback
      ? `Theo cả món (${linkSummary(goods, fallback)})`
      : 'Không trừ kho'

  const save = () => {
    if (!inventoryItemId) { setError('Chọn hàng hoá'); return }
    const n = parseQty(qty)
    if (n === null) { setError('Số lượng trừ phải lớn hơn 0, tối đa 3 chữ số thập phân'); return }
    setError(null)
    start(async () => {
      const res = await setMenuStockLink({ menuItemId, variantId, inventoryItemId, qty: n })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }
  const unlink = () => {
    setError(null)
    start(async () => {
      const res = await setMenuStockLink({ menuItemId, variantId, inventoryItemId: null, qty: null })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <li className="space-y-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {label ? <span className="text-sm font-medium text-foreground">{label}</span> : null}
        <span className={current ? 'text-[13px] font-medium text-foreground' : 'text-[13px] text-muted'}>{status}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_5.5rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_6rem_auto]">
        <div className="min-w-0">
          <label htmlFor={`${id}-item`} className="sr-only">Hàng trừ kho{label ? ` · ${label}` : ''}</label>
          <Select id={`${id}-item`} value={inventoryItemId} disabled={pending} onChange={(e) => setInventoryItemId(e.target.value)}>
            <option value="">— Chọn hàng —</option>
            {goods.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
          </Select>
        </div>
        <span className="text-sm text-muted" aria-hidden>×</span>
        <div className="min-w-0">
          <label htmlFor={`${id}-qty`} className="sr-only">Số lượng trừ mỗi lần bán{label ? ` · ${label}` : ''}</label>
          <Input id={`${id}-qty`} inputMode="decimal" autoComplete="off" value={qty} disabled={pending} aria-describedby={`${id}-msg`}
            onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="col-span-3 flex gap-2 sm:col-span-1">
          <Button variant="primary" onClick={save} isLoading={pending} className="flex-1 sm:flex-none">Lưu</Button>
          {current ? <Button onClick={unlink} disabled={pending} className="flex-1 sm:flex-none">Gỡ</Button> : null}
        </div>
      </div>
      <p id={`${id}-msg`} role={error ? 'alert' : undefined} className={error ? 'text-[13px] text-error-text' : 'text-[13px] text-warning'}>
        {error ?? warning ?? ''}
      </p>
    </li>
  )
}

/**
 * "Trừ kho khi bán" trong hộp sửa món (chủ quán) và hộp "Trừ kho" ở màn Tạm hết (quản lý).
 * Món có lựa chọn (biến thể): dòng "Cả món" + mỗi lựa chọn; lựa chọn chưa gắn riêng thì bán theo cả món.
 * Server (RPC inventory_set_menu_link) đóng liên kết cũ, mở liên kết mới — đơn đã bán giữ số cũ.
 */
export default function StockLinkEditor({ item, stock }: { item: StockLinkItem; stock: MenuStockData }) {
  const variants = (item.menu_item_variants ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const linkOf = (variantId: string | null) =>
    stock.links.find((l) => l.menuItemId === item.id && l.variantId === variantId)
  const itemLink = linkOf(null)
  // key theo liên kết hiện tại: lưu xong router.refresh() đổi liên kết → dòng dựng lại với số mới.
  const rowKey = (variantId: string | null) => {
    const l = linkOf(variantId)
    return `${variantId ?? 'all'}:${l?.inventoryItemId ?? ''}:${l?.qtyPerSale ?? ''}`
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">Trừ kho khi bán</h3>
      <p className="mb-3 text-[13px] text-muted">Chỉ hàng bán nguyên (bia, nước). Đổi số lượng không ảnh hưởng đơn đã bán.</p>
      {stock.goods.length === 0 ? (
        <p className="text-sm text-muted">
          Chưa có hàng bán nguyên — thêm ở trang Kho.{' '}
          <Link href="/admin/inventory" className="font-medium text-accent underline underline-offset-2">Mở trang Kho</Link>
        </p>
      ) : (
        <ul className="divide-y divide-border">
          <LinkRow key={rowKey(null)} menuItemId={item.id} variantId={null} label={variants.length > 0 ? 'Cả món' : null}
            current={itemLink} fallback={undefined} goods={stock.goods} />
          {variants.map((v) => (
            <LinkRow key={rowKey(v.id)} menuItemId={item.id} variantId={v.id} label={v.name}
              current={linkOf(v.id)} fallback={itemLink} goods={stock.goods} />
          ))}
        </ul>
      )}
    </div>
  )
}
