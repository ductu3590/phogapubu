'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Plus, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getButtonClasses } from '@/components/ui/button-classes'
import { Banner } from '@/components/ui/feedback'
import { Select } from '@/components/ui/field'
import { Tabs } from '@/components/ui/tabs'
import { voidCashBookEntry } from '@/lib/actions/cash-book'
import {
  cashEntryVoidable, filtersToSearch, type CashBookCategory, type CashBookEntry, type CashBookKind, type CashBookMethod, type CashBookTotals,
  type CashbookFilters,
} from '@/lib/cash-book'
import { shiftDateTimeLabel } from '@/lib/cash-shift'
import { cn, formatVND } from '@/lib/utils'
import ConfirmDialog from '../pos/confirm-dialog'
import CategoriesDialog from './categories-dialog'
import EntryFormDialog from './entry-form-dialog'

// Sổ thu chi (mig 122). Mọi con số lấy nguyên từ cash_book_list; ở đây chỉ hiển thị. Chủ quán + quản lý ghi / huỷ /
// sửa danh mục (canManage); thu ngân chỉ xem phiếu của mình (server đã lọc) — ẩn nút chỉ là giao diện, RPC tự chặn.

export type CashbookList = { entries: CashBookEntry[]; totals: CashBookTotals; truncated: boolean }

const signedVnd = (n: number) => (n > 0 ? `+${formatVND(n)}` : n < 0 ? `−${formatVND(-n)}` : formatVND(0))
const entryAmount = (e: Pick<CashBookEntry, 'kind' | 'amount'>) => `${e.kind === 'receipt' ? '+' : '−'}${formatVND(e.amount)}`

export function CashbookTotalsCards({ totals: t }: { totals: CashBookTotals }) {
  const cards = [
    { label: 'Tổng thu', value: formatVND(t.receiptTotal), cash: formatVND(t.receiptCash), bank: formatVND(t.receiptBank), tone: 'text-emerald-700' },
    { label: 'Tổng chi', value: formatVND(t.paymentTotal), cash: formatVND(t.paymentCash), bank: formatVND(t.paymentBank), tone: 'text-foreground' },
    {
      label: 'Chênh lệch', value: signedVnd(t.net), cash: signedVnd(t.receiptCash - t.paymentCash),
      bank: signedVnd(t.receiptBank - t.paymentBank), tone: t.net < 0 ? 'text-red-700' : 'text-emerald-700',
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-muted">{c.label}</p>
          <p className={cn('tabular mt-1 text-xl font-bold', c.tone)}>{c.value}</p>
          <p className="tabular mt-1 text-[13px] text-muted">TM {c.cash} · CK {c.bank}</p>
        </div>
      ))}
    </div>
  )
}

function SourceNote({ e }: { e: CashBookEntry }) {
  if (e.source === 'inventory_receipt') {
    return <span className="text-[13px] text-muted">Phiếu nhập kho · Huỷ ở trang Kho</span>
  }
  if (e.source === 'pos_drawer') return <span className="text-[13px] text-muted">Thu/Chi két</span>
  return null
}

function VoidInfo({ e }: { e: CashBookEntry }) {
  if (!e.voidedAt) return null
  return (
    <span className="block text-[13px] text-red-700 no-underline">
      Đã huỷ{e.voidedByName ? ` (${e.voidedByName})` : ''}: {e.voidReason}
    </span>
  )
}

