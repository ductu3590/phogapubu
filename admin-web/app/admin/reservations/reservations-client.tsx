'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  arriveReservation,
  cancelStoreReservation,
  confirmReservation,
  createManualReservation,
  listReservationHistory,
  listReservationQueue,
  markReservationNoShow,
  rejectReservation,
  rescheduleReservation,
  resolveReservationChange,
  snoozeReservationReminders,
  type ReservationRow,
} from '@/lib/actions/reservations'
import { loadFloorLayout } from '@/lib/actions/floor-layout'
import { listOpenTableSessions, type OpenTableSession } from '@/lib/actions/table-session'
import type { FloorSnapshot } from '@/lib/area-layout'
import { reservationQueueState } from '@/lib/reservation-queue'
import type { ReservationHistoryRow } from '@/lib/reservation-history'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { watchReservationQueue } from '@/lib/reservation-queue-watcher'
import { createClient } from '@/lib/supabase/client'
import { ringBellOnce, unlockBell } from '@/lib/bell'
import { createReservationReminderCoordinator, type ReminderStorage } from '@/lib/reservation-reminders'
import ReservationCard, { ReservationTableHeader } from './reservation-card'
import ReservationHistoryPanel, { type HistoryRange } from './reservation-history-panel'
import ReservationReminderBanner from './reservation-reminder-banner'
import {
  activeReservationRows,
  reservationChangeDecisionActions,
  type ReservationUiAction,
} from './reservation-ui'
import ReservationTablePicker, { heldTableIdsForReservationWindow } from './reservation-table-picker'
import { ReservationForm, type ReservationFormSubmit } from './reservation-form'
import CustomerCallTasks from './customer-call-tasks'
import { listReservationCustomerCalls, resolveReservationCustomerCall, type ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'

type TableOperation = {
  kind: 'confirm' | 'resolve_change' | 'reschedule'
  reservation: ReservationRow
  selectedTableIds: Set<string>
}

type ActiveOperation =
  | { kind: 'manual' }
  | TableOperation
  | { kind: 'reject' | 'arrive' | 'no_show' | 'cancel_store'; reservation: ReservationRow }

function queueRange() {
  const now = Date.now()
  return {
    recentSince: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    futureUntil: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

function browserStorage(): ReminderStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export default function ReservationsClient({
  storeId,
  initialReservations,
  initialError,
  initialFloor,
  initialFloorError,
  initialSessions,
  initialSessionsError,
  initialCustomerCalls,
}: {
  storeId: string
  initialReservations: ReservationRow[]
  initialError: string | null
  initialFloor: FloorSnapshot | null
  initialFloorError: string | null
  initialSessions: OpenTableSession[]
  initialSessionsError: string | null
  initialCustomerCalls: ReservationCustomerCallTask[]
}) {
  const [reservations, setReservations] = useState(initialReservations)
  const [reloadError, setReloadError] = useState(initialError)
  const [actionError, setActionError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [historyRange, setHistoryRange] = useState<HistoryRange>('30')
  const [historyRows, setHistoryRows] = useState<ReservationHistoryRow[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [floor, setFloor] = useState(initialFloor)
  const [floorError, setFloorError] = useState(initialFloorError)
  const [sessions, setSessions] = useState(initialSessions)
  const [sessionsError, setSessionsError] = useState(initialSessionsError)
  const [operation, setOperation] = useState<ActiveOperation | null>(null)
  const [busy, setBusy] = useState(false)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderAudioUnlocked, setReminderAudioUnlocked] = useState(false)
  const [customerCalls, setCustomerCalls] = useState(initialCustomerCalls)
  const [customerCallBusy, setCustomerCallBusy] = useState(false)
  const reminders = useMemo(() => createReservationReminderCoordinator({
    storeId, storage: browserStorage(), now: Date.now, playBell: ringBellOnce,
  }), [storeId])

  const load = useCallback(
    () => listReservationQueue(queueRange()),
    [],
  )

  useEffect(() => {
    const watcher = watchReservationQueue({
      client: createClient(),
      storeId,
      load,
      onRows: setReservations,
      onError: setReloadError,
      onConnected: setConnected,
    })
    return () => watcher.dispose()
  }, [load, storeId])

  useEffect(() => {
    reminders.sync(reservations, reminderAudioUnlocked)
  }, [reminders, reservations, reminderAudioUnlocked])

  const now = new Date()
  const activeRows = activeReservationRows(reservations, now)
  const nowLabel = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)

  // Cột "Đã qua": tải lại khi đổi khoảng ngày, và khi một lượt vừa chuyển sang đã xong (khoá theo danh sách id
  // lượt đã xong trong hàng đợi — không theo mảng, vì watcher trả mảng mới mỗi lần đọc lại).
  const finishedKey = reservations
    .filter((reservation) => reservationQueueState(reservation, now).kind === 'terminal')
    .map((reservation) => `${reservation.reservationId}:${reservation.status}`)
    .sort()
    .join(',')
  useEffect(() => {
    let cancelled = false
    const since = new Date(Date.now() - Number(historyRange) * 24 * 60 * 60 * 1000).toISOString()
    // "Đang tải" bật ở changeHistoryRange (lúc người dùng đổi khoảng), không bật ở đây: lần tải lại ngầm
    // khi có lượt vừa xong không cần nháy trạng thái.
    listReservationHistory(since)
      .then((result) => {
        if (cancelled) return
        if (result.ok) { setHistoryRows(result.rows); setHistoryError(null) }
        else setHistoryError(result.error)
      })
      .catch(() => { if (!cancelled) setHistoryError('Lỗi kết nối. Kiểm tra mạng rồi thử lại.') })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [historyRange, finishedKey])

  const reloadNow = async () => {
    const result = await load()
    if (result.ok) {
      setReservations(result.reservations)
      setReloadError(null)
    } else {
      setReloadError(result.error)
    }
  }

  const reloadCustomerCalls = useCallback(async () => {
    const result = await listReservationCustomerCalls()
    if (result.ok) setCustomerCalls(result.value)
    else setActionError(result.error)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => void reloadCustomerCalls(), 15_000)
    return () => window.clearInterval(timer)
  }, [reloadCustomerCalls])

  const resolveCustomerCall = async (taskId: string, outcome: 'called' | 'unreachable') => {
    setCustomerCallBusy(true)
    setActionError(null)
    const result = await resolveReservationCustomerCall(taskId, outcome)
    if (!result.ok) setActionError(result.error)
    await reloadCustomerCalls()
    setCustomerCallBusy(false)
  }

  const refreshTableContext = async (): Promise<boolean> => {
    const [nextFloor, nextSessions] = await Promise.all([loadFloorLayout(), listOpenTableSessions()])
    if (!nextFloor.ok) {
      setFloorError(nextFloor.error)
      setActionError(nextFloor.error)
      return false
    }
    if (!nextSessions.ok) {
      setSessionsError(nextSessions.error)
      setActionError(nextSessions.error)
      return false
    }
    setFloor(nextFloor.snapshot)
    setFloorError(null)
    setSessions(nextSessions.sessions)
    setSessionsError(null)
    return true
  }

  const toggleTable = (tableId: string) => {
    setOperation((current) => {
      if (!current || !('selectedTableIds' in current)) return current
      const next = new Set(current.selectedTableIds)
      if (next.has(tableId)) next.delete(tableId)
      else next.add(tableId)
      return { ...current, selectedTableIds: next }
    })
  }

  const runAction = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    setActionError(null)
    try {
      const result = await action()
      if (!result.ok) {
        setActionError(result.error ?? 'Không thể lưu thay đổi')
        return
      }
      setOperation(null)
      await reloadNow()
    } catch {
      setActionError('Lỗi kết nối. Kiểm tra mạng rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const openTableOperation = async (
    kind: 'confirm' | 'resolve_change' | 'reschedule',
    reservation: ReservationRow,
  ) => {
    setActionError(null)
    if (!await refreshTableContext()) return
    setOperation({ kind, reservation, selectedTableIds: new Set(reservation.tableIds) })
  }

  const beginAction = (action: ReservationUiAction, reservation: ReservationRow) => {
    if (action === 'confirm' || action === 'resolve_change' || action === 'reschedule') {
      void openTableOperation(action, reservation)
      return
    }
    if (action === 'open_session') {
      window.location.href = '/admin/pos'
      return
    }
    if (action === 'call') return
    setActionError(null)
    setOperation({ kind: action, reservation })
  }

  const otherReservationTableIds = (reservation: ReservationRow, arrivalAt = reservation.arrivalAt): Set<string> =>
    heldTableIdsForReservationWindow(
      reservations,
      reservation.reservationId,
      arrivalAt,
      reservation.planningHoldMinutes,
    )

  const dueReminders = reminders.due(reservations)

  const snoozeReminders = async (reservationIds: string[], minutes: 10 | 15 | 30) => {
    if (reservationIds.length === 0) return
    setReminderBusy(true)
    setActionError(null)
    try {
      const result = await snoozeReservationReminders(reservationIds, minutes)
      if (!result.ok) {
        setActionError(result.error)
        return
      }
      await reloadNow()
    } catch {
      setActionError('Lỗi kết nối. Kiểm tra mạng rồi thử lại.')
    } finally {
      setReminderBusy(false)
    }
  }

  const unlockReminderBell = () => {
    void unlockBell().then((unlocked) => { if (unlocked) setReminderAudioUnlocked(true) })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6" onClickCapture={unlockReminderBell}>
      {/* @container: hộp thoại cấu hình đè lên POS rộng hẹp tuỳ màn hình, nên chia cột theo
          bề rộng khung chứa chứ không theo viewport. */}
      <div className="@container mx-auto flex max-w-[1400px] flex-col gap-4">
        {/* Không lặp tiêu đề "Đặt bàn" (hộp thoại đã có) và bỏ nút Tải lại (danh sách tự cập nhật trực tiếp). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Việc cần duyệt, khách đang ngồi và lịch 7 ngày tới · bây giờ <span className="tabular">{nowLabel}</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[13px] text-muted sm:inline-flex">
              <span className={`size-2 rounded-full ${connected ? 'bg-success-dot' : 'bg-border-strong'}`} aria-hidden />
              {connected ? 'Cập nhật trực tiếp' : 'Đang kết nối lại…'}
            </span>
            <Button variant="primary" icon={<Plus />} onClick={() => { setActionError(null); setOperation({ kind: 'manual' }) }}>
              Tạo đặt bàn
            </Button>
          </div>
        </div>

        <ReservationReminderBanner
          reservationIds={dueReminders.reservationIds}
          busy={reminderBusy}
          onSnooze={(minutes) => void snoozeReminders(dueReminders.reservationIds, minutes)}
        />
        <CustomerCallTasks tasks={customerCalls} busy={customerCallBusy} onResolve={(id, outcome) => void resolveCustomerCall(id, outcome)} />

        {reloadError && (
          <div className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning ring-1 ring-warning-border">
            {reloadError}
          </div>
        )}
        {actionError && (
          <div className="flex items-start justify-between gap-3 rounded-xl bg-critical-bg px-4 py-3 text-sm text-critical ring-1 ring-critical-border">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="font-bold underline">Đóng</button>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 @5xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {activeRows.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface px-6 py-14 text-center">
                <p className="text-base font-semibold">Chưa có lịch đặt bàn nào trong 7 ngày tới</p>
                <p className="mt-1 text-sm text-muted">Khách đặt qua Zalo sẽ hiện ở đây để quán duyệt.</p>
              </div>
            ) : (
              <div role="table" aria-label="Lịch đặt bàn đang xử lý" className="overflow-hidden rounded-xl border border-border bg-surface">
                <ReservationTableHeader />
                {activeRows.map((reservation) => (
                  <ReservationCard
                    key={reservation.reservationId}
                    reservation={reservation}
                    now={now}
                    onAction={beginAction}
                    snoozeBusy={reminderBusy}
                    onSnooze={(row) => void snoozeReminders([row.reservationId], 10)}
                  />
                ))}
              </div>
            )}
          </div>
          <ReservationHistoryPanel
            range={historyRange}
            onRangeChange={(range) => { setHistoryLoading(true); setHistoryRange(range) }}
            rows={historyRows}
            loading={historyLoading}
            error={historyError}
          />
        </div>
      </div>
      {operation && (
        <ReservationOperationSheet title={operationTitle(operation)} onClose={() => { if (!busy) setOperation(null) }}>
          {operation.kind === 'manual' && (
            <ReservationForm
              mode="manual"
              busy={busy}
              actionError={actionError}
              onCancel={() => setOperation(null)}
              onSubmit={(values) => void runAction(() => createManualReservation({ ...values, zaloUserId: null }))}
            />
          )}
          {operation.kind === 'reschedule' && floor && (
            <ReservationForm
              key={operation.reservation.reservationId}
              mode="reschedule"
              initial={operation.reservation}
              selectedTableIds={operation.selectedTableIds}
              requiresTable={operation.reservation.tableIds.length > 0}
              busy={busy}
              actionError={actionError}
              onCancel={() => setOperation(null)}
              onSubmit={(values: ReservationFormSubmit) => void runAction(() => rescheduleReservation(
                operation.reservation.reservationId, values.arrivalAt, values.partySize,
                [...operation.selectedTableIds], values.reason,
              ))}
            >
              <ReservationTablePicker
                floor={floor} sessions={sessions} selectedTableIds={operation.selectedTableIds}
                currentReservationTableIds={new Set(operation.reservation.tableIds)}
                otherReservationTableIds={otherReservationTableIds(operation.reservation)}
                suggestedTableCount={operation.reservation.suggestedTableCount} onToggle={toggleTable}
              />
            </ReservationForm>
          )}
          {(operation.kind === 'confirm' || operation.kind === 'resolve_change') && floor && (
            <TableDecision
              operation={operation} floor={floor} sessions={sessions} busy={busy} actionError={actionError}
              otherReservationTableIds={otherReservationTableIds(
                operation.reservation,
                operation.kind === 'resolve_change'
                  ? operation.reservation.requestedArrivalAt ?? operation.reservation.arrivalAt
                  : operation.reservation.arrivalAt,
              )} onToggle={toggleTable}
              onCancel={() => setOperation(null)}
              onSubmit={() => {
                if (operation.selectedTableIds.size === 0) { setActionError('Chọn ít nhất một bàn'); return }
                if (operation.kind === 'confirm') {
                  void runAction(() => confirmReservation(operation.reservation.reservationId, [...operation.selectedTableIds]))
                } else {
                  void runAction(() => resolveReservationChange(operation.reservation.reservationId, true, [...operation.selectedTableIds]))
                }
              }}
              onReject={(note) => void runAction(() => resolveReservationChange(
                operation.reservation.reservationId, false, null, note,
              ))}
            />
          )}
          {(operation.kind === 'reject' || operation.kind === 'arrive' || operation.kind === 'no_show' || operation.kind === 'cancel_store') && (
            <SimpleDecision
              kind={operation.kind} reservation={operation.reservation} busy={busy} actionError={actionError}
              onCancel={() => setOperation(null)}
              onSubmit={(note) => {
                if (operation.kind === 'reject') void runAction(() => rejectReservation(operation.reservation.reservationId, note))
                if (operation.kind === 'arrive') void runAction(() => arriveReservation(operation.reservation.reservationId))
                if (operation.kind === 'no_show') void runAction(() => markReservationNoShow(operation.reservation.reservationId, note))
                if (operation.kind === 'cancel_store') void runAction(() => cancelStoreReservation(operation.reservation.reservationId, note ?? 'Chủ quán hủy đặt bàn'))
              }}
            />
          )}
          {(operation.kind === 'confirm' || operation.kind === 'resolve_change' || operation.kind === 'reschedule') && !floor && (
            <p className="text-sm text-critical">{floorError ?? sessionsError ?? 'Không tải được sơ đồ bàn'}</p>
          )}
        </ReservationOperationSheet>
      )}
    </div>
  )
}

function operationTitle(operation: ActiveOperation): string {
  if (operation.kind === 'manual') return 'Tạo đặt bàn thủ công'
  if (operation.kind === 'confirm') return 'Xác nhận & chọn bàn'
  if (operation.kind === 'resolve_change') return 'Xử lý yêu cầu đổi'
  if (operation.kind === 'reschedule') return 'Đổi lịch hoặc bàn'
  if (operation.kind === 'reject') return 'Từ chối đặt bàn'
  if (operation.kind === 'arrive') return 'Xác nhận khách đã đến'
  if (operation.kind === 'cancel_store') return 'Hủy đặt bàn'
  return 'Đánh dấu khách không đến'
}

function ReservationOperationSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/35 p-0 sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-foreground">{title}</h2><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-xl text-muted">×</button></div>
        {children}
      </section>
    </div>
  )
}

function TableDecision({ operation, floor, sessions, busy, actionError, otherReservationTableIds, onToggle, onCancel, onSubmit, onReject }: {
  operation: TableOperation
  floor: FloorSnapshot
  sessions: OpenTableSession[]
  busy: boolean
  actionError: string | null
  otherReservationTableIds: Set<string>
  onToggle: (tableId: string) => void
  onCancel: () => void
  onSubmit: () => void
  onReject: (note: string | null) => void
}) {
  const [rejectNote, setRejectNote] = useState('')
  const canRejectChange = operation.kind === 'resolve_change' && reservationChangeDecisionActions().includes('reject')
  return <div className="space-y-4">
    {operation.kind === 'resolve_change' && <p className="text-sm text-warning">Khách yêu cầu: {operation.reservation.changeNote ?? 'đổi thông tin đặt bàn'}</p>}
    <ReservationTablePicker floor={floor} sessions={sessions} selectedTableIds={operation.selectedTableIds}
      currentReservationTableIds={new Set(operation.reservation.tableIds)} otherReservationTableIds={otherReservationTableIds}
      suggestedTableCount={operation.reservation.suggestedTableCount} onToggle={onToggle} />
    {actionError && <p className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical">{actionError}</p>}
    {canRejectChange && <label className="block text-sm font-semibold text-foreground/80">Ghi chú từ chối (không bắt buộc)<textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 font-normal" /></label>}
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-border-strong font-bold">Hủy</button>{canRejectChange && <button type="button" disabled={busy} onClick={() => onReject(rejectNote.trim() || null)} className="min-h-11 flex-1 rounded-lg border border-critical-border bg-surface font-bold text-danger">Từ chối thay đổi</button>}<button type="button" disabled={busy} onClick={onSubmit} className="min-h-11 flex-1 rounded-lg bg-primary font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : operation.kind === 'confirm' ? 'Xác nhận' : 'Chấp nhận thay đổi'}</button></div>
  </div>
}

function SimpleDecision({ kind, reservation, busy, actionError, onCancel, onSubmit }: {
  kind: 'reject' | 'arrive' | 'no_show' | 'cancel_store'
  reservation: ReservationRow
  busy: boolean
  actionError: string | null
  onCancel: () => void
  onSubmit: (note: string | null) => void
}) {
  const [note, setNote] = useState('')
  const label = kind === 'arrive' ? 'Khách đã đến' : kind === 'no_show' ? 'Không đến' : kind === 'cancel_store' ? 'Hủy đặt bàn' : 'Từ chối đặt bàn'
  return <div className="space-y-4"><p className="text-sm text-foreground/80">{reservation.customerName} · {reservation.partySize} khách</p>
    {kind !== 'arrive' && <label className="block text-sm font-semibold text-foreground/80">{kind === 'cancel_store' ? 'Lý do hủy (bắt buộc)' : 'Ghi chú (không bắt buộc)'}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 font-normal" /></label>}
    {actionError && <p className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical">{actionError}</p>}
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-border-strong font-bold">Hủy</button><button type="button" disabled={busy || (kind === 'cancel_store' && !note.trim())} onClick={() => onSubmit(note.trim() || null)} className="min-h-11 flex-1 rounded-lg bg-foreground font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : label}</button></div>
  </div>
}
