'use client'

import { useState } from 'react'
import { ArrowDownUp, Clock, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Banner } from '@/components/ui/feedback'
import { closeCashShift, openCashShift } from '@/lib/actions/cash-shift'
import { voidCashBookEntry } from '@/lib/actions/cash-book'
import { formatVndInput } from '@/lib/cash-change'
import type { CashBookCategory } from '@/lib/cash-book'
import {
  differenceLabel,
  parseShiftCash,
  shiftDateTimeLabel,
  shiftTimeLabel,
  type CashShiftCloseResult,
  type CashShiftEntry,
  type CashShiftState,
  type OpenCashShift,
} from '@/lib/cash-shift'
import { readCashBookCategories } from '@/lib/pos-browser-reads'
import { printDocument } from '@/lib/print/print-document'
import { createClient } from '@/lib/supabase/client'
import { cn, formatVND } from '@/lib/utils'
import { usePosLocked } from '@/components/pos-lock'
import ConfirmDialog from './confirm-dialog'
import CashDrawerDialog from './cash-drawer-dialog'

// Ca thu ngân trên POS (mig 122). Quán không bật "Bắt buộc mở ca" (hoặc chưa đọc được trạng thái) → không vẽ gì.
// "Đếm trước, thấy sau": form kết ca KHÔNG có tiền dự kiến; server chỉ trả số dự kiến / chênh lệch sau khi kết.
// Nhãn không ghi trơn "Ca": pill giờ phục vụ của POS đang dùng "Ca 17:00–23:00".

/** pos-client gửi yêu cầu mở hộp: 'open' khi server từ chối thu tiền vì "Chưa mở ca", 'close' từ banner ca quên kết. */
export type ShiftRequest = { kind: 'open' | 'close'; n: number }

const signed = (e: Pick<CashShiftEntry, 'kind' | 'amount'>) => `${e.kind === 'receipt' ? '+' : '−'}${formatVND(e.amount)}`

/**
 * Quyết định bật hộp nào trong lần vẽ này (thuần, test được). null = không đổi gì.
 *  • Tự bật hộp mở ca MỘT lần mỗi lần vào POS khi quán bật ca mà chưa có ca (đóng được để xem POS).
 *  • Yêu cầu từ pos-client (đổi theo `n`): 'open' → hộp mở ca; 'close' → hộp kết ca của ca đang mở.
 *  • Đang khoá PIN: KHÔNG làm gì (giữ autoChecked / seenRequest cũ) → mở khoá xong lần vẽ sau mới bật.
 */
export function decideShiftDialogs(input: {
  locked: boolean
  state: CashShiftState | null
  autoChecked: boolean
  request: ShiftRequest | null
  seenRequest: number | null
}): { autoChecked: boolean; seenRequest: number | null; open: boolean; closeShiftId: string | null } | null {
  const { locked, state, request } = input
  if (locked) return null
  const next = { autoChecked: input.autoChecked, seenRequest: input.seenRequest, open: false, closeShiftId: null as string | null }
  let changed = false
  if (!next.autoChecked && state?.required) {
    next.autoChecked = true
    if (!state.shift) next.open = true
    changed = true
  }
  if (request && request.n !== next.seenRequest) {
    next.seenRequest = request.n
    if (request.kind === 'open' && state?.required) next.open = true
    if (request.kind === 'close' && state?.shift) next.closeShiftId = state.shift.id
    changed = true
  }
  return changed ? next : null
}

/** Máy khác vừa mở ca: giữ hộp + câu báo, tải lại trạng thái để nút ca hiện đúng. */
export const SHIFT_ALREADY_OPEN = 'Đã có ca đang mở'
export const isShiftAlreadyOpenError = (error: string | null | undefined) => !!error && error.includes(SHIFT_ALREADY_OPEN)

