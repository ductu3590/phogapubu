'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/feedback'
import {
  differenceLabel,
  shiftDateTimeLabel,
  shiftTimeLabel,
  type CashShiftListItem,
  type CashShiftReport,
} from '@/lib/cash-shift'
import { readCashShiftReport } from '@/lib/pos-browser-reads'
import { printDocument } from '@/lib/print/print-document'
import { createClient } from '@/lib/supabase/client'
import { cn, formatVND } from '@/lib/utils'

// Tab "Ca" ở Hoá đơn & Báo cáo (mig 122). Danh sách lấy nguyên từ list_cash_shifts (server đã lọc: thu ngân chỉ ca
// mình mở / kết). Ca ĐANG MỞ không bao giờ hiện tiền dự kiến / chênh lệch, kể cả khi có trường (đếm trước, thấy sau).

export const SHIFT_LIST_LIMIT = 60

const diffClass = (d: number) => (d < 0 ? 'text-red-700' : d > 0 ? 'text-amber-700' : 'text-emerald-700')

export function ShiftsTable({ shifts, onOpen }: { shifts: CashShiftListItem[]; onOpen: (id: string) => void }) {
  if (shifts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState>Chưa có ca nào. Ca mở / kết ở POS sẽ hiện ở đây.</EmptyState>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-background text-left text-[13px] text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Ca</th>
            <th className="px-3 py-2 font-medium">Người mở / kết</th>
            <th className="px-3 py-2 text-right font-medium">Tiền đầu ca</th>
            <th className="px-3 py-2 text-right font-medium">Dự kiến</th>
            <th className="px-3 py-2 text-right font-medium">Đếm được</th>
            <th className="px-3 py-2 text-right font-medium">Chênh lệch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shifts.map((s) => {
            const closed = s.status === 'closed'
            return (
              <tr key={s.id} className="cursor-pointer hover:bg-foreground/5" onClick={() => onOpen(s.id)}>
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(s.id) }}>
                    <span className="tabular">{shiftDateTimeLabel(s.openedAt)}</span>
                    {closed && s.closedAt ? <span className="tabular"> – {shiftDateTimeLabel(s.closedAt)}</span> : null}
                  </button>
                  {!closed ? <div className="mt-0.5"><Badge tone="success">Đang mở</Badge></div> : null}
                </td>
                <td className="px-3 py-2">
                  <div>{s.openedByName ?? '—'}</div>
                  {closed ? <div className="text-[13px] text-muted">{s.closedByName ?? '—'}</div> : null}
                </td>
                <td className="tabular px-3 py-2 text-right">{formatVND(s.openingCash)}</td>
                <td className="tabular px-3 py-2 text-right">{closed && s.expectedCash !== null ? formatVND(s.expectedCash) : '—'}</td>
                <td className="tabular px-3 py-2 text-right">{closed && s.countedCash !== null ? formatVND(s.countedCash) : '—'}</td>
                <td className={cn('tabular px-3 py-2 text-right font-semibold', closed && s.difference !== null && diffClass(s.difference))}>
                  {closed && s.difference !== null ? differenceLabel(s.difference) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-[13px] text-muted">Hiện {SHIFT_LIST_LIMIT} ca gần nhất.</p>
    </div>
  )
}

function Line({ label, value, strong = false, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <>
      <dt className={cn('text-muted', strong && 'font-medium text-foreground')}>{label}</dt>
      <dd className={cn('tabular text-right text-foreground', strong && 'font-semibold', className)}>{value}</dd>
    </>
  )
}

export function ShiftDetail({ report: r, onPrint, printError }: {
  report: CashShiftReport
  onPrint: () => void
  printError: string | null
}) {
  const closed = r.status === 'closed'
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted">Người mở</dt><dd className="text-right">{r.openedByName ?? '—'}</dd>
        <dt className="text-muted">Giờ mở</dt><dd className="tabular text-right">{shiftDateTimeLabel(r.openedAt)}</dd>
        {closed ? (
          <>
            <dt className="text-muted">Người kết</dt><dd className="text-right">{r.closedByName ?? '—'}</dd>
            <dt className="text-muted">Giờ đóng</dt><dd className="tabular text-right">{r.closedAt ? shiftDateTimeLabel(r.closedAt) : '—'}</dd>
          </>
        ) : (
          <><dt className="text-muted">Trạng thái</dt><dd className="text-right"><Badge tone="success">Đang mở</Badge></dd></>
        )}
        {r.carriedDays > 1 ? (<><dt className="text-muted">Ca gộp</dt><dd className="text-right">qua {r.carriedDays} ngày</dd></>) : null}
      </dl>

      {closed ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border p-3">
          <Line label="Tiền đầu ca" value={formatVND(r.openingCash)} />
          <Line label="Tiền mặt thu bill" value={`+${formatVND(r.cashSales ?? 0)}`} />
          {(r.debtCash ?? 0) > 0 ? <Line label="Khách trả nợ (TM)" value={`+${formatVND(r.debtCash ?? 0)}`} /> : null}
          <Line label="Phiếu thu TM" value={`+${formatVND(r.cashReceipts ?? 0)}`} />
          <Line label="Phiếu chi TM" value={`−${formatVND(r.cashPayments ?? 0)}`} />
          <Line label="Tiền dự kiến" value={formatVND(r.expectedCash ?? 0)} strong />
          <Line label="Tiền đếm được" value={formatVND(r.countedCash ?? 0)} strong />
          <Line label="Chênh lệch" value={differenceLabel(r.difference ?? 0)} strong className={diffClass(r.difference ?? 0)} />
          <Line label="Số bill" value={String(r.billsCount ?? 0)} />
          <Line label="Chuyển khoản" value={formatVND(r.bankSales ?? 0)} />
        </dl>
      ) : (
        <p className="rounded-lg border border-border bg-background p-3 text-muted">
          Tiền đầu ca {formatVND(r.openingCash)}. Số két chỉ hiện sau khi kết ca.
        </p>
      )}

      {r.openNote ? <p><span className="text-muted">Ghi chú mở ca:</span> {r.openNote}</p> : null}
      {r.closeNote ? <p><span className="text-muted">Ghi chú kết ca:</span> {r.closeNote}</p> : null}

      <div>
        <h3 className="mb-2 font-semibold text-foreground">Phiếu thu / chi tiền mặt</h3>
        {r.entries.length === 0 ? (
          <p className="text-muted">Không có phiếu thu / chi tiền mặt.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {r.entries.map((e) => (
              <li key={e.id} className={cn('flex items-start justify-between gap-3 px-3 py-2', e.voidedAt && 'text-muted line-through')}>
                <div className="min-w-0">
                  <p className="font-medium">{e.categoryName}</p>
                  <p className="truncate text-[13px] text-muted">
                    {shiftTimeLabel(e.createdAt)}{e.createdByName ? ` · ${e.createdByName}` : ''}{e.note ? ` · ${e.note}` : ''}
                    {e.voidedAt ? ' · Đã huỷ' : ''}
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold">{e.kind === 'receipt' ? '+' : '−'}{formatVND(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {closed ? (
        <div className="space-y-2">
          <Button icon={<Printer />} onClick={onPrint}>In lại phiếu</Button>
          {printError ? <p role="alert" className="text-error-text">{printError}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Tab Ca: bảng 60 ca gần nhất + ngăn chi tiết (đọc get_cash_shift_report từ trình duyệt, một lần mỗi ca). */
export default function ShiftsPanel({ shifts }: { shifts: CashShiftListItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [reports, setReports] = useState<Record<string, CashShiftReport>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  const open = async (id: string) => {
    setOpenId(id)
    setLoadError(null)
    setPrintError(null)
    if (reports[id]) return
    setLoading(true)
    try {
      const res = await readCashShiftReport(createClient(), id)
      if (!res.ok) { setLoadError(res.error); return }
      setReports((m) => ({ ...m, [id]: res.report }))
    } catch {
      setLoadError('Không tải được ca. Kiểm tra mạng rồi thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const report = openId ? reports[openId] : undefined
  const print = async (shiftId: string) => {
    setPrintError(null)
    const res = await printDocument({ kind: 'shift_report', shiftId })
    if (!res.ok) setPrintError(res.error)
  }

  return (
    <>
      <ShiftsTable shifts={shifts} onOpen={(id) => void open(id)} />
      <Dialog open={openId !== null} onClose={() => setOpenId(null)} placement="side" title="Chi tiết ca">
        {openId === null ? null
          : loadError ? <p role="alert" className="text-sm text-error-text">{loadError}</p>
            : loading || !report ? <p className="text-sm text-muted">Đang tải…</p>
              : <ShiftDetail report={report} onPrint={() => void print(report.id)} printError={printError} />}
      </Dialog>
    </>
  )
}
