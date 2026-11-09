'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/field'
import { loadInventoryDocuments } from '@/lib/actions/inventory'
import { DOC_KIND_LABEL, type DocKind, type DocSummary, type StockRow } from '@/lib/inventory'
import { cn, formatVND } from '@/lib/utils'
import { formatDocDate, paidLabel } from './doc-format'
import { addDaysIso } from './document-form'
import DocumentDialog from './document-dialog'
import ReceiptForm from './receipt-form'
import WriteoffForm from './writeoff-form'

const CREATE_LABEL: Record<DocKind, string> = {
  receipt: 'Tạo phiếu nhập',
  count: 'Tạo phiếu kiểm',
  writeoff: 'Tạo phiếu huỷ',
}

/** Danh sách phiếu: thẻ dưới md, bảng từ md. Phiếu đã huỷ gạch ngang số phiếu + nhãn "Đã huỷ". */
export function DocumentList({ kind, documents, onOpen }: {
  kind: DocKind
  documents: DocSummary[]
  onOpen: (id: string) => void
}) {
  const isReceipt = kind === 'receipt'
  const detail = (d: DocSummary) => (isReceipt ? d.supplierName : d.note) ?? '—'
  const docNo = (d: DocSummary) => (
    <button type="button" onClick={() => onOpen(d.id)} aria-label={`Xem phiếu ${d.docNo}`}
      className="cursor-pointer text-left font-semibold underline-offset-2 hover:underline focus-visible:underline">
      <span className={cn(d.status === 'voided' && 'text-muted line-through')}>{d.docNo}</span>
    </button>
  )
  const statusBadges = (d: DocSummary) => (
    <>
      {d.status === 'voided' ? <Badge tone="neutral">Đã huỷ</Badge> : null}
      {isReceipt ? <Badge tone={d.paidStatus === 'paid' ? 'info' : 'warning'}>{paidLabel(d)}</Badge> : null}
    </>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <ul className="divide-y divide-border md:hidden">
        {documents.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {docNo(d)}
                <p className="text-[13px] text-muted">{formatDocDate(d.docDate)} · {d.lineCount} dòng · {d.createdByName ?? '—'}</p>
              </div>
              {isReceipt ? <span className="shrink-0 font-semibold tabular-nums">{formatVND(d.totalAmount)}</span> : null}
            </div>
            <p className="mt-1 text-sm break-words text-foreground/80">{detail(d)}</p>
            <div className="mt-2 flex flex-wrap gap-2">{statusBadges(d)}</div>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-border bg-background text-left text-[13px] text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Số phiếu</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Ngày</th>
            <th scope="col" className="px-3 py-2.5 font-medium">{isReceipt ? 'Nhà cung cấp' : 'Lý do'}</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Số dòng</th>
            {isReceipt ? <th scope="col" className="px-3 py-2.5 text-right font-medium">Tổng tiền</th> : null}
            <th scope="col" className="px-3 py-2.5 font-medium">Trạng thái</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Người tạo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {documents.map((d) => (
            <tr key={d.id} className={cn(d.status === 'voided' && 'bg-background')}>
              <td className="px-4 py-2.5">{docNo(d)}</td>
              <td className="px-3 py-2.5 tabular-nums">{formatDocDate(d.docDate)}</td>
              <td className="max-w-64 px-3 py-2.5 break-words text-foreground/80">{detail(d)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{d.lineCount}</td>
              {isReceipt ? <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatVND(d.totalAmount)}</td> : null}
              <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1.5">{statusBadges(d)}</div></td>
              <td className="px-3 py-2.5 text-foreground/80">{d.createdByName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Loaded = { key: string; result: Awaited<ReturnType<typeof loadInventoryDocuments>> }

/**
 * Tab phiếu (nhập / huỷ; Task 8 cắm kiểm kho). Tải khi mở tab và khi đổi khoảng ngày, không poll.
 * Lưu / huỷ phiếu xong tải lại danh sách và gọi `onChanged` để tab Tồn kho lấy số mới.
 */
export default function DocumentsTab({ kind, today, items, onChanged }: {
  kind: DocKind
  today: string
  items: StockRow[]
  onChanged?: () => void
}) {
  const [from, setFrom] = useState(() => addDaysIso(today, -29))
  const [to, setTo] = useState(today)
  const [tick, setTick] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const key = `${kind}|${from}|${to}|${tick}`
  useEffect(() => {
    let alive = true
    loadInventoryDocuments(kind, from, to).then((result) => { if (alive) setLoaded({ key, result }) })
    return () => { alive = false }
  }, [kind, from, to, key])

  const result = loaded?.key === key ? loaded.result : null
  const suppliers = loaded?.result.ok ? loaded.result.suppliers : []
  const refresh = () => { setTick((t) => t + 1); onChanged?.() }

  return (
    <section aria-label={DOC_KIND_LABEL[kind]} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Field label="Từ ngày" htmlFor={`inv-${kind}-from`} className="space-y-1">
            <Input id={`inv-${kind}-from`} type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label="Đến ngày" htmlFor={`inv-${kind}-to`} className="space-y-1">
            <Input id={`inv-${kind}-to`} type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)} className="sm:mb-5 sm:ml-auto">
          {CREATE_LABEL[kind]}
        </Button>
      </div>

      {result === null ? (
        <div className="rounded-xl border border-border bg-surface"><SkeletonList rows={4} label="Đang tải phiếu" /></div>
      ) : !result.ok ? (
        <ErrorState title="Không tải được danh sách phiếu" reason={result.error} onRetry={() => setTick((t) => t + 1)} />
      ) : result.documents.length === 0 ? (
        <EmptyState className="rounded-xl border border-border bg-surface">
          Chưa có phiếu {DOC_KIND_LABEL[kind].toLowerCase()} trong khoảng ngày này.
        </EmptyState>
      ) : (
        <DocumentList kind={kind} documents={result.documents} onOpen={setOpenId} />
      )}

      {creating && kind === 'receipt' ? (
        <ReceiptForm today={today} items={items} suppliers={suppliers} onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh() }} />
      ) : null}
      {creating && kind === 'writeoff' ? (
        <WriteoffForm today={today} items={items} onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh() }} />
      ) : null}

      {openId ? <DocumentDialog id={openId} onClose={() => setOpenId(null)} onVoided={refresh} /> : null}
    </section>
  )
}