// ---------------------------------------------------------------------------
// Phần vẽ thuần (test vẽ tĩnh được)
// ---------------------------------------------------------------------------
export function ShiftButtons({ state, onOpenShift, onShowPanel, onDrawer }: {
  state: CashShiftState | null
  onOpenShift: () => void
  onShowPanel: () => void
  onDrawer: () => void
}) {
  if (!state?.required) return null
  if (!state.shift) {
    return (
      <>
        <Button variant="primary" icon={<Wallet />} onClick={onOpenShift}>Mở ca</Button>
        <Button icon={<ArrowDownUp />} disabled title="Mở ca trước" aria-describedby="shift-drawer-hint">
          Thu/Chi két
          <span id="shift-drawer-hint" className="sr-only">Mở ca trước</span>
        </Button>
      </>
    )
  }
  return (
    <>
      <Button icon={<Clock />} onClick={onShowPanel} className="tabular">
        Ca thu ngân · từ {shiftTimeLabel(state.shift.openedAt)}
      </Button>
      <Button icon={<ArrowDownUp />} onClick={onDrawer}>Thu/Chi két</Button>
    </>
  )
}

export function ShiftPanelBody({ shift, canManageEntries, onVoid, onDrawer, onCloseShift }: {
  shift: OpenCashShift
  canManageEntries: boolean
  onVoid: (entry: CashShiftEntry) => void
  onDrawer: () => void
  onCloseShift: () => void
}) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Người mở</dt>
        <dd className="font-medium text-foreground">{shift.openedByName ?? '—'}</dd>
        <dt className="text-muted">Giờ mở</dt>
        <dd className="tabular text-foreground">{shiftDateTimeLabel(shift.openedAt)}</dd>
        <dt className="text-muted">Tiền đầu ca</dt>
        <dd className="tabular font-semibold text-foreground">{formatVND(shift.openingCash)}</dd>
        {shift.openNote ? (<><dt className="text-muted">Ghi chú</dt><dd className="text-foreground">{shift.openNote}</dd></>) : null}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Phiếu thu / chi tiền mặt</h3>
        {shift.entries.length === 0 ? (
          <p className="text-sm text-muted">Chưa có phiếu thu / chi tiền mặt trong ca.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {shift.entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className={cn('min-w-0', e.voidedAt && 'text-muted line-through')}>
                  <p className="text-sm font-medium">{e.categoryName}</p>
                  <p className="truncate text-[13px] text-muted">
                    {shiftTimeLabel(e.createdAt)}{e.createdByName ? ` · ${e.createdByName}` : ''}{e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn(
                    'tabular text-sm font-semibold',
                    e.voidedAt ? 'text-muted line-through' : e.kind === 'receipt' ? 'text-emerald-700' : 'text-foreground',
                  )}>
                    {signed(e)}
                  </span>
                  {e.voidedAt ? <span className="text-[13px] text-muted">Đã huỷ</span>
                    : canManageEntries ? (
                      <button type="button" className="min-h-8 text-[13px] font-medium text-danger hover:underline" onClick={() => onVoid(e)}>Huỷ phiếu</button>
                    ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button icon={<ArrowDownUp />} onClick={onDrawer}>Thu/Chi két</Button>
        <Button variant="primary" onClick={onCloseShift}>Kết ca</Button>
      </div>
    </div>
  )
}

export function CloseShiftForm({ countedText, note, onCounted, onNote, openTablesCount, error }: {
  countedText: string
  note: string
  onCounted: (v: string) => void
  onNote: (v: string) => void
  openTablesCount: number
  error: string | null
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground/80">Đếm hết tiền trong két rồi nhập số đếm được.</p>
      {openTablesCount > 0 ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Còn {openTablesCount} bàn đang mở. Tiền thu sau khi kết sẽ vào ca kế tiếp.
        </p>
      ) : null}
      <Field label="Tiền đếm được" htmlFor="shift-counted" required>
        <Input
          id="shift-counted"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ví dụ 1.250.000"
          value={countedText}
          onChange={(e) => onCounted(formatVndInput(e.target.value))}
        />
      </Field>
      <Field label="Ghi chú" htmlFor="shift-close-note">
        <Textarea id="shift-close-note" rows={2} maxLength={500} value={note} onChange={(e) => onNote(e.target.value)} />
      </Field>
      {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
    </div>
  )
}

export function CloseShiftResult({ result }: { result: CashShiftCloseResult }) {
  const rows: [string, string][] = [
    ['Tiền đầu ca', formatVND(result.openingCash)],
    ['Tiền mặt bán', `+${formatVND(result.cashSales)}`],
    ...(result.debtCash > 0 ? [['Thu nợ tiền mặt', `+${formatVND(result.debtCash)}`] as [string, string]] : []),
    ['Phiếu thu', `+${formatVND(result.cashReceipts)}`],
    ['Phiếu chi', `−${formatVND(result.cashPayments)}`],
  ]
  return (
    <div className="space-y-3">
      {result.already ? <p className="text-sm text-muted">Ca này đã kết trước đó — đây là kết quả đã lưu.</p> : null}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular text-right text-foreground">{value}</dd>
          </div>
        ))}
        <dt className="border-t border-border pt-1.5 font-medium text-foreground">Tiền dự kiến</dt>
        <dd className="tabular border-t border-border pt-1.5 text-right font-semibold text-foreground">{formatVND(result.expectedCash)}</dd>
        <dt className="font-medium text-foreground">Tiền đếm được</dt>
        <dd className="tabular text-right font-semibold text-foreground">{formatVND(result.countedCash)}</dd>
        <dt className="font-medium text-foreground">Chênh lệch</dt>
        <dd className={cn(
          'tabular text-right font-bold',
          result.difference < 0 ? 'text-red-700' : result.difference > 0 ? 'text-amber-700' : 'text-emerald-700',
        )}>
          {differenceLabel(result.difference)}
        </dd>
      </dl>
    </div>
  )
}

