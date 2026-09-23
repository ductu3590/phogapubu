'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  arriveReservation,
  cancelStoreReservation,
  confirmReservation,
  createManualReservation,
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
import { reservationQueueState, sortReservationQueue } from '@/lib/reservation-queue'
import { watchReservationQueue } from '@/lib/reservation-queue-watcher'
import { createClient } from '@/lib/supabase/client'
import { playBell, unlockBell } from '@/lib/bell'
import { createReservationReminderCoordinator, type ReminderStorage } from '@/lib/reservation-reminders'
import ReservationCard from './reservation-card'
import ReservationReminderBanner from './reservation-reminder-banner'
import {
  filterReservationsForDate,
  groupReservationsForDisplay,
  reservationLocalDate,
  reservationChangeDecisionActions,
  type ReservationUiAction,
} from './reservation-ui'
import ReservationTablePicker, { heldTableIdsForReservationWindow } from './reservation-table-picker'
import { ReservationForm, type ReservationFormSubmit } from './reservation-form'

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
}: {
  storeId: string
  initialReservations: ReservationRow[]
  initialError: string | null
  initialFloor: FloorSnapshot | null
  initialFloorError: string | null
  initialSessions: OpenTableSession[]
  initialSessionsError: string | null
}) {
  const [reservations, setReservations] = useState(initialReservations)
  const [reloadError, setReloadError] = useState(initialError)
  const [actionError, setActionError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => reservationLocalDate(new Date().toISOString()) ?? '')
  const [floor, setFloor] = useState(initialFloor)
  const [floorError, setFloorError] = useState(initialFloorError)
  const [sessions, setSessions] = useState(initialSessions)
  const [sessionsError, setSessionsError] = useState(initialSessionsError)
  const [operation, setOperation] = useState<ActiveOperation | null>(null)
  const [busy, setBusy] = useState(false)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderAudioUnlocked, setReminderAudioUnlocked] = useState(false)
  const reminders = useMemo(() => createReservationReminderCoordinator({
    storeId, storage: browserStorage(), now: Date.now, playBell,
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
  const filtered = filterReservationsForDate(reservations, selectedDate, now)
  const groups = groupReservationsForDisplay(sortReservationQueue(filtered, now), now)
  const pendingCount = reservations.filter((reservation) => {
    const kind = reservationQueueState(reservation, now).kind
    return kind === 'pending' || kind === 'change_requested'
  }).length
  const overdueCount = reservations.filter(
    (reservation) => reservationQueueState(reservation, now).kind === 'overdue',
  ).length

  const reloadNow = async () => {
    const result = await load()
    if (result.ok) {
      setReservations(result.reservations)
      setReloadError(null)
    } else {
      setReloadError(result.error)
    }
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
      window.location.href = '/admin/cashier'
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6" onClickCapture={unlockReminderBell}>
      <div className="mx-auto max-w-3xl">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">📅 Đặt bàn</h1>
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {connected ? 'Đang cập nhật trực tiếp' : 'Đang kết nối — vẫn tự tải lại mỗi vài giây'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setActionError(null); setOperation({ kind: 'manual' }) }}
              className="min-h-11 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-600"
            >
              + Tạo đặt bàn
            </button>
            <button
              type="button"
              onClick={() => void reloadNow()}
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              ↻ Tải lại
            </button>
          </div>
        </header>

        <ReservationReminderBanner
          reservationIds={dueReminders.reservationIds}
          busy={reminderBusy}
          onSnooze={(minutes) => void snoozeReminders(dueReminders.reservationIds, minutes)}
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cần duyệt / đổi</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{pendingCount}</p>
          </div>
          <div className="rounded-xl bg-red-50 p-3 shadow-sm ring-1 ring-red-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Quá giờ chưa đến</p>
            <p className="mt-1 text-2xl font-bold text-red-800">{overdueCount}</p>
          </div>
        </div>

        <label className="mb-5 block rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Lọc lịch đã xử lý / sắp tới</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900"
          />
          <span className="mt-1 block text-xs text-gray-500">Việc chờ duyệt, khách yêu cầu đổi, quá giờ và đã đến luôn được giữ lại.</span>
        </label>

        {reloadError && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {reloadError}
          </div>
        )}
        {actionError && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="font-bold underline">Đóng</button>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center text-sm text-gray-500">
            Chưa có đặt bàn cần theo dõi trong khoảng thời gian này.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-700">
                  {group.title} <span className="text-gray-400">({group.reservations.length})</span>
                </h2>
                <div className="space-y-3">
                  {group.reservations.map((reservation) => (
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
              </section>
            ))}
          </div>
        )}
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
            <p className="text-sm text-red-800">{floorError ?? sessionsError ?? 'Không tải được sơ đồ bàn'}</p>
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
      <section className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-gray-900">{title}</h2><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-xl text-gray-600">×</button></div>
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
    {operation.kind === 'resolve_change' && <p className="text-sm text-amber-800">Khách yêu cầu: {operation.reservation.changeNote ?? 'đổi thông tin đặt bàn'}</p>}
    <ReservationTablePicker floor={floor} sessions={sessions} selectedTableIds={operation.selectedTableIds}
      currentReservationTableIds={new Set(operation.reservation.tableIds)} otherReservationTableIds={otherReservationTableIds}
      suggestedTableCount={operation.reservation.suggestedTableCount} onToggle={onToggle} />
    {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>}
    {canRejectChange && <label className="block text-sm font-semibold text-gray-700">Ghi chú từ chối (không bắt buộc)<textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>}
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-gray-300 font-bold">Hủy</button>{canRejectChange && <button type="button" disabled={busy} onClick={() => onReject(rejectNote.trim() || null)} className="min-h-11 flex-1 rounded-lg border border-red-300 bg-white font-bold text-red-700">Từ chối thay đổi</button>}<button type="button" disabled={busy} onClick={onSubmit} className="min-h-11 flex-1 rounded-lg bg-orange-500 font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : operation.kind === 'confirm' ? 'Xác nhận' : 'Chấp nhận thay đổi'}</button></div>
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
  return <div className="space-y-4"><p className="text-sm text-gray-700">{reservation.customerName} · {reservation.partySize} khách</p>
    {kind !== 'arrive' && <label className="block text-sm font-semibold text-gray-700">{kind === 'cancel_store' ? 'Lý do hủy (bắt buộc)' : 'Ghi chú (không bắt buộc)'}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>}
    {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</p>}
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 flex-1 rounded-lg border border-gray-300 font-bold">Hủy</button><button type="button" disabled={busy || (kind === 'cancel_store' && !note.trim())} onClick={() => onSubmit(note.trim() || null)} className="min-h-11 flex-1 rounded-lg bg-gray-900 font-bold text-white disabled:opacity-50">{busy ? 'Đang lưu…' : label}</button></div>
  </div>
}
