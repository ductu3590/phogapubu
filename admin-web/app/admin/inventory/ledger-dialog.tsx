'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { ErrorState, SkeletonList } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/field'
import { loadItemLedger } from '@/lib/actions/inventory'
import { DOC_KIND_LABEL, formatQty, type Ledger, type LedgerRow, type StockRow } from '@/lib/inventory'
import { cn } from '@/lib/utils'
import { formatDocDate, orderedRange } from './doc-format'
import { addDaysIso } from './document-form'
import DocumentDialog from './document-dialog'

const time = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })

/** 2026-10-01 → 01/10 */
const dayMonth = (iso: string) => formatDocDate(iso).slice(0, 5)

function typeLabel(r: LedgerRow): string {
  return r.type === 'sales' ? `Bán ngày ${dayMonth(r.businessDate)}` : DOC_KIND_LABEL[r.type]
}

/** Thay đổi: + xanh lá / − đỏ, luôn kèm dấu. Dòng kiểm: "Đếm 3 (lệch -11)". */
function ChangeCell({ r }: { r: LedgerRow }) {
  if (r.type === 'count') {
    const counted = formatQty(r.countedQty ?? r.balance)
    const lech = r.qtyChange === 0 ? 'khớp' : `lệch ${r.qtyChange > 0 ? '+' : ''}${formatQty(r.qtyChange)}`
    return <span className={cn('tabular-nums', r.qtyChange < 0 ? 'text-critical' : r.qtyChange > 0 ? 'text-success' : 'text-muted')}>Đếm {counted} ({lech})</span>
  }
  if (r.qtyChange > 0) return <span className="font-semibold tabular-nums text-success">+{formatQty(r.qtyChange)}</span>
  if (r.qtyChange < 0) return <span className="font-semibold tabular-nums text-critical">−{formatQty(-r.qtyChange)}</span>
  return <span className="tabular-nums text-muted">0</span>
}

const Balance = ({ qty, strong }: { qty: number; strong?: boolean }) => (
  <span className={cn('tabular-nums', strong && 'font-semibold', qty < 0 && 'text-critical')}>{formatQty(qty)}</span>
)

/** Bảng thẻ kho (thuần hiển thị): tồn đầu kỳ · từng biến động với tồn chạy · tồn cuối kỳ. */
export function LedgerView({ ledger, onOpenDocument }: { ledger: Ledger; onOpenDocument: (id: string) => void }) {
  const unit = ledger.item.unit
  return (
    <div className="space-y-2 text-sm">
      <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_5rem] gap-3 px-3 text-[13px] text-muted md:grid" aria-hidden>
        <span>Giờ</span><span>Loại · số phiếu</span><span className="text-right">Thay đổi</span><span className="text-right">Tồn</span>
      </div>
      <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
        <li className="flex items-center justify-between gap-3 bg-background px-3 py-2.5">
          <span className="font-medium">Tồn đầu kỳ <span className="text-[13px] font-normal text-muted">{formatDocDate(ledger.from)}</span></span>
          <span><Balance qty={ledger.openingQty} strong /> <span className="text-[13px] text-muted">{unit}</span></span>
        </li>
        {ledger.rows.length === 0 ? (
          <li className="px-3 py-4 text-center text-muted">Không có nhập, bán, huỷ hay kiểm trong kỳ này.</li>
        ) : ledger.rows.map((r, i) => (
          <li key={`${r.at}-${r.type}-${i}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2.5 md:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)_5rem] md:items-center">
            {/* Thứ tự đọc: giờ → loại · số phiếu → thay đổi → tồn. Dưới md ba mục đầu xếp dọc bên trái, tồn bên phải. */}
            <div className="min-w-0 space-y-0.5 md:contents">
              <span className="block text-[13px] text-muted">{time(r.at)}</span>
              <span className="block min-w-0">
                <span className={cn(r.type === 'sales' && 'text-foreground/80')}>{typeLabel(r)}</span>
                {r.docNo && r.documentId ? (
                  <>
                    {' · '}
                    <button type="button" onClick={() => onOpenDocument(r.documentId!)} aria-label={`Xem phiếu ${r.docNo}`}
                      className="inline-flex min-h-8 cursor-pointer items-center font-medium underline underline-offset-2">
                      {r.docNo}
                    </button>
                  </>
                ) : null}
              </span>
              <span className="block md:text-right"><ChangeCell r={r} /></span>
            </div>
            <span className="self-center text-right"><Balance qty={r.balance} /></span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 bg-background px-3 py-2.5">
          <span className="font-medium">Tồn cuối kỳ <span className="text-[13px] font-normal text-muted">{formatDocDate(ledger.to)}</span></span>
          <span><Balance qty={ledger.closingQty} strong /> <span className="text-[13px] text-muted">{unit}</span></span>
        </li>
      </ol>
    </div>
  )
}

type Loaded = { key: string; result: Awaited<ReturnType<typeof loadItemLedger>> }

/**
 * Thẻ kho một hàng: khoảng ngày (mặc định 30 ngày tới hôm nay, server giới hạn 93 ngày), bấm số phiếu mở chi tiết
 * phiếu; huỷ phiếu từ đó thì tải lại thẻ kho và báo `onChanged` để tab Tồn kho cập nhật.
 */
export default function LedgerDialog({ item, today, onClose, onChanged }: {
  item: StockRow
  today: string
  onClose: () => void
  onChanged?: () => void
}) {
  const [from, setFrom] = useState(() => addDaysIso(today, -29))
  const [to, setTo] = useState(today)
  const [tick, setTick] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const { lo, hi, swapped } = orderedRange(from, to)
  const key = `${item.id}|${lo}|${hi}|${tick}`
  useEffect(() => {
    let alive = true
    loadItemLedger(item.id, lo, hi).then((result) => { if (alive) setLoaded({ key, result }) })
    return () => { alive = false }
  }, [item.id, lo, hi, key])

  const result = loaded?.key === key ? loaded.result : null

  return (
    <>
      <Dialog open placement="side" onClose={onClose} title={`Thẻ kho · ${item.name}`}
        description={`Đơn vị: ${item.unit}`} className="md:w-[640px]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            <Field label="Từ ngày" htmlFor="inv-ledger-from" className="space-y-1">
              <Input id="inv-ledger-from" type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </Field>
            <Field label="Đến ngày" htmlFor="inv-ledger-to" className="space-y-1">
              <Input id="inv-ledger-to" type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </Field>
          </div>
          {swapped ? <p className="text-[13px] text-muted">Đang xem từ {formatDocDate(lo)} đến {formatDocDate(hi)} (đã đảo hai ngày cho đúng thứ tự).</p> : null}

          {result === null ? (
            <SkeletonList rows={5} label="Đang tải thẻ kho" />
          ) : !result.ok ? (
            <ErrorState title="Không tải được thẻ kho" reason={result.error} onRetry={() => setTick((t) => t + 1)} />
          ) : (
            <LedgerView ledger={result.ledger} onOpenDocument={setOpenId} />
          )}
        </div>
      </Dialog>
      {openId ? (
        <DocumentDialog id={openId} onClose={() => setOpenId(null)}
          onVoided={() => { setTick((t) => t + 1); onChanged?.() }} />
      ) : null}
    </>
  )
}
