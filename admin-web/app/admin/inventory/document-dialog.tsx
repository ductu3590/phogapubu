'use client'

import { useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ErrorState, SkeletonList } from '@/components/ui/feedback'
import { Field, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { loadInventoryDocument, voidInventoryDocument } from '@/lib/actions/inventory'
import { DOC_KIND_LABEL, formatQty, type DocDetail } from '@/lib/inventory'
import { formatVND } from '@/lib/utils'
import { formatDateTime, formatDocDate, paidLabel } from './doc-format'

type Loaded = { id: string; result: Awaited<ReturnType<typeof loadInventoryDocument>> }

/** Chi tiết một phiếu + huỷ phiếu (lý do bắt buộc). Không sửa phiếu đã lưu: huỷ rồi tạo lại. */
export default function DocumentDialog({ id, onClose, onVoided }: {
  id: string
  onClose: () => void
  onVoided: () => void
}) {
  const toast = useToast()
  const [tick, setTick] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  const key = `${id}|${tick}`
  useEffect(() => {
    let alive = true
    loadInventoryDocument(id).then((result) => { if (alive) setLoaded({ id: key, result }) })
    return () => { alive = false }
  }, [id, key])

  const result = loaded?.id === key ? loaded.result : null
  const doc: DocDetail | null = result?.ok ? result.document : null

  async function confirmVoid() {
    if (!doc || busy) return
    if (!reason.trim()) {
      setVoidError('Cần lý do huỷ phiếu')
      return
    }
    setBusy(true)
    setVoidError(null)
    const res = await voidInventoryDocument(doc.id, reason)
    setBusy(false)
    if (!res.ok) {
      setVoidError(res.error)
      return
    }
    toast({ tone: 'success', title: `Đã huỷ ${doc.docNo}` })
    setVoiding(false)
    setReason('')
    setTick((t) => t + 1)
    onVoided()
  }

  const isCount = doc?.kind === 'count'
  const isReceipt = doc?.kind === 'receipt'

  return (
    <>
      <Dialog
        open
        placement="side"
        onClose={onClose}
        title={doc ? `${DOC_KIND_LABEL[doc.kind]} ${doc.docNo}` : 'Chi tiết phiếu'}
        description={doc ? `Ngày ${formatDocDate(doc.docDate)} · ${doc.createdByName ?? 'Không rõ người tạo'}` : undefined}
        className="md:w-[560px]"
        footer={doc && doc.status === 'posted' ? (
          <Button variant="danger" icon={<Ban />} onClick={() => { setVoidError(null); setVoiding(true) }}>Huỷ phiếu</Button>
        ) : undefined}
      >
        {result === null ? (
          <SkeletonList rows={4} label="Đang tải phiếu" />
        ) : !result.ok || !doc ? (
          <ErrorState title="Không tải được phiếu" reason={result.ok ? undefined : result.error} onRetry={() => setTick((t) => t + 1)} />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {doc.status === 'voided' ? <Badge tone="neutral">Đã huỷ</Badge> : <Badge tone="success" withDot>Đã lưu</Badge>}
              {isReceipt ? <Badge tone={doc.paidStatus === 'paid' ? 'info' : 'warning'}>{paidLabel(doc)}</Badge> : null}
            </div>

            {doc.status === 'voided' ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-foreground/80">
                Huỷ lúc {doc.voidedAt ? formatDateTime(doc.voidedAt) : '—'} · Lý do: {doc.voidReason ?? '—'}
              </p>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {isReceipt ? (<><dt className="text-muted">Nhà cung cấp</dt><dd>{doc.supplierName ?? '—'}</dd></>) : null}
              <dt className="text-muted">{doc.kind === 'writeoff' ? 'Lý do' : 'Ghi chú'}</dt><dd className="break-words">{doc.note ?? '—'}</dd>
              <dt className="text-muted">Tạo lúc</dt><dd>{formatDateTime(doc.createdAt)}</dd>
            </dl>

            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {doc.lines.map((l) => (
                <li key={l.inventoryItemId} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{l.name}</p>
                    <p className="text-[13px] text-muted">
                      {isCount
                        ? `Đếm ${formatQty(l.countedQty ?? 0)} ${l.unit} · máy ${formatQty(l.systemQty ?? 0)}`
                        : `${formatQty(l.qty ?? 0)} ${l.unit}`}
                      {l.unitCost !== null ? ` × ${formatVND(l.unitCost)}` : ''}
                    </p>
                  </div>
                  {isReceipt ? <span className="shrink-0 font-semibold tabular-nums">{formatVND(l.lineAmount)}</span> : null}
                  {isCount && l.countedQty !== null && l.systemQty !== null ? (
                    <span className="shrink-0 tabular-nums">{diffLabel(l.countedQty - l.systemQty)}</span>
                  ) : null}
                </li>
              ))}
            </ul>

            {isReceipt ? (
              <p className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-muted">Tổng tiền</span>
                <span className="text-base font-semibold tabular-nums">{formatVND(doc.totalAmount)}</span>
              </p>
            ) : null}
          </div>
        )}
      </Dialog>

      {voiding && doc ? (
        <Dialog
          open
          onClose={() => { if (!busy) setVoiding(false) }}
          dismissible={!busy && !reason.trim()}
          title={`Huỷ ${doc.docNo}?`}
          description="Phiếu không xoá, chỉ chuyển sang Đã huỷ và thôi tính vào tồn kho."
          footer={
            <>
              <Button onClick={() => setVoiding(false)} disabled={busy}>Không huỷ</Button>
              <Button variant="danger" isLoading={busy} disabled={!reason.trim()} onClick={confirmVoid}>Huỷ phiếu</Button>
            </>
          }
        >
          <div className="space-y-2">
            {/* Chỉ khi phiếu nhập đã có phiếu chi thật (mig 122b trở đi). Mig 118 không trả trường này nên không hiện. */}
            {doc.cashBookEntryId ? (
              <p className="text-sm text-foreground/80">Phiếu chi tương ứng trong sổ thu chi sẽ huỷ cùng.</p>
            ) : null}
            <Field label="Lý do huỷ" htmlFor="inv-void-reason" required error={voidError ?? undefined}>
              <Textarea id="inv-void-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập nhầm số lượng…" invalid={!!voidError} />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </>
  )
}

function diffLabel(diff: number): string {
  if (diff === 0) return 'Khớp'
  return diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)
}