/** Ca mở từ trước mốc bắt đầu ngày kinh doanh hiện tại mà chưa ai kết / chọn gộp. Không chặn POS. */
export function ShiftStaleBanner({ state, onCloseOld, onContinue, busy = false }: {
  state: CashShiftState | null
  onCloseOld: () => void
  onContinue: () => void
  busy?: boolean
}) {
  const shift = state?.required ? state.shift : null
  if (!shift?.stale) return null
  return (
    <Banner tone="warning" title={`Ca mở từ ${shiftDateTimeLabel(shift.openedAt)} chưa kết.`} className="mx-4 mt-2 md:mx-5">
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={onCloseOld} disabled={busy}>Kết ca cũ rồi mở ca mới</Button>
        <Button variant="ghost" onClick={onContinue} isLoading={busy}>Tiếp tục gộp vào ca đó</Button>
      </div>
    </Banner>
  )
}

// ---------------------------------------------------------------------------
// Hộp mở ca / kết ca: chỉ dựng khi mở → mở lại là form trống (con của <Dialog> sống cả khi đóng).
// ---------------------------------------------------------------------------
function OpenShiftDialog({ onCancel, onOpened, onRefresh }: {
  onCancel: () => void
  onOpened: () => void
  onRefresh: () => void
}) {
  const [cashText, setCashText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cash = parseShiftCash(cashText)

  const submit = async () => {
    if (cash === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await openCashShift({ openingCash: cash, note: note.trim() || null })
      if (!res.ok) {
        // Máy khác vừa mở ca: GIỮ hộp với câu báo (không đóng cùng nhịp làm mất câu), tải lại để nút ca hiện đúng.
        setError(isShiftAlreadyOpenError(res.error)
          ? 'Đã có ca đang mở (máy khác vừa mở). Bấm "Để sau" rồi dùng ca đó.'
          : res.error)
        if (isShiftAlreadyOpenError(res.error)) onRefresh()
        return
      }
      onOpened()
    } catch {
      setError('Lỗi kết nối. Kiểm tra mạng rồi bấm mở ca lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onCancel() }}
      dismissible={!busy}
      title="Mở ca thu ngân"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Để sau</Button>
          <Button variant="primary" isLoading={busy} disabled={cash === null} onClick={() => void submit()}>Mở ca</Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <p className="text-sm text-foreground/80">Đếm tiền lẻ để sẵn trong két rồi nhập. Chưa mở ca thì chưa thu tiền được.</p>
        <Field label="Tiền đầu ca" htmlFor="shift-opening" required>
          <Input
            id="shift-opening"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ví dụ 500.000 (không có thì nhập 0)"
            value={cashText}
            onChange={(e) => { setCashText(formatVndInput(e.target.value)); setError(null) }}
          />
        </Field>
        <Field label="Ghi chú" htmlFor="shift-open-note">
          <Textarea id="shift-open-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p role="alert" className="text-sm text-error-text">{error}</p> : null}
      </form>
    </Dialog>
  )
}

function CloseShiftDialog({ shiftId, openTablesCount, onCancel, onClosed }: {
  shiftId: string
  openTablesCount: number
  onCancel: () => void
  onClosed: (result: CashShiftCloseResult) => void
}) {
  const [countedText, setCountedText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const counted = parseShiftCash(countedText)

  // Lỗi / mất mạng: GIỮ số đã nhập để bấm lại; kết ca lặp cùng số đếm server trả kết quả đã lưu (already).
  const submit = async () => {
    if (counted === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await closeCashShift({ shiftId, countedCash: counted, note: note.trim() || null })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onClosed(res.result)
    } catch {
      setError('Lỗi kết nối. Bấm kết ca lại với cùng số đếm — không bị kết hai lần.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onCancel() }}
      dismissible={false}
      title="Kết ca thu ngân"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Huỷ</Button>
          <Button variant="primary" isLoading={busy} disabled={counted === null} onClick={() => void submit()}>Xác nhận kết ca</Button>
        </>
      }
    >
      <CloseShiftForm
        countedText={countedText}
        note={note}
        onCounted={(v) => { setCountedText(v); setError(null) }}
        onNote={setNote}
        openTablesCount={openTablesCount}
        error={error}
      />
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Khung điều khiển ca trên thanh trên POS
// ---------------------------------------------------------------------------
export default function ShiftControls({ state, reload, openTablesCount, storeId, request }: {
  state: CashShiftState | null
  reload: () => void
  openTablesCount: number
  storeId: string
  request: ShiftRequest | null
}) {
  const [openDialog, setOpenDialog] = useState(false)
  const [autoChecked, setAutoChecked] = useState(false)
  const [seenRequest, setSeenRequest] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [closingShiftId, setClosingShiftId] = useState<string | null>(null)
  // Kết quả kết ca giữ riêng: lần đọc định kỳ (ca đã đóng → shift null) không được xoá mất.
  const [closeResult, setCloseResult] = useState<CashShiftCloseResult | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [categories, setCategories] = useState<CashBookCategory[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<CashShiftEntry | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  const locked = usePosLocked()
  // Lần đọc ca mới → bỏ câu lỗi tải danh mục cũ (thử lại tự nhiên ở lần bấm sau).
  const [seenState, setSeenState] = useState(state)
  if (state !== seenState) {
    setSeenState(state)
    if (drawerError) setDrawerError(null)
  }
  // Tự bật hộp mở ca / xử lý yêu cầu từ pos-client ngay trong lúc vẽ (không qua effect). Đang khoá PIN thì HOÃN:
  // hộp mở sau màn khoá sẽ nằm trên nó (top layer) — mở khoá xong mới bật.
  const decision = decideShiftDialogs({ locked, state, autoChecked, request, seenRequest })
  if (decision) {
    setAutoChecked(decision.autoChecked)
    setSeenRequest(decision.seenRequest)
    if (decision.open) setOpenDialog(true)
    if (decision.closeShiftId) {
      setPanelOpen(false)
      setClosingShiftId(decision.closeShiftId)
    }
  }

  if (!state?.required) return null
  const shift = state.shift

  const openDrawer = async () => {
    if (drawerLoading) return
    setDrawerError(null)
    setDrawerLoading(true)
    try {
      const res = await readCashBookCategories(createClient(), storeId)
      if (!res.ok) { setDrawerError(`Không tải được danh mục: ${res.error}`); return }
      setCategories(res.categories)
      setDrawerOpen(true)
    } catch {
      setDrawerError('Không tải được danh mục. Kiểm tra mạng rồi thử lại.')
    } finally {
      setDrawerLoading(false)
    }
  }

  const confirmVoid = async () => {
    if (!voidTarget || voidBusy) return
    setVoidBusy(true)
    setVoidError(null)
    try {
      const res = await voidCashBookEntry({ id: voidTarget.id, reason: voidReason })
      if (!res.ok) { setVoidError(res.error); return }
      setVoidTarget(null)
      reload()
    } catch {
      setVoidError('Lỗi kết nối. Thử huỷ lại.')
    } finally {
      setVoidBusy(false)
    }
  }

  const print = async (shiftId: string) => {
    setPrintError(null)
    const res = await printDocument({ kind: 'shift_report', shiftId })
    if (!res.ok) setPrintError(res.error)
  }

  return (
    <>
      <ShiftButtons
        state={state}
        onOpenShift={() => setOpenDialog(true)}
        onShowPanel={() => setPanelOpen(true)}
        onDrawer={() => void openDrawer()}
      />
      {drawerError ? <span role="alert" className="text-[13px] text-error-text">{drawerError}</span> : null}

      {openDialog ? (
        <OpenShiftDialog
          onCancel={() => setOpenDialog(false)}
          onOpened={() => { setOpenDialog(false); reload() }}
          onRefresh={reload}
        />
      ) : null}

      <Dialog open={panelOpen && !!shift} onClose={() => setPanelOpen(false)} placement="side" title="Ca thu ngân">
        {panelOpen && shift ? (
          <ShiftPanelBody
            shift={shift}
            canManageEntries={state.canManageEntries}
            onVoid={(e) => { setVoidTarget(e); setVoidReason(''); setVoidError(null) }}
            onDrawer={() => void openDrawer()}
            onCloseShift={() => { setPanelOpen(false); setClosingShiftId(shift.id) }}
          />
        ) : null}
      </Dialog>

      {closingShiftId ? (
        <CloseShiftDialog
          shiftId={closingShiftId}
          openTablesCount={openTablesCount}
          onCancel={() => setClosingShiftId(null)}
          onClosed={(result) => { setClosingShiftId(null); setCloseResult(result); setPrintError(null); reload() }}
        />
      ) : null}

      {closeResult ? (
        <Dialog
          open
          onClose={() => setCloseResult(null)}
          title="Kết quả kết ca"
          footer={
            <>
              <Button onClick={() => void print(closeResult.shiftId)}>In phiếu bàn giao</Button>
              <Button onClick={() => { setCloseResult(null); setOpenDialog(true) }}>Mở ca mới</Button>
              <Button variant="primary" onClick={() => setCloseResult(null)}>Đóng</Button>
            </>
          }
        >
          <CloseShiftResult result={closeResult} />
          {printError ? <p role="alert" className="mt-3 text-sm text-error-text">{printError}</p> : null}
        </Dialog>
      ) : null}

      <CashDrawerDialog
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        categories={categories}
        onSaved={() => { setDrawerError(null); reload() }}
      />

      <ConfirmDialog
        open={voidTarget !== null}
        title="Huỷ phiếu"
        description={voidTarget ? (
          <span className="block space-y-2">
            <span className="block">
              {voidTarget.categoryName} · {signed(voidTarget)}. Phiếu huỷ không tính vào két nữa.
            </span>
            <label className="block text-sm font-medium text-foreground" htmlFor="void-reason">Lý do huỷ</label>
            <textarea
              id="void-reason"
              rows={2}
              maxLength={500}
              value={voidReason}
              disabled={voidBusy}
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
  )
}
