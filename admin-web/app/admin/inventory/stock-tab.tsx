'use client'

import { useMemo, useState } from 'react'
import { ArchiveX, Pencil, Plus, RotateCcw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { loadInventoryStock, setInventoryItemActive } from '@/lib/actions/inventory'
import { filterStockRows, formatQty, KIND_LABEL, stockStatus, type InventoryKind, type StockRow } from '@/lib/inventory'
import { cn, formatVND } from '@/lib/utils'
import ConfirmDialog from '../pos/confirm-dialog'
import ItemDialog from './item-dialog'

type KindFilter = 'all' | InventoryKind

const KIND_TABS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'goods', label: KIND_LABEL.goods },
  { value: 'ingredient', label: KIND_LABEL.ingredient },
]

const money = (n: number | null) => (n === null ? '—' : formatVND(n))

/** Câu xác nhận ngừng dùng; còn tồn ≠ 0 thì nhắc kiểm về 0 trước (hàng ngừng dùng không kiểm kho được nữa). Vẫn cho ngừng. */
export function deactivateDescription(row: Pick<StockRow, 'qty' | 'unit'>): string {
  const base = 'Hàng sẽ ẩn khỏi phiếu mới; món đang trừ kho hàng này sẽ thôi trừ.'
  if (Math.abs(row.qty) < 0.0005) return base
  return `Còn tồn ${formatQty(row.qty)} ${row.unit} — nên kiểm kho về 0 trước khi ngừng dùng. ${base}`
}

/** Màu trạng thái luôn kèm chữ (design system 2026-10-02): đỏ "Âm kho", vàng "Sắp hết". */
function StockBadges({ row }: { row: StockRow }) {
  const status = stockStatus(row.qty, row.minStock)
  return (
    <>
      {status === 'negative' ? <Badge tone="critical" withDot>Âm kho</Badge> : null}
      {status === 'low' ? <Badge tone="warning" withDot>Sắp hết</Badge> : null}
      {!row.isActive ? <Badge tone="neutral">Ngừng dùng</Badge> : null}
    </>
  )
}

function Qty({ row, className }: { row: StockRow; className?: string }) {
  return (
    <span className={cn('tabular-nums', row.qty < 0 && 'text-critical', className)}>
      <span>{formatQty(row.qty)}</span>
      <span className="ml-1 text-[13px] font-normal text-muted">{row.unit}</span>
    </span>
  )
}

/**
 * Tab Tồn kho. Dưới md là danh sách thẻ, từ md là bảng (không cuộn ngang trang ở 375px).
 * Danh sách giữ trong state để lưu xong thay ngay bằng kết quả loadInventoryStock; trang tải lại (revalidate) thì
 * nhận `rows` mới từ server.
 */