export function CashbookEntries({ entries, canManage, onVoid }: {
  entries: CashBookEntry[]
  canManage: boolean
  onVoid: (e: CashBookEntry) => void
}) {
  if (entries.length === 0) {
    return <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">Chưa có phiếu nào trong khoảng này.</p>
  }
  const voidable = (e: CashBookEntry) => cashEntryVoidable(e, canManage)
  return (
    <>
      {/* Thẻ dưới md (đọc tốt ở 375px). */}
      <ul className="space-y-2 md:hidden">
        {entries.map((e) => (
          <li key={e.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className={cn('min-w-0', e.voidedAt && 'text-muted line-through')}>
                <p className="text-sm font-medium">{e.kind === 'receipt' ? 'Thu' : 'Chi'} · {e.categoryName}</p>
                <p className="text-[13px] text-muted">
                  {shiftDateTimeLabel(e.createdAt)} · {e.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}{e.createdByName ? ` · ${e.createdByName}` : ''}
                </p>
                {e.note || e.counterparty ? <p className="text-[13px]">{[e.counterparty, e.note].filter(Boolean).join(' · ')}</p> : null}
              </div>
              <span className={cn('tabular shrink-0 font-semibold', e.voidedAt && 'text-muted line-through')}>{entryAmount(e)}</span>
            </div>
            <VoidInfo e={e} />
            <div className="mt-1 flex items-center justify-between gap-2">
              <SourceNote e={e} />
              {voidable(e) ? <Button variant="ghost" className="text-danger" onClick={() => onVoid(e)}>Huỷ phiếu</Button> : null}
            </div>
          </li>
        ))}
      </ul>
      {/* Bảng từ md. */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full text-sm">
          <thead className="bg-background text-left text-[13px] text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Giờ</th>
              <th className="px-3 py-2 font-medium">Loại · Danh mục</th>
              <th className="px-3 py-2 text-right font-medium">Số tiền</th>
              <th className="px-3 py-2 font-medium">Phương thức</th>
              <th className="px-3 py-2 font-medium">Người ghi</th>
              <th className="px-3 py-2 font-medium">Ca</th>
              <th className="px-3 py-2 font-medium">Ghi chú</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.id} className={cn(e.voidedAt && 'text-muted')}>
                <td className="tabular px-3 py-2 whitespace-nowrap">{shiftDateTimeLabel(e.createdAt)}</td>
                <td className={cn('px-3 py-2', e.voidedAt && 'line-through')}>
                  {e.kind === 'receipt' ? 'Thu' : 'Chi'} · {e.categoryName}
                  <div><SourceNote e={e} /></div>
                </td>
                <td className={cn('tabular px-3 py-2 text-right font-semibold whitespace-nowrap', e.voidedAt && 'line-through')}>{entryAmount(e)}</td>
                <td className="px-3 py-2">{e.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</td>
                <td className="px-3 py-2">{e.createdByName ?? '—'}</td>
                <td className="tabular px-3 py-2 whitespace-nowrap">{e.shiftOpenedAt ? `từ ${shiftDateTimeLabel(e.shiftOpenedAt)}` : '—'}</td>
                <td className="px-3 py-2">
                  <span className={cn(e.voidedAt && 'line-through')}>{[e.counterparty, e.note].filter(Boolean).join(' · ') || '—'}</span>
                  <VoidInfo e={e} />
                </td>
                <td className="px-3 py-2 text-right">
                  {voidable(e) ? <Button variant="ghost" className="text-danger" onClick={() => onVoid(e)}>Huỷ phiếu</Button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

type KindFilter = 'all' | CashBookKind
type MethodFilter = 'all' | CashBookMethod

export default function CashbookView({ list, categories, filters, today, inModal, canManage }: {
  list: CashbookList
  categories: CashBookCategory[]
  filters: CashbookFilters
  today: string
  inModal: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [entryKind, setEntryKind] = useState<CashBookKind | null>(null)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<CashBookEntry | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  // Đổi lọc như ReportDatePicker: trong hộp thoại điều hướng mềm (POS phía sau không bị gỡ); trang đầy đủ tải lại
  // trang (điều hướng mềm ở đó bị @modal/(.)cashbook bắt → hộp thoại đè lên chính trang).
  const go = (f: CashbookFilters) => {
    const qs = `?${filtersToSearch(f)}`
    if (inModal) router.replace(qs)
    else window.location.replace(qs)
  }
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

  const confirmVoid = async () => {
    if (!voidTarget || voidBusy) return
    setVoidBusy(true)
    setVoidError(null)
    try {
      const res = await voidCashBookEntry({ id: voidTarget.id, reason: voidReason })
      if (!res.ok) { setVoidError(res.error); return }
      setVoidTarget(null)
      router.refresh()
    } catch {
      setVoidError('Lỗi kết nối. Thử huỷ lại.')
    } finally {
      setVoidBusy(false)
    }
  }

  const categoryOptions = categories
    .filter((c) => !filters.kind || c.kind === filters.kind)
    .sort((a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind === 'receipt' ? -1 : 1))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Plus />} onClick={() => setEntryKind('receipt')}>Phiếu thu</Button>
            <Button variant="primary" icon={<Plus />} onClick={() => setEntryKind('payment')}>Phiếu chi</Button>
            <Button icon={<Tags />} onClick={() => setCategoriesOpen(true)}>Danh mục</Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Phiếu do bạn ghi tại két. Thêm / huỷ phiếu do chủ quán hoặc quản lý làm.</p>
        )}
        <a href={`/admin/cashbook/export?${filtersToSearch(filters)}`} className={getButtonClasses('outline')}>
          <Download className="size-4" aria-hidden /> Xuất Excel
        </a>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <label className="text-sm">
          <span className="mb-1 block text-[13px] text-muted">Từ ngày</span>
          <input
            type="date" value={filters.from} max={today} aria-label="Từ ngày"
            onChange={(e) => { if (isDate(e.target.value)) go({ ...filters, from: e.target.value }) }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-[13px] text-muted">Đến ngày</span>
          <input
            type="date" value={filters.to} max={today} aria-label="Đến ngày"
            onChange={(e) => { if (isDate(e.target.value)) go({ ...filters, to: e.target.value }) }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
          />
        </label>
        <Tabs<KindFilter>
          label="Loại phiếu" value={filters.kind ?? 'all'}
          onValueChange={(v) => go({ ...filters, kind: v === 'all' ? null : v, categoryId: null })}
          items={[{ value: 'all', label: 'Tất cả' }, { value: 'receipt', label: 'Thu' }, { value: 'payment', label: 'Chi' }]}
        />
        <Tabs<MethodFilter>
          label="Phương thức" value={filters.method ?? 'all'}
          onValueChange={(v) => go({ ...filters, method: v === 'all' ? null : v })}
          items={[{ value: 'all', label: 'Tất cả' }, { value: 'cash', label: 'Tiền mặt' }, { value: 'bank', label: 'Chuyển khoản' }]}
        />
        <Select
          aria-label="Danh mục" value={filters.categoryId ?? ''} className="w-auto min-w-44"
          onChange={(e) => go({ ...filters, categoryId: e.target.value || null })}
        >
          <option value="">Tất cả danh mục</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.kind === 'receipt' ? 'Thu' : 'Chi'} · {c.name}{c.isActive ? '' : ' (ẩn)'}</option>
          ))}
        </Select>
      </div>

      <CashbookTotalsCards totals={list.totals} />
      {list.truncated ? <Banner tone="warning" title="Chỉ hiện 2000 phiếu mới nhất, thu hẹp bộ lọc để xem đủ." /> : null}
      <CashbookEntries
        entries={list.entries}
        canManage={canManage}
        onVoid={(e) => { setVoidTarget(e); setVoidReason(''); setVoidError(null) }}
      />

      {canManage ? (
        <>
          <EntryFormDialog kind={entryKind} categories={categories} onClose={() => setEntryKind(null)} onSaved={() => router.refresh()} />
          <CategoriesDialog open={categoriesOpen} categories={categories} onClose={() => setCategoriesOpen(false)} onChanged={() => router.refresh()} />
          <ConfirmDialog
            open={voidTarget !== null}
            title="Huỷ phiếu"
            description={voidTarget ? (
              <span className="block space-y-2">
                <span className="block">
                  {voidTarget.kind === 'receipt' ? 'Phiếu thu' : 'Phiếu chi'} {voidTarget.categoryName} · {entryAmount(voidTarget)}.
                  {voidTarget.method === 'cash' && voidTarget.cashShiftId ? ' Phiếu tiền mặt chỉ huỷ được khi ca của nó còn mở.' : ''}
                </span>
                <label className="block text-sm font-medium text-foreground" htmlFor="cashbook-void-reason">Lý do huỷ</label>
                <textarea
                  id="cashbook-void-reason" rows={2} maxLength={500} value={voidReason} disabled={voidBusy}
                  onChange={(e) => { setVoidReason(e.target.value); setVoidError(null) }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-focus"
                />
                {voidError ? <span role="alert" className="block text-error-text">{voidError}</span> : null}
              </span>
            ) : undefined}
            confirmLabel="Huỷ phiếu"
            tone="danger"
            busy={voidBusy}
            confirmDisabled={voidReason.trim() === ''}
            onConfirm={() => void confirmVoid()}
            onCancel={() => setVoidTarget(null)}
          />
        </>
      ) : null}
    </div>
  )
}
