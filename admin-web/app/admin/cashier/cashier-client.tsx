'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  addTableToSession,
  closeTableSession,
  closeTableSessionsBulk,
  createTraySession,
  listOpenTableSessions,
  mergeSessionIntoTray,
  releaseTableSessionHost,
  type OpenTableSession,
} from '@/lib/actions/table-session'
import {
  addManualItems,
  confirmOrder,
  restoreOrderItem,
  type PosManualItem,
  voidOrderItem,
} from '@/lib/actions/pos-order'
import { playBell, unlockBell } from '@/lib/bell'
import { pendingCount } from '@/lib/table-status'
import type { FloorSnapshot } from '@/lib/area-layout'
import { useFloorLayout } from './use-floor-layout'
import AreaControls from './area-controls'
import { assignTrayColors } from '@/lib/tray-colors'
import FloorMap, { type TableState } from './floor-map'
import BillPanel from './bill-panel'
import NewOrdersFeed from './new-orders-feed'
import ManualOrderSheet, { type PosMenuCategory } from './manual-order-sheet'
import ServiceRequestQueue from './service-request-queue'
import type { ServiceRequestRow } from '@/lib/actions/service-requests'
import { serviceRequestSession } from '@/lib/service-request-queue'
import { watchCashierSessions } from '@/lib/cashier-session-watcher'
import { actionError, applyReloadError, type CashierError } from '@/lib/cashier-error-state'
import {
  arriveReservation,
  confirmReservation,
  listReservationQueue,
  snoozeReservationReminders,
  type ReservationRow,
} from '@/lib/actions/reservations'
import { watchReservationQueue } from '@/lib/reservation-queue-watcher'
import { createReservationReminderCoordinator, type ReminderStorage } from '@/lib/reservation-reminders'
import { heldTableIdsForReservationWindow } from '../reservations/reservation-table-picker'
import ReservationQueuePanel from './reservation-queue-panel'
import ReservationPreorderPanel from './reservation-preorder-panel'
import CustomerCallTasks from '../reservations/customer-call-tasks'
import { listReservationCustomerCalls, resolveReservationCustomerCall, type ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
import {
  listReservationPreorderQueue,
  releaseReservationPreorder,
  requestReservationPreorderPrint,
  resolvePreorderWaste,
  type PreorderPrintKind,
  type ReservationPreorderRow,
} from '@/lib/actions/reservation-preorders'
import {
  beginReservationTablePick,
  cancelReservationTablePick,
  selectArrivedReservationSession,
  toggleReservationTable,
  type ReservationTablePick,
} from './reservation-pos-state'

function browserStorage(): ReminderStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export default function CashierClient({
  storeId,
  paymentTiming,
  initialFloor,
  initialFloorError,
  categories,
  initialSessions,
  initialError,
  initialRequests,
  initialRequestError,
  reservationsEnabled,
  initialReservations,
  initialReservationError,
  initialPreorders,
  initialPreorderError,
  initialCustomerCalls,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  initialFloor: FloorSnapshot | null
  initialFloorError: string | null
  categories: PosMenuCategory[]
  initialSessions: OpenTableSession[]
  initialError: string | null
  initialRequests: ServiceRequestRow[]
  initialRequestError: string | null
  reservationsEnabled: boolean
  initialReservations: ReservationRow[]
  initialReservationError: string | null
  initialPreorders: ReservationPreorderRow[]
  initialPreorderError: string | null
  initialCustomerCalls: ReservationCustomerCallTask[]
}) {
  const floor = useFloorLayout(storeId, initialFloor, initialFloorError)
  const placed = floor.draft.tables
  const arrange = floor.arrange
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState<CashierError | null>(
    initialError || initialReservationError || initialPreorderError
      ? { source: 'reload', message: initialError ?? initialReservationError ?? initialPreorderError ?? 'Không tải được POS' }
      : null,
  )
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pickedSessionIds, setPickedSessionIds] = useState<Set<string>>(new Set())
  const [pickedTableIds, setPickedTableIds] = useState<Set<string>>(new Set())
  const [manualSessionId, setManualSessionId] = useState<string | null>(null)
  const [reservations, setReservations] = useState(initialReservations)
  const [preorders, setPreorders] = useState(initialPreorders)
  const [reservationPick, setReservationPick] = useState<ReservationTablePick | null>(null)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderAudioUnlocked, setReminderAudioUnlocked] = useState(false)
  const [customerCalls, setCustomerCalls] = useState(initialCustomerCalls)
  const [customerCallBusy, setCustomerCallBusy] = useState(false)
  const reminders = useMemo(() => createReservationReminderCoordinator({
    storeId, storage: browserStorage(), now: Date.now, playBell,
  }), [storeId])
  const reportActionError = useCallback((message: string | null) => {
    setError(message ? actionError(message) : null)
  }, [])

  // Tải lại CẢ danh sách thay vì cộng dồn tại chỗ: tổng tiền phải do server tính, nhiều nguồn
  // cùng đổi một phiên (khách gọi thêm, bếp đổi trạng thái, nhân viên chốt bill ở máy khác).
  const reload = useCallback(async () => {
    const res = await listOpenTableSessions()
    if (res.ok) {
      setSessions(res.sessions)
      setError((current) => applyReloadError(current, null))
    } else {
      setError((current) => applyReloadError(current, res.error))
    }
  }, [])

  const reloadReservations = useCallback(async () => {
    if (!reservationsEnabled) return
    const now = Date.now()
    const result = await listReservationQueue({
      recentSince: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      futureUntil: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (result.ok) {
      setReservations(result.reservations)
      setError((current) => applyReloadError(current, null))
    } else {
      setError((current) => applyReloadError(current, result.error))
    }
  }, [reservationsEnabled])

  const reloadPreorders = useCallback(async () => {
    if (!reservationsEnabled) return
    const result = await listReservationPreorderQueue()
    if (result.ok) {
      setPreorders(result.rows)
      setError((current) => applyReloadError(current, null))
    } else setError((current) => applyReloadError(current, result.error))
  }, [reservationsEnabled])

  const reloadCustomerCalls = useCallback(async () => {
    if (!reservationsEnabled) return
    const result = await listReservationCustomerCalls()
    if (result.ok) setCustomerCalls(result.value)
    else setError((current) => applyReloadError(current, result.error))
  }, [reservationsEnabled])

  // Đến hạn 60 phút là mốc thời gian, không nhất thiết có row realtime đổi.
  // Poll riêng để POS tab đang mở tự thấy task mà không cần F5/focus.
  useEffect(() => {
    if (!reservationsEnabled) return
    const timer = window.setInterval(() => void reloadCustomerCalls(), 15_000)
    return () => window.clearInterval(timer)
  }, [reservationsEnabled, reloadCustomerCalls])

  const resolveCustomerCall = async (taskId: string, outcome: 'called' | 'unreachable') => {
    setCustomerCallBusy(true)
    const result = await resolveReservationCustomerCall(taskId, outcome)
    if (!result.ok) reportActionError(result.error)
    await reloadCustomerCalls()
    setCustomerCallBusy(false)
  }

  useEffect(() => {
    const watcher = watchCashierSessions({
      client: createClient(),
      storeId,
      reload,
      onConnected: setConnected,
    })
    return () => {
      watcher.dispose()
    }
  }, [storeId, reload])

  useEffect(() => {
    if (!reservationsEnabled) return
    const watcher = watchReservationQueue({
      client: createClient(),
      storeId,
      load: async () => {
        const now = Date.now()
        return listReservationQueue({
          recentSince: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
          futureUntil: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
      },
      onRows: setReservations,
      onError: (message) => setError((current) => applyReloadError(current, message)),
      onConnected: () => undefined,
    })
    return () => watcher.dispose()
  }, [reservationsEnabled, storeId])

  // Queue preorder chưa có session/table nên watcher phiên bàn không nhìn thấy. Poll 5 giây là
  // fallback đáng tin; không xóa lỗi thao tác đang hiển thị (applyReloadError giữ action error).
  useEffect(() => {
    if (!reservationsEnabled) return
    const timer = window.setInterval(() => { void reloadPreorders() }, 5_000)
    const onFocus = () => { void reloadPreorders() }
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [reservationsEnabled, reloadPreorders])

  useEffect(() => {
    if (reservationsEnabled) reminders.sync(reservations, reminderAudioUnlocked)
  }, [reminders, reservations, reminderAudioUnlocked, reservationsEnabled])

  // ─── Chuông đơn mới ───────────────────────────────────────────────────────
  // Kêu đúng MỘT lần cho mỗi đơn chưa xác nhận. Ảnh chụp đầu tiên chỉ ghi nhận, không kêu:
  // mở/F5 lại màn hình giữa ca mà rú lên một tràng cho đám đơn cũ là phản tác dụng.
  const daKeu = useRef<Set<string> | null>(null)
  useEffect(() => {
    const dangCho = new Set<string>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      for (const o of s.orders) if (o.status === 'pending') dangCho.add(o.id)
    }
    if (daKeu.current === null) {
      daKeu.current = dangCho
      return
    }
    let coMoi = false
    for (const id of dangCho) {
      if (!daKeu.current.has(id)) coMoi = true
    }
    daKeu.current = dangCho
    if (coMoi) playBell()
  }, [sessions])

  const trayColors = useMemo(() => assignTrayColors(sessions), [sessions])

  // Bàn nào đang thuộc phiên nào — nguồn cho màu ô và cho việc bấm ô ra bill.
  const stateByTable = useMemo(() => {
    const m = new Map<string, TableState>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      for (const t of s.tables) m.set(t.id, { session: s, tray: trayColors.get(s.session_id) })
    }
    return m
  }, [sessions, trayColors])

  const openSessions = sessions.filter((s) => s.status === 'open')
  const selected = sessions.find((s) => s.session_id === selectedSessionId) ?? null
  const pickedSessions = sessions.filter((s) => pickedSessionIds.has(s.session_id))
  const freeTables = placed.filter((t) => !stateByTable.has(t.id))
  const selectedReservation = reservationPick
    ? reservations.find((reservation) => reservation.reservationId === reservationPick.reservationId) ?? null
    : null
  const reservationBlockedTableIds = useMemo(() => selectedReservation
    ? heldTableIdsForReservationWindow(
      reservations,
      selectedReservation.reservationId,
      selectedReservation.arrivalAt,
      selectedReservation.planningHoldMinutes,
    )
    : new Set<string>(), [reservations, selectedReservation])
  const prearrivalReservedTableIds = useMemo(() => new Set(reservations
    .filter((reservation) => reservation.status === 'confirmed' && reservation.sessionId === null
      && new Date(reservation.arrivalAt).getTime() - 60 * 60_000 <= Date.now()
      && new Date(reservation.arrivalAt).getTime() + reservation.planningHoldMinutes * 60_000 > Date.now())
    .flatMap((reservation) => reservation.tableIds)), [reservations])

  const sauKhiXong = async (msg?: string) => {
    setBusy(false)
    setSelectedSessionId(null)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
    if (msg) reportActionError(msg)
    else setError(null)
    await reload()
  }

  const chay = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    if (!res.ok) {
      setBusy(false)
      reportActionError(res.error ?? 'Lỗi')
      return
    }
    await sauKhiXong()
  }

  const onPay = async (list: OpenTableSession[], instrument: 'cash' | 'bank') => {
    setBusy(true)
    const ids = list.map((s) => s.session_id)
    const res =
      ids.length === 1
        ? await closeTableSession(ids[0], 'paid', instrument)
        : await closeTableSessionsBulk(ids, 'paid', instrument)
    if (!res.ok) {
      setBusy(false)
      reportActionError(res.error)
      return
    }
    // close_table_session idempotent: máy khác vừa chốt thì báo cho biết, KHÔNG hiện lỗi đỏ.
    await sauKhiXong(
      'already' in res && res.already ? 'Bàn này vừa được máy khác chốt xong.' : undefined,
    )
  }

  const onReset = async (s: OpenTableSession) => {
    if (!confirm(`Bỏ bàn ${s.table_number}? Đơn chưa nấu và chưa thu tiền sẽ bị huỷ.`)) return
    setBusy(true)
    const res = await closeTableSession(s.session_id, 'staff_reset', null)
    if (!res.ok) {
      setBusy(false)
      reportActionError(res.error)
      return
    }
    await sauKhiXong(
      res.ordersLeftInKitchen > 0
        ? `Đã bỏ bàn. Còn ${res.ordersLeftInKitchen} món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay.`
        : undefined,
    )
  }

  // Xác nhận đơn rồi in ngay 2 liên. KHÔNG gọi sauKhiXong: giữ nguyên bàn đang chọn để thu ngân
  // bấm tiếp đơn thứ hai của cùng bàn, khỏi phải tìm lại trên sơ đồ.
  const onConfirmOrder = async (orderId: string) => {
    setBusy(true)
    const res = await confirmOrder(orderId)
    if (!res.ok) {
      setBusy(false)
      reportActionError(res.error)
      return
    }
    onPrintOrder(orderId)
    setBusy(false)
    if (res.already) reportActionError('Đơn này đã được xác nhận trước đó — chỉ in lại phiếu.')
    await reload()
  }

  const onPrintOrder = (orderId: string) => {
    window.open(`/admin/cashier/print-order?id=${orderId}`, '_blank')
  }

  const onPrint = (list: OpenTableSession[]) => {
    window.open(`/staff/tables/print?ids=${list.map((s) => s.session_id).join(',')}`, '_blank')
  }

  // Một lần bấm/ retry giữ nguyên UUID do sheet sở hữu. RPC dùng UUID đó để không tạo hai
  // đơn POS nếu mạng rớt ngay sau khi Supabase đã commit.
  const onAddManualItems = async (
    sessionId: string,
    items: PosManualItem[],
    clientRequestId: string,
  ) => {
    setBusy(true)
    try {
      const res = await addManualItems(sessionId, items, clientRequestId)
      if (!res.ok) {
        reportActionError(res.error)
        return false
      }
      await reload()
      return true
    } catch {
      reportActionError('Lỗi kết nối. Kiểm tra mạng rồi thử lại — bấm lại không tạo món trùng.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const onVoidOrderItem = async (
    orderItemId: string,
    voidType: 'cancelled' | 'gift',
    reason?: string,
  ) => {
    setBusy(true)
    try {
      const res = await voidOrderItem(orderItemId, voidType, reason)
      if (!res.ok) reportActionError(res.error)
      else await reload()
    } catch {
      reportActionError('Lỗi kết nối. Kiểm tra lại bill trước khi thao tác tiếp.')
    } finally {
      setBusy(false)
    }
  }

  const onRestoreOrderItem = async (orderItemId: string) => {
    setBusy(true)
    try {
      const res = await restoreOrderItem(orderItemId)
      if (!res.ok) reportActionError(res.error)
      else await reload()
    } catch {
      reportActionError('Lỗi kết nối. Kiểm tra lại bill trước khi thao tác tiếp.')
    } finally {
      setBusy(false)
    }
  }

  const togglePickTable = (id: string) =>
    setPickedTableIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const beginReservationConfirm = (reservation: ReservationRow) => {
    if (arrange) { reportActionError('Lưu hoặc hủy sắp xếp bàn trước khi xử lý đặt bàn.'); return }
    const next = beginReservationTablePick({ selectedSessionId, pickedSessionIds, pickedTableIds, reservationPick }, reservation)
    setReservationPick(next.reservationPick)
  }

  const onReleasePreorder = async (row: ReservationPreorderRow) => {
    setBusy(true)
    const result = await releaseReservationPreorder(row.orderId, row.revision)
    setBusy(false)
    if (!result.ok) { reportActionError(result.error); return result }
    await Promise.all([reloadPreorders(), reload()])
    return result
  }

  const onPrintPreorder = async (row: ReservationPreorderRow, kind: PreorderPrintKind, popup: Window | null, reason?: string) => {
    // Nếu chưa release, release trước; popup đã được panel mở trong gesture từ người dùng.
    if (row.needsReview) {
      const released = await onReleasePreorder(row)
      if (!released.ok) return released
    }
    const latest = await listReservationPreorderQueue()
    const fresh = latest.ok ? latest.rows.find((item) => item.orderId === row.orderId) ?? row : row
    const printKind: PreorderPrintKind = kind === 'original' && fresh.releasedRevision > 0 && !fresh.needsPrint
      ? (fresh.revision > 1 ? 'adjustment' : 'reprint') : kind
    const result = await requestReservationPreorderPrint(fresh.orderId, fresh.releasedRevision, printKind, undefined, reason)
    if (!result.ok) { reportActionError(result.error); return result }
    if (popup && result.printJobId) popup.location.href = `/admin/cashier/print-order?job=${result.printJobId}`
    else reportActionError('Phiếu đã tạo nhưng trình duyệt chặn tab in. Mở lại từ POS để in.')
    await reloadPreorders()
    return result
  }

  const onResolvePreorderWaste = async (row: ReservationPreorderRow, reason: string) => {
    setBusy(true)
    const result = await resolvePreorderWaste(row.orderId, reason)
    setBusy(false)
    if (!result.ok) reportActionError(result.error)
    else await reloadPreorders()
    return result
  }

  const toggleReservationPickTable = (tableId: string) => {
    const next = toggleReservationTable({ selectedSessionId, pickedSessionIds, pickedTableIds, reservationPick }, tableId)
    setReservationPick(next.reservationPick)
  }

  const cancelReservationPick = () => {
    const next = cancelReservationTablePick({ selectedSessionId, pickedSessionIds, pickedTableIds, reservationPick })
    setReservationPick(next.reservationPick)
  }

  const confirmReservationFromPos = async () => {
    if (!selectedReservation || !reservationPick || reservationPick.tableIds.size === 0) {
      reportActionError('Chọn ít nhất một bàn cho khách.')
      return
    }
    setBusy(true)
    const result = await confirmReservation(selectedReservation.reservationId, [...reservationPick.tableIds])
    if (!result.ok) {
      setBusy(false)
      reportActionError(result.error)
      return
    }
    setReservationPick(null)
    await Promise.all([reload(), reloadReservations()])
    setBusy(false)
  }

  const arriveReservationFromPos = async (reservation: ReservationRow) => {
    if (arrange) { reportActionError('Lưu hoặc hủy sắp xếp bàn trước khi nhận khách.'); return }
    setBusy(true)
    const result = await arriveReservation(reservation.reservationId)
    if (!result.ok) {
      setBusy(false)
      reportActionError(result.error)
      return
    }
    await Promise.all([reload(), reloadReservations()])
    if (!result.reservation.sessionId) {
      setBusy(false)
      reportActionError('Đã nhận khách nhưng chưa tìm thấy phiên bàn. Tải lại POS rồi thử mở bill.')
      return
    }
    const next = selectArrivedReservationSession(
      { selectedSessionId, pickedSessionIds, pickedTableIds, reservationPick },
      result.reservation.sessionId,
    )
    setSelectedSessionId(next.selectedSessionId)
    setPickedSessionIds(next.pickedSessionIds)
    setPickedTableIds(next.pickedTableIds)
    setReservationPick(next.reservationPick)
    setBusy(false)
  }

  const dueReminders = reminders.due(reservations)

  const snoozeReminders = async (minutes: 10 | 15 | 30) => {
    if (dueReminders.reservationIds.length === 0) return
    setReminderBusy(true)
    reportActionError(null)
    try {
      const result = await snoozeReservationReminders(dueReminders.reservationIds, minutes)
      if (!result.ok) {
        reportActionError(result.error)
        return
      }
      await reloadReservations()
    } catch {
      reportActionError('Lỗi kết nối. Kiểm tra mạng rồi thử lại.')
    } finally {
      setReminderBusy(false)
    }
  }

  const unlockAllBells = () => {
    void unlockBell().then((unlocked) => { if (unlocked) setReminderAudioUnlocked(true) })
  }

  // additive (ctrl/cmd+click) = tick thêm mâm để gộp bill; click thường = mở bill một mâm.
  const selectSession = (id: string, additive: boolean) => {
    if (arrange || reservationPick) return
    if (additive) {
      setPickedSessionIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      return
    }
    setSelectedSessionId(id)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
  }

  const tongDonCho = sessions.reduce((n, s) => n + pendingCount(s), 0)

  return (
    // Trình duyệt chặn phát tiếng cho tới khi người dùng chạm vào trang — mượn cú bấm đầu tiên
    // (bất kỳ chỗ nào) để mở khoá chuông, khỏi bắt thu ngân bấm một nút "bật tiếng" riêng.
    <div className="flex h-full min-h-0 flex-1" onClickCapture={unlockAllBells}>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}
            />
            <span className="text-xs font-medium text-gray-500">
              {connected ? 'Đang cập nhật trực tiếp' : 'Mất kết nối — đang thử lại...'}
            </span>
            <span className="ml-3 text-xs text-gray-400">
              {placed.length} bàn · {freeTables.length} trống
            </span>
            {tongDonCho > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                🔔 {tongDonCho} đơn chờ xác nhận
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {openSessions.length > 1 && !arrange && !reservationPick && (
              <button
                onClick={() =>
                  setPickedSessionIds((prev) =>
                    prev.size > 0 ? new Set() : new Set(openSessions.map((s) => s.session_id)),
                  )
                }
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                {pickedSessionIds.size > 0 ? 'Bỏ chọn tất cả' : 'Chọn tất cả để gộp bill'}
              </button>
            )}
            {arrange && <button disabled={floor.saving} onClick={floor.cancel} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Hủy chỉnh sửa</button>}
            <button
              disabled={floor.saving || !floor.ready || reservationPick !== null}
              onClick={() => {
                if (arrange) { void floor.save(); return }
                void floor.begin()
                setSelectedSessionId(null)
                setPickedTableIds(new Set())
                setPickedSessionIds(new Set())
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                arrange ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600'
              }`}
            >
              {reservationPick ? 'Đang chọn bàn đặt trước' : floor.saving ? 'Đang xử lý…' : arrange ? 'Lưu sơ đồ' : '⇄ Sắp xếp bàn'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error.message}
            <button onClick={() => setError(null)} className="ml-2 font-semibold underline">
              Đóng
            </button>
          </div>
        )}

        {paymentTiming === 'prepay' && (
          <p className="mx-5 mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500">
            Quán đang chạy <b>trả trước</b> — phiên bàn chỉ dùng ở chế độ trả sau. Vẫn sắp xếp
            được vị trí bàn cho sau này.
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {reservationsEnabled && (
            <CustomerCallTasks tasks={customerCalls} busy={customerCallBusy} onResolve={(id, outcome) => void resolveCustomerCall(id, outcome)} />
          )}
          {reservationsEnabled && (
            <ReservationQueuePanel
              reservations={reservations}
              now={new Date()}
              onConfirm={beginReservationConfirm}
              onArrive={(reservation) => void arriveReservationFromPos(reservation)}
              reminderIds={dueReminders.reservationIds}
              reminderBusy={reminderBusy}
              onSnooze={(minutes) => void snoozeReminders(minutes)}
            />
          )}
          {reservationsEnabled && (
            <ReservationPreorderPanel
              rows={preorders}
              busy={busy}
              onRelease={onReleasePreorder}
              onPrint={onPrintPreorder}
              onResolveWaste={onResolvePreorderWaste}
            />
          )}
          <ServiceRequestQueue
            storeId={storeId}
            initialRequests={initialRequests}
            initialError={initialRequestError}
            sessions={sessions}
            onSelect={(request) => {
              if (arrange || reservationPick) { reportActionError('Hoàn tất chọn bàn đặt trước hoặc sắp xếp bàn trước khi mở yêu cầu.'); return }
              const session = serviceRequestSession(request, sessions)
              const table = placed.find(t => session ? session.tables.some(st => st.id === t.id) : t.id === request.table_id)
              if (table) floor.setAreaId(table.area_id)
              setSelectedSessionId(session?.session_id ?? null)
              setPickedSessionIds(new Set())
              setPickedTableIds(new Set(session ? [] : [request.table_id]))
              if (!session) reportActionError(`${request.table_number}: không còn phiên tương ứng để mở bill. Yêu cầu vẫn chờ xử lý.`)
            }}
          />
          <AreaControls floor={floor} />
          <div className="overflow-auto p-5">
          {floor.ready && !placed.some(t => t.area_id === floor.areaId) && <p className="mb-3 text-sm text-gray-500">Khu vực này chưa có bàn. Vào Sắp xếp bàn để phân bàn vào khu vực.</p>}
          <FloorMap
            placed={placed.filter(t => t.area_id === floor.areaId)}
            stateByTable={stateByTable}
            arrange={arrange}
            locked={floor.saving}
            selectedSessionId={selectedSessionId}
            pickedSessionIds={pickedSessionIds}
            pickedTableIds={pickedTableIds}
            onPickTable={togglePickTable}
            onSelectSession={selectSession}
            onMove={floor.move}
            mode={reservationPick ? 'reservation' : 'normal'}
            reservationTableIds={reservationPick?.tableIds ?? new Set()}
            reservationBlockedTableIds={reservationBlockedTableIds}
            prearrivalReservedTableIds={prearrivalReservedTableIds}
            onReservationPick={toggleReservationPickTable}
          />
          </div>
        </div>

        <NewOrdersFeed
          sessions={sessions}
          busy={busy}
          onSelectSession={(id) => {
            if (arrange || reservationPick) return
            const table = placed.find(t => t.area_id === floor.areaId && stateByTable.get(t.id)?.session.session_id === id)
              ?? placed.find(t => stateByTable.get(t.id)?.session.session_id === id)
            if (table) floor.setAreaId(table.area_id)
            selectSession(id, false)
          }}
          onConfirmOrder={(id) => void onConfirmOrder(id)}
        />
      </div>

      {reservationPick && selectedReservation ? (
        <ReservationPickPanel
          reservation={selectedReservation}
          tableCount={reservationPick.tableIds.size}
          busy={busy}
          onCancel={cancelReservationPick}
          onConfirm={() => void confirmReservationFromPos()}
        />
      ) : (
      <BillPanel
        selected={selected}
        picked={pickedSessions}
        freeTables={freeTables}
        otherSessions={openSessions.filter((s) => s.session_id !== selectedSessionId)}
        pickedFreeTables={pickedTableIds.size}
        busy={busy}
        onPay={(list, ins) => void onPay(list, ins)}
        onPrint={onPrint}
        onConfirmOrder={(id) => void onConfirmOrder(id)}
        onPrintOrder={onPrintOrder}
        onOpenManualOrder={(sessionId) => setManualSessionId(sessionId)}
        onVoidOrderItem={(itemId, type, reason) => void onVoidOrderItem(itemId, type, reason)}
        onRestoreOrderItem={(itemId) => void onRestoreOrderItem(itemId)}
        onReset={(s) => void onReset(s)}
        onCreateTray={() => void chay(() => createTraySession([...pickedTableIds]))}
        onAddTable={(sid, tid) => void chay(() => addTableToSession(sid, tid))}
        onMergeInto={(sid, target) => void chay(() => mergeSessionIntoTray(sid, target))}
        onReleaseHost={(sid) => void chay(() => releaseTableSessionHost(sid))}
        onClearPick={() => {
          setPickedSessionIds(new Set())
          setPickedTableIds(new Set())
        }}
      />
      )}
      {manualSessionId && (() => {
        const session = sessions.find((item) => item.session_id === manualSessionId)
        if (!session) return null
        return (
          <ManualOrderSheet
            tableNumber={session.table_number}
            categories={categories}
            busy={busy}
            onClose={() => setManualSessionId(null)}
            onSubmit={(items, requestId) => onAddManualItems(session.session_id, items, requestId)}
          />
        )
      })()}
    </div>
  )
}

function ReservationPickPanel({
  reservation,
  tableCount,
  busy,
  onCancel,
  onConfirm,
}: {
  reservation: ReservationRow
  tableCount: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <aside className="flex w-[400px] flex-shrink-0 flex-col overflow-y-auto border-l border-sky-200 bg-sky-50 p-4">
      <h2 className="text-base font-bold text-sky-950">📅 Xác nhận đặt bàn</h2>
      <p className="mt-1 text-sm font-semibold text-gray-900">{reservation.customerName} · {reservation.partySize} khách</p>
      <p className="mt-1 text-xs text-gray-600">Chọn bàn trực tiếp trên sơ đồ. Bill đang mở được giữ nguyên và không thể thao tác trong lúc này.</p>
      <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-sky-900">Đã chọn {tableCount} bàn</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border border-sky-200 bg-white text-sm font-bold text-sky-900 disabled:opacity-50">Hủy</button>
        <button type="button" disabled={busy || tableCount === 0} onClick={onConfirm} className="min-h-11 rounded-lg bg-sky-700 text-sm font-bold text-white disabled:opacity-50">Xác nhận bàn</button>
      </div>
    </aside>
  )
}