export default function StockTab({ rows, canEdit, onOpenLedger }: {
  rows: StockRow[]
  canEdit: boolean
  /** Bấm tên hàng mở thẻ kho (Task 8). Bỏ trống thì tên chỉ là chữ. */
  onOpenLedger?: (row: StockRow) => void
}) {
  const toast = useToast()
  // Giá vốn / giá trị tồn là số liệu hậu cần: chỉ chủ quán + quản lý thấy (thu ngân chỉ xem số lượng).
  const showMoney = canEdit
  const [list, setList] = useState(rows)
  const [prevRows, setPrevRows] = useState(rows)
  if (rows !== prevRows) {
    setPrevRows(rows)
    setList(rows)
  }
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  // undefined = đóng; null = thêm mới; StockRow = sửa.
  const [editing, setEditing] = useState<StockRow | null | undefined>(undefined)
  const [deactivating, setDeactivating] = useState<StockRow | null>(null)
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => filterStockRows(list, { query, kind, showInactive }), [list, query, kind, showInactive])
  const totalValue = visible.reduce((sum, r) => sum + r.stockValue, 0)
  const filtered = query.trim() !== '' || kind !== 'all'

  async function reload() {
    const res = await loadInventoryStock()
    if (res.ok) setList(res.rows)
    else toast({ tone: 'error', title: 'Không tải lại được tồn kho', description: res.error })
  }

  async function deactivate() {
    if (!deactivating || busy) return
    setBusy(true)
    const res = await setInventoryItemActive(deactivating.id, false)
    setBusy(false)
    if (!res.ok) {
      toast({ tone: 'error', title: 'Không ngừng dùng được', description: res.error })
      return
    }
    toast({
      tone: 'success',
      title: `Đã ngừng dùng ${deactivating.name}`,
      description: res.linksClosed > 0 ? `Đã gỡ ${res.linksClosed} món đang trừ kho hàng này` : undefined,
    })
    setDeactivating(null)
    await reload()
  }

  async function reactivate(row: StockRow) {
    if (busy) return
    setBusy(true)
    const res = await setInventoryItemActive(row.id, true)
    setBusy(false)
    if (!res.ok) {
      toast({ tone: 'error', title: 'Không dùng lại được', description: res.error })
      return
    }
    toast({ tone: 'success', title: `Đã dùng lại ${row.name}` })
    await reload()
  }

  const nameCell = (row: StockRow, className?: string) =>
    onOpenLedger ? (
      <button type="button" onClick={() => onOpenLedger(row)} aria-label={`Xem thẻ kho ${row.name}`}
        className={cn('cursor-pointer text-left font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline', className)}>
        {row.name}
      </button>
    ) : (
      <span className={cn('font-medium text-foreground', className)}>{row.name}</span>
    )

  const actions = (row: StockRow) =>
    row.isActive ? (
      <>
        <IconButton icon={<Pencil />} label={`Sửa ${row.name}`} onClick={() => setEditing(row)} />
        <IconButton icon={<ArchiveX />} label={`Ngừng dùng ${row.name}`} onClick={() => setDeactivating(row)} />
      </>
    ) : (
      <>
        <IconButton icon={<Pencil />} label={`Sửa ${row.name}`} onClick={() => setEditing(row)} />
        <IconButton icon={<RotateCcw />} label={`Dùng lại ${row.name}`} onClick={() => reactivate(row)} disabled={busy} />
      </>
    )

  return (
    <section aria-label="Tồn kho" className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Tìm hàng hoá" placeholder="Tìm theo tên hoặc mã" value={query}
            onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tabs label="Lọc loại hàng" variant="segmented" items={KIND_TABS} value={kind} onValueChange={setKind} />
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
            <Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Hiện hàng ngừng dùng
          </label>
        </div>
        {canEdit ? (
          <Button variant="primary" icon={<Plus />} onClick={() => setEditing(null)} className="md:ml-auto">
            Thêm hàng hoá
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <EmptyState className="rounded-xl border border-border bg-surface">
          Chưa có hàng hoá nào.{canEdit ? ' Bấm “Thêm hàng hoá” để bắt đầu.' : ''}
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState
          className="rounded-xl border border-border bg-surface"
          action={filtered ? (
            <button type="button" className="cursor-pointer font-medium text-accent underline underline-offset-2"
              onClick={() => { setQuery(''); setKind('all') }}>
              Xoá lọc
            </button>
          ) : undefined}
        >
          {filtered ? 'Không có hàng hoá khớp bộ lọc.' : 'Không có hàng hoá đang dùng.'}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Dưới md: thẻ */}
          <ul className="divide-y divide-border md:hidden">
            {visible.map((row) => (
              <li key={row.id} className={cn('px-4 py-3', !row.isActive && 'bg-background')}>
                {/* Có thẻ kho: cả phần trên của thẻ (tên, số, tồn) là MỘT nút cao ≥ 44px — chỉ tên chữ thì quá nhỏ để chạm.
                    Nút Sửa / Ngừng dùng nằm ngoài nút này (không lồng nút trong nút). */}
                {onOpenLedger ? (
                  <button type="button" onClick={() => onOpenLedger(row)} aria-label={`Xem thẻ kho ${row.name}`}
                    className="-mx-2 -my-1 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-start justify-between gap-3 rounded-lg px-2 py-1 text-left outline-hidden hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-focus">
                    <span className="min-w-0">
                      <span className="block font-medium break-words text-foreground">{row.name}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {KIND_LABEL[row.kind]}{showMoney ? ` · Giá vốn ${money(row.lastUnitCost)} · Giá trị ${formatVND(row.stockValue)}` : ''}
                      </span>
                    </span>
                    <Qty row={row} className="shrink-0 text-lg font-semibold" />
                  </button>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {nameCell(row, 'block break-words')}
                      <p className="mt-0.5 text-[13px] text-muted">
                        {KIND_LABEL[row.kind]}{showMoney ? ` · Giá vốn ${money(row.lastUnitCost)} · Giá trị ${formatVND(row.stockValue)}` : ''}
                      </p>
                    </div>
                    <Qty row={row} className="shrink-0 text-lg font-semibold" />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StockBadges row={row} />
                  {canEdit ? (
                    <div className="ml-auto flex items-center gap-1">
                      <Button variant="ghost" icon={<Pencil />} onClick={() => setEditing(row)}>Sửa</Button>
                      {row.isActive ? (
                        <Button variant="ghost" icon={<ArchiveX />} onClick={() => setDeactivating(row)}>Ngừng dùng</Button>
                      ) : (
                        <Button variant="ghost" icon={<RotateCcw />} onClick={() => reactivate(row)} disabled={busy}>Dùng lại</Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {/* Từ md: bảng */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-border bg-background text-left text-[13px] text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Tên</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Đơn vị</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Loại</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Tồn</th>
                {showMoney ? <th scope="col" className="px-3 py-2.5 text-right font-medium">Giá vốn gần nhất</th> : null}
                {showMoney ? <th scope="col" className="px-3 py-2.5 text-right font-medium">Giá trị tồn</th> : null}
                {canEdit ? <th scope="col" className="px-3 py-2.5"><span className="sr-only">Thao tác</span></th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((row) => (
                <tr key={row.id} className={cn(!row.isActive && 'bg-background text-foreground/70')}>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {nameCell(row)}
                      <StockBadges row={row} />
                    </div>
                    {row.sku ? <p className="text-[13px] text-muted">{row.sku}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 text-foreground/80">{row.unit}</td>
                  <td className="px-3 py-2.5 text-foreground/80">{KIND_LABEL[row.kind]}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    <span className={cn('tabular-nums', row.qty < 0 && 'text-critical')}>{formatQty(row.qty)}</span>
                  </td>
                  {showMoney ? <td className="px-3 py-2.5 text-right tabular-nums">{money(row.lastUnitCost)}</td> : null}
                  {showMoney ? <td className="px-3 py-2.5 text-right tabular-nums">{formatVND(row.stockValue)}</td> : null}
                  {canEdit ? (
                    <td className="px-2 py-1">
                      <div className="flex justify-end">{actions(row)}</div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          {showMoney ? (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-2.5 text-sm">
              <span className="text-muted">Tổng giá trị tồn · {visible.length} hàng</span>
              <span className="font-semibold tabular-nums text-foreground">{formatVND(totalValue)}</span>
            </div>
          ) : null}
        </div>
      )}

      {editing !== undefined ? (
        <ItemDialog
          key={editing?.id ?? 'new'}
          item={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => { setEditing(undefined); await reload() }}
        />
      ) : null}

      {deactivating ? (
        <ConfirmDialog
          open
          title={`Ngừng dùng ${deactivating.name}?`}
          description={deactivateDescription(deactivating)}
          confirmLabel="Ngừng dùng"
          tone="danger"
          busy={busy}
          onConfirm={deactivate}
          onCancel={() => setDeactivating(null)}
        />
      ) : null}
    </section>
  )
}
