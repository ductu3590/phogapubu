'use client'

// Màn POS thu ngân (/admin/pos) — bố cục theo bản Stitch P01–P05 (spec 2026-10-03-pos-stitch-layout-design).
// Thay hẳn /admin/cashier cũ (đã xoá 2026-10-03 sau POS-1..4 PASS; URL cũ chuyển hướng về đây).
// Logic dữ liệu / thao tác giữ nguyên của POS cũ: cùng server action, cùng watcher realtime, cùng chuông.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Bell, BellRing, CalendarClock, CalendarDays, CalendarPlus, Check, Layers, ListTodo, TriangleAlert, X, Zap } from 'lucide-react'
import { TableStateLegend } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Banner, EmptyState, SkeletonList } from '@/components/ui/feedback'
import type { StatusTone } from '@/components/ui/status'
import { createClient } from '@/lib/supabase/client'
import {
  addTableToSession,
  closeTableSession,
  closeTableSessionsBulk,
  createTraySession,
  mergeSessionIntoTray,
  releaseTableSessionHost,
  type OpenTableSession,
} from '@/lib/actions/table-session'
import {
  addManualItems,
  confirmOrder,
  rejectOrder,
  restoreOrderItem,
  type OrderRejectReason,
  type PosManualItem,
  voidOrderItem,
} from '@/lib/actions/pos-order'
import { playBell, unlockBell } from '@/lib/bell'
import type { FloorSnapshot } from '@/lib/area-layout'
import { assignTrayColors } from '@/lib/tray-colors'
import type { ServiceRequestRow } from '@/lib/actions/service-requests'
import { serviceRequestSession } from '@/lib/service-request-queue'
import { buildWorkQueue, isReviewableOrder, type WorkFilter } from '@/lib/pos-work-queue'
import { watchCashierSessions } from '@/lib/cashier-session-watcher'
import { actionError, applyReloadError, type CashierError } from '@/lib/cashier-error-state'
import {
  arriveReservation,
  cancelStoreReservation,
  confirmReservation,
  createManualReservation,
  markReservationNoShow,
  snoozeReservationReminders,
  type ReservationRow,
} from '@/lib/actions/reservations'
import type { ReservationFormSubmit } from '../reservations/reservation-form'
import { watchReservationQueue } from '@/lib/reservation-queue-watcher'
import { createReservationReminderCoordinator, type ReminderStorage } from '@/lib/reservation-reminders'
import { resolveReservationCustomerCall, type ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'
import { readCustomerCalls, readOpenSessions, readPreorderQueue, readReservationQueue } from '@/lib/pos-browser-reads'
import {
  releaseReservationPreorder,
  requestReservationPreorderPrint,
  resolvePreorderWaste,
  type PreorderPrintKind,
  type ReservationPreorderRow,
} from '@/lib/actions/reservation-preorders'
import { buildTimeline, servingShiftEnd, timelineWindow, type ServingPeriod, type TimelineBar } from '@/lib/pos-timeline'
import { cn } from '@/lib/utils'
import { heldTableIdsForReservationWindow } from '../reservations/reservation-table-picker'
import { useFloorLayout } from './use-floor-layout'
import AreaControls from './area-controls'
import FloorMap, { type TableState } from './floor-map'
import RejectOrderSheet from './reject-order-sheet'
import ManualOrderSheet, { type PosMenuCategory } from './manual-order-sheet'
import ReservationPreorderPanel from './reservation-preorder-panel'
import {
  beginReservationTablePick,
  cancelReservationTablePick,
  selectArrivedReservationSession,
  toggleReservationTable,
  type ReservationTablePick,
} from './reservation-pos-state'
import TimelineView from './timeline-view'
import ListView from './list-view'
import ReservationDetail from './reservation-detail'
import NewReservationSheet from './new-reservation-sheet'
import { useNow } from './use-now'
import { useOnline } from './use-online'
import { useServiceRequests } from './use-service-requests'
import WorkQueue from './work-queue'
import PosBillPanel from './bill-panel'

type View = 'timeline' | 'floor' | 'list'

// Chip hàng đợi trên dải nền xanh than (Stitch P01): viền + chữ sáng cùng sắc, số tô đặc.
const QUEUE_CHIP: Record<StatusTone, { chip: string; count: string }> = {
  warning: { chip: 'border-amber-400/70 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20', count: 'bg-amber-500 text-white' },
  critical: { chip: 'border-red-400/70 bg-red-400/10 text-red-300 hover:bg-red-400/20', count: 'bg-red-600 text-white' },
  success: { chip: 'border-emerald-400/70 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20', count: 'bg-emerald-600 text-white' },
  info: { chip: 'border-sky-400/70 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20', count: 'bg-sky-600 text-white' },
  accent: { chip: 'border-orange-400/70 bg-orange-400/10 text-orange-300 hover:bg-orange-400/20', count: 'bg-orange-600 text-white' },
  neutral: { chip: 'border-slate-500 text-slate-200 hover:bg-slate-800', count: 'bg-slate-600 text-white' },
}
const ALL = '__all__'
const NO_AREA = '__none__'

function browserStorage(): ReminderStorage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function queueRange() {
  const now = Date.now()
  return {
    recentSince: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    futureUntil: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

export default function PosClient({
  storeId,
  storeName,
  paymentTiming,
  servingHours,
  slotIntervalMinutes,
  planningHoldMinutes,
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
  storeName: string
  paymentTiming: 'prepay' | 'postpay'
  servingHours: ServingPeriod[]
  /** Bước giờ đặt bàn (Cài đặt quán) — làm tròn giờ đặt bàn mới. */
  slotIntervalMinutes: number
  /** Khoảng giữ bàn của một đặt bàn (Cài đặt quán) — server cũng khoá bàn đúng khoảng này. */
  planningHoldMinutes: number
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
  // Một client Supabase trình duyệt cho cả trang: realtime + đọc định kỳ (lib/pos-browser-reads.ts).
  const supabase = useMemo(() => createClient(), [])
  const floor = useFloorLayout(storeId, initialFloor, initialFloorError)
  const placed = floor.draft.tables
  const arrange = floor.arrange
  const [view, setView] = useState<View>('timeline')
  const [areaFilter, setAreaFilter] = useState<string>(ALL)
  const [workOpen, setWorkOpen] = useState(false)
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all')
  const serviceRequests = useServiceRequests(storeId, initialRequests, initialRequestError)
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null)
  const clockNow = useNow()
  // null = đang hydrate (server chưa biết giờ trình duyệt); vùng phụ thuộc giờ chờ tới khi có.
  const now = clockNow ?? 0
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState<CashierError | null>(
    initialError || initialReservationError || initialPreorderError
      ? { source: 'reload', message: initialError ?? initialReservationError ?? initialPreorderError ?? 'Không tải được POS' }
      : null,
  )
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const online = useOnline()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pickedSessionIds, setPickedSessionIds] = useState<Set<string>>(new Set())
  // Chế độ gộp bill: bấm thanh / ô bàn là thêm-bớt mâm, không cần giữ Ctrl (máy cảm ứng không có Ctrl).
  const [mergeMode, setMergeMode] = useState(false)
  const [newBooking, setNewBooking] = useState<{ table: { id: string; table_number: string } | null; arrivalAt: string } | null>(null)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [pickedTableIds, setPickedTableIds] = useState<Set<string>>(new Set())
  const [manualSessionId, setManualSessionId] = useState<string | null>(null)
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null)
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

  // ─── Tải dữ liệu ─────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const res = await readOpenSessions(supabase, storeId)
    if (res.ok) {
      setSessions(res.sessions)
      setError((current) => applyReloadError(current, null))
    } else {
      setError((current) => applyReloadError(current, res.error))
    }
  }, [supabase, storeId])

  const reloadReservations = useCallback(async () => {
    if (!reservationsEnabled) return
    const result = await readReservationQueue(supabase, storeId, queueRange())
    if (result.ok) {
      setReservations(result.reservations)
      setError((current) => applyReloadError(current, null))
    } else {
      setError((current) => applyReloadError(current, result.error))
    }
  }, [reservationsEnabled, supabase, storeId])

  const reloadPreorders = useCallback(async () => {
    if (!reservationsEnabled) return
    const result = await readPreorderQueue(supabase, storeId)
    if (result.ok) {
      setPreorders(result.rows)
      setError((current) => applyReloadError(current, null))
    } else setError((current) => applyReloadError(current, result.error))
  }, [reservationsEnabled, supabase, storeId])

  const reloadCustomerCalls = useCallback(async () => {
    if (!reservationsEnabled) return
    const result = await readCustomerCalls(supabase, storeId)
    if (result.ok) setCustomerCalls(result.value)
    else setError((current) => applyReloadError(current, result.error))
  }, [reservationsEnabled, supabase, storeId])

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
    const watcher = watchCashierSessions({ client: supabase, storeId, reload, onConnected: setConnected })
    return () => watcher.dispose()
  }, [storeId, reload, supabase])

  useEffect(() => {
    if (!reservationsEnabled) return
    const watcher = watchReservationQueue({
      client: supabase,
      storeId,
      load: async () => readReservationQueue(supabase, storeId, queueRange()),
      onRows: setReservations,
      onError: (message) => setError((current) => applyReloadError(current, message)),
      onConnected: () => undefined,
    })
    return () => watcher.dispose()
  }, [reservationsEnabled, storeId, supabase])

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

  // Chuông đơn mới: kêu đúng MỘT lần cho mỗi đơn chưa xác nhận; ảnh chụp đầu tiên chỉ ghi nhận.
  const daKeu = useRef<Set<string> | null>(null)
  useEffect(() => {
    const dangCho = new Set<string>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      // Chỉ đơn cần thu ngân duyệt mới kêu — món ghi tay POS không kêu chuông.
      for (const o of s.orders) if (isReviewableOrder(o)) dangCho.add(o.id)
    }
    if (daKeu.current === null) {
      daKeu.current = dangCho
      return
    }
    let coMoi = false
    for (const id of dangCho) if (!daKeu.current.has(id)) coMoi = true
    daKeu.current = dangCho
    if (coMoi) playBell()
  }, [sessions])

  // ─── Dữ liệu dẫn xuất ────────────────────────────────────────────────────
  const trayColors = useMemo(() => assignTrayColors(sessions), [sessions])
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
  const pickReservation = reservationPick
    ? reservations.find((reservation) => reservation.reservationId === reservationPick.reservationId) ?? null
    : null
  const reservationBlockedTableIds = useMemo(() => pickReservation
    ? heldTableIdsForReservationWindow(reservations, pickReservation.reservationId, pickReservation.arrivalAt, pickReservation.planningHoldMinutes)
    : new Set<string>(), [reservations, pickReservation])
  const prearrivalReservedTableIds = useMemo(() => new Set(reservations
    .filter((reservation) => reservation.status === 'confirmed' && reservation.sessionId === null
      && new Date(reservation.arrivalAt).getTime() - 60 * 60_000 <= now
      && new Date(reservation.arrivalAt).getTime() + reservation.planningHoldMinutes * 60_000 > now)
    .flatMap((reservation) => reservation.tableIds)), [reservations, now])

  const timeWindow = useMemo(() => timelineWindow(servingHours, now), [servingHours, now])
  const timeline = useMemo(() => buildTimeline({
    tableIds: placed.map((t) => t.id),
    sessions,
    reservations,
    now,
    window: timeWindow,
  }), [placed, sessions, reservations, now, timeWindow])

  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.session_id, s])), [sessions])
  const reservationsById = useMemo(() => new Map(reservations.map((r) => [r.reservationId, r])), [reservations])
  const tableNames = useMemo(() => new Map(placed.map((t) => [t.id, t.table_number])), [placed])
  // Một thanh đại diện cho mỗi đặt bàn — cho Danh sách và cho thẻ chi tiết.
  const reservationBars = useMemo(() => {
    const seen = new Map<string, TimelineBar>()
    for (const bars of [...timeline.rows.values(), timeline.unassigned]) {
      for (const b of bars) if (b.reservationId && !seen.has(b.reservationId)) seen.set(b.reservationId, b)
    }
    return seen
  }, [timeline])

  const filteredTables = useMemo(() => placed.filter((t) =>
    areaFilter === ALL ? true : areaFilter === NO_AREA ? !t.area_id : t.area_id === areaFilter,
  ), [placed, areaFilter])
  const visibleTableIds = useMemo(() => new Set(filteredTables.map((t) => t.id)), [filteredTables])

  const servingCount = openSessions.filter((s) => s.order_count > 0).length
  const bookedSoon = [...reservationBars.values()].filter((b) => b.state === 'booked').length

  // ─── Thao tác ────────────────────────────────────────────────────────────
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
    const res = ids.length === 1
      ? await closeTableSession(ids[0], 'paid', instrument)
      : await closeTableSessionsBulk(ids, 'paid', instrument)
    if (!res.ok) {
      setBusy(false)
      reportActionError(res.error)
      return
    }
    await sauKhiXong('already' in res && res.already ? 'Bàn này vừa được máy khác chốt xong.' : undefined)
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
    await sauKhiXong(res.ordersLeftInKitchen > 0
      ? `Đã bỏ bàn. Còn ${res.ordersLeftInKitchen} món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay.`
      : undefined)
  }

  const onPrintOrder = (orderId: string) => {
    window.open(`/admin/pos/print-order?id=${orderId}`, '_blank')
  }

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

  const onRejectOrder = async (orderId: string, reason: OrderRejectReason, note: string | null) => {
    setBusy(true)
    try {
      const res = await rejectOrder(orderId, reason, note)
      if (!res.ok) {
        reportActionError(res.error)
        return false
      }
      if (res.already) reportActionError('Đơn này đã được từ chối trước đó.')
      await reload()
      return true
    } catch {
      reportActionError('Lỗi kết nối. Kiểm tra trạng thái đơn rồi thử lại.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const onPrint = (list: OpenTableSession[]) => {
    window.open(`/staff/tables/print?ids=${list.map((s) => s.session_id).join(',')}`, '_blank')
  }

  const onAddManualItems = async (sessionId: string, items: PosManualItem[], clientRequestId: string) => {
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

  const onVoidOrderItem = async (orderItemId: string, voidType: 'cancelled' | 'gift', reason?: string) => {
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

  // Chọn bàn cho đặt bàn chỉ làm được trên Sơ đồ bàn (bấm ô bàn) — tự chuyển sang tab đó.
  const beginReservationConfirm = (reservation: ReservationRow) => {
    if (arrange) { reportActionError('Lưu hoặc hủy sắp xếp bàn trước khi xử lý đặt bàn.'); return }
    const next = beginReservationTablePick({ selectedSessionId, pickedSessionIds, pickedTableIds, reservationPick }, reservation)
    setReservationPick(next.reservationPick)
    setSelectedReservationId(null)
    setWorkOpen(false)
    setView('floor')
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
    if (row.needsReview) {
      const released = await onReleasePreorder(row)
      if (!released.ok) return released
    }
    const latest = await readPreorderQueue(supabase, storeId)
    const fresh = latest.ok ? latest.rows.find((item) => item.orderId === row.orderId) ?? row : row
    const printKind: PreorderPrintKind = kind === 'original' && fresh.releasedRevision > 0 && !fresh.needsPrint
      ? (fresh.revision > 1 ? 'adjustment' : 'reprint') : kind
    const result = await requestReservationPreorderPrint(fresh.orderId, fresh.releasedRevision, printKind, undefined, reason)
    if (!result.ok) { reportActionError(result.error); return result }
    if (popup && result.printJobId) popup.location.href = `/admin/pos/print-order?job=${result.printJobId}`
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
    if (!pickReservation || !reservationPick || reservationPick.tableIds.size === 0) {
      reportActionError('Chọn ít nhất một bàn cho khách.')
      return
    }
    setBusy(true)
    const result = await confirmReservation(pickReservation.reservationId, [...reservationPick.tableIds])
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
    setSelectedReservationId(null)
    setSelectedSessionId(next.selectedSessionId)
    setPickedSessionIds(next.pickedSessionIds)
    setPickedTableIds(next.pickedTableIds)
    setReservationPick(next.reservationPick)
    setBusy(false)
  }

  const dueReminders = reminders.due(reservations)

  // Đặt bàn tạo tay luôn ở trạng thái chờ duyệt; có bàn đã bấm thì xác nhận giữ bàn đó ngay.
  // Bước 2 lỗi (bàn vừa bị giữ ở máy khác…) → đặt bàn vẫn nằm ở "Chưa xếp bàn", báo rõ cho thu ngân.
  const submitNewBooking = async (values: ReservationFormSubmit) => {
    if (!newBooking) return
    setBookingBusy(true)
    setBookingError(null)
    try {
      const created = await createManualReservation({ ...values, zaloUserId: null })
      if (!created.ok) { setBookingError(created.error); return }
      const id = created.reservation.reservationId
      let warning: string | null = null
      if (newBooking.table) {
        const confirmed = await confirmReservation(id, [newBooking.table.id])
        if (!confirmed.ok) warning = `Đã tạo đặt bàn nhưng chưa giữ được ${newBooking.table.table_number}: ${confirmed.error}. Đặt bàn đang ở hàng Chưa xếp bàn.`
      }
      await reloadReservations()
      setNewBooking(null)
      setSelectedSessionId(null)
      setPickedSessionIds(new Set())
      setSelectedReservationId(id)
      if (warning) reportActionError(warning)
    } catch {
      setBookingError('Lỗi kết nối. Kiểm tra trang Đặt bàn trước khi tạo lại để tránh trùng.')
    } finally {
      setBookingBusy(false)
    }
  }

  const reservationAction = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    try {
      const result = await fn()
      if (!result.ok) { reportActionError(result.error ?? 'Lỗi'); return }
      setSelectedReservationId(null)
      await Promise.all([reloadReservations(), reload()])
    } catch {
      reportActionError('Lỗi kết nối. Kiểm tra trạng thái đặt bàn rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const noShowReservation = (r: ReservationRow) => {
    if (!confirm(`Báo ${r.customerName} không đến? Bàn giữ cho khách sẽ được nhả.`)) return
    void reservationAction(() => markReservationNoShow(r.reservationId))
  }

  const snoozeReminders = async (reservationIds: string[], minutes: 10 | 15 | 30) => {
    if (reservationIds.length === 0) return
    setReminderBusy(true)
    reportActionError(null)
    try {
      const result = await snoozeReservationReminders(reservationIds, minutes)
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

  const selectSession = (id: string, additive: boolean) => {
    if (arrange || reservationPick) return
    setSelectedReservationId(null)
    setWorkOpen(false)
    if (additive || mergeMode) {
      // Mâm đang mở bill tính là mâm đầu tiên của nhóm gộp — trước đây bị rơi mất, phải bấm lại.
      const seed = selectedSessionId
      setPickedSessionIds((prev) => {
        const next = new Set(prev)
        if (next.size === 0 && seed && seed !== id) next.add(seed)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setSelectedSessionId(null)
      return
    }
    setSelectedSessionId(id)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
  }

  const selectReservation = (id: string) => {
    if (arrange || reservationPick) return
    setSelectedSessionId(null)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
    setWorkOpen(false)
    setSelectedReservationId(id)
  }

  const dongBill = () => {
    setSelectedSessionId(null)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
    setMergeMode(false)
  }

  const beginMerge = () => {
    setSelectedReservationId(null)
    setWorkOpen(false)
    setPickedTableIds(new Set())
    setPickedSessionIds(selectedSessionId ? new Set([selectedSessionId]) : new Set())
    setSelectedSessionId(null)
    setMergeMode(true)
  }

  const openWork = (filter: WorkFilter = 'all') => {
    dongBill()
    setSelectedReservationId(null)
    setWorkFilter(filter)
    setWorkOpen(true)
  }

  const resolveRequest = async (id: string) => {
    const message = await serviceRequests.resolve(id)
    if (message) reportActionError(message)
  }

  const openQueueSession = (sessionId: string) => {
    if (arrange || reservationPick) { reportActionError('Hoàn tất chọn bàn đặt trước hoặc sắp xếp bàn trước khi mở bill.'); return }
    selectSession(sessionId, false)
  }

  const workItems = buildWorkQueue({
    sessions,
    requests: serviceRequests.requests.map((r) => ({ ...r, session_id: serviceRequestSession(r, sessions)?.session_id ?? null })),
    reservations: reservationsEnabled ? reservations : [],
    reservationBars,
    customerCalls: reservationsEnabled ? customerCalls : [],
    now,
  })
  const requestsById = new Map(serviceRequests.requests.map((r) => [r.id, r]))
  const customerCallsById = new Map(customerCalls.map((t) => [t.taskId, t]))
  const reminderIds = new Set(dueReminders.reservationIds)

  // Cột phải: chọn bàn cho đặt bàn > chi tiết đặt bàn > bill > việc cần xử lý.
  const selectedReservation = selectedReservationId ? reservationsById.get(selectedReservationId) ?? null : null
  const hasBill = selected !== null || pickedSessions.length > 0 || pickedTableIds.size >= 2
  const panel: 'pick' | 'reservation' | 'bill' | 'work' =
    reservationPick && pickReservation ? 'pick' : selectedReservation ? 'reservation' : hasBill ? 'bill' : 'work'

  // "Trực tuyến" chỉ khi: trình duyệt có mạng + kênh realtime đang nối + lần tải dữ liệu gần nhất không lỗi.
  // Trước đây chỉ đọc trạng thái kênh realtime — mất mạng kênh chưa kịp báo nên vẫn hiện xanh.
  const live = online && connected && error?.source !== 'reload'

  const chips: { key: string; label: string; count: number; tone: StatusTone; icon: ReactNode; filter: WorkFilter }[] = [
    { key: 'orders', label: 'Lượt món chờ duyệt', count: workItems.filter((i) => i.kind === 'order').length, tone: 'success', icon: <BellRing />, filter: 'orders' },
    { key: 'calls', label: 'Gọi nhân viên', count: serviceRequests.requests.length, tone: 'info', icon: <Bell />, filter: 'calls' },
    ...(reservationsEnabled ? [
      { key: 'booking', label: 'Đặt bàn chờ duyệt', count: timeline.summary.pendingReservations, tone: 'warning' as const, icon: <CalendarDays />, filter: 'booking' as const },
      { key: 'late', label: 'Khách trễ / xung đột', count: timeline.summary.lateReservations + timeline.summary.conflicts, tone: 'critical' as const, icon: <TriangleAlert />, filter: 'booking' as const },
      { key: 'unassigned', label: 'Chưa xếp bàn', count: timeline.summary.unassignedReservations, tone: 'neutral' as const, icon: <CalendarClock />, filter: 'booking' as const },
    ] : []),
  ]
  const workTotal = workItems.length

  const areaItems = [
    { value: ALL, label: 'Tất cả', count: placed.length },
    ...(placed.some((t) => !t.area_id) && floor.draft.areas.length > 0
      ? [{ value: NO_AREA, label: 'Chưa phân khu', count: placed.filter((t) => !t.area_id).length }] : []),
    ...floor.draft.areas.map((a) => ({ value: a.id, label: a.name, count: placed.filter((t) => t.area_id === a.id).length })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-1 bg-slate-50" onClickCapture={unlockAllBells}>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Thanh trên — bản Stitch P01: tên trang + quán, trực tuyến, ca, nút chính cam đặc */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 md:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">MEVO POS</h1>
                <span className="max-w-48 truncate rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[13px] font-semibold text-orange-700">{storeName}</span>
              </div>
              <p className="hidden text-[13px] text-slate-500 sm:block">Điều hành bàn &amp; mâm gọi món</p>
            </div>
            <span
              role="status"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-medium',
                live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700',
              )}
            >
              <span className={cn('size-2 rounded-full', live ? 'bg-emerald-500' : 'animate-pulse bg-red-500')} aria-hidden />
              {live ? 'Trực tuyến' : 'Mất kết nối — đang thử lại'}
            </span>
            {clockNow !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[13px] font-medium text-slate-700 tabular">
                <CalendarDays className="size-3.5 text-slate-400" aria-hidden />
                {new Date(now).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })}
                <span className="font-semibold text-orange-600">{servingHours.length ? `Ca ${servingHours.map((p) => `${p.open}–${p.close}`).join(', ')}` : 'Phục vụ cả ngày'}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {reservationsEnabled && !arrange && !reservationPick && (
              <Button variant="primary" icon={<CalendarPlus />} onClick={() => {
                setBookingError(null)
                const step = Math.max(5, slotIntervalMinutes) * 60_000
                setNewBooking({ table: null, arrivalAt: new Date(Math.ceil(Date.now() / step) * step).toISOString() })
              }}>
                Đặt bàn mới
              </Button>
            )}
            {openSessions.length > 1 && !arrange && !reservationPick && !mergeMode && (
              <Button icon={<Layers />} onClick={beginMerge} className="border-slate-900 bg-slate-900 text-white hover:bg-slate-800 hover:text-white">Gộp bill</Button>
            )}
            <Button icon={<ListTodo />} onClick={() => openWork()} className="xl:hidden">
              Việc cần xử lý{workTotal > 0 ? ` · ${workTotal}` : ''}
            </Button>
          </div>
        </div>

        {mergeMode && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary-light px-4 py-2 md:px-5">
            <p className="text-sm font-medium text-primary">
              Gộp bill: bấm từng thanh / ô bàn để chọn mâm · <span className="tabular">đã chọn {pickedSessionIds.size}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => setPickedSessionIds((prev) => prev.size === openSessions.length ? new Set() : new Set(openSessions.map((s) => s.session_id)))}
              >
                {pickedSessionIds.size === openSessions.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </Button>
              <Button onClick={dongBill}>Thoát gộp bill</Button>
            </div>
          </div>
        )}

        {/* Hàng đợi — dải tối như Stitch P01: chip viền màu + số tô đặc. Bấm chip mở Việc cần xử lý đúng bộ lọc. */}
        <div className="flex items-center gap-2 overflow-x-auto bg-slate-900 px-4 py-2 [scrollbar-width:none] md:px-5 [&::-webkit-scrollbar]:hidden">
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold tracking-wide text-amber-400 uppercase">
            <Zap className="size-3.5" aria-hidden />Hàng đợi:
          </span>
          {chips.map((c) => {
            const active = c.count > 0
            const dark = QUEUE_CHIP[c.tone]
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => openWork(c.filter)}
                className={cn(
                  'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors [&>svg]:size-3.5',
                  active ? dark.chip : 'border-slate-700 text-slate-400 hover:text-slate-200',
                )}
              >
                {c.icon}
                {c.label}
                <span className={cn('rounded-full px-1.5 text-[12px] leading-5 font-bold tabular', active ? dark.count : 'bg-slate-800 text-slate-400')}>{c.count}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <div className="px-4 pt-3 md:px-5">
            {error.source === 'reload' ? (
              <Banner tone="error" title="Không tải được dữ liệu mới nhất" action={<Button onClick={() => void reload()} className="min-h-9 md:min-h-9">Thử lại</Button>}>
                {error.message}
              </Banner>
            ) : (
              <Banner tone="warning" title={error.message} onClose={() => setError(null)} />
            )}
          </div>
        )}

        {paymentTiming === 'prepay' && (
          <div className="px-4 pt-3 md:px-5">
            <Banner tone="info" title="Quán đang chạy trả trước">
              Phiên bàn chỉ dùng ở chế độ trả sau. Vẫn sắp xếp được vị trí bàn cho sau này.
            </Banner>
          </div>
        )}

        {/* Đổi cách xem + lọc khu vực + chú giải — bản Stitch P01 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2 md:px-5">
          <div role="tablist" aria-label="Cách xem" className="inline-flex rounded-lg bg-slate-100 p-1">
            {([['timeline', 'Timeline'], ['floor', 'Sơ đồ bàn'], ['list', 'Danh sách']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => {
                  if (arrange && value !== 'floor') return
                  if (reservationPick && value !== 'floor') return
                  setView(value)
                }}
                className={cn(
                  'min-h-9 cursor-pointer rounded-md px-4 text-sm font-semibold transition-colors',
                  view === value ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {view !== 'floor' && areaItems.length > 1 && (
            <label className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
              <span className="sr-only">Khu vực</span>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 focus:outline-none"
              >
                {areaItems.map((a) => (
                  <option key={a.value} value={a.value}>{a.value === ALL ? `Tất cả khu vực (${a.count} bàn)` : `${a.label} (${a.count} bàn)`}</option>
                ))}
              </select>
            </label>
          )}
          {view !== 'floor' && <TableStateLegend className="ml-auto hidden 2xl:flex" />}
          {view === 'floor' && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {arrange && <Button disabled={floor.saving} onClick={floor.cancel}>Hủy chỉnh sửa</Button>}
              <Button
                variant={arrange ? 'primary' : 'outline'}
                icon={arrange ? <Check /> : <ArrowLeftRight />}
                isLoading={floor.saving}
                disabled={!floor.ready || reservationPick !== null}
                onClick={() => {
                  if (arrange) { void floor.save(); return }
                  void floor.begin()
                  dongBill()
                  setSelectedReservationId(null)
                }}
              >
                {reservationPick ? 'Đang chọn bàn đặt trước' : arrange ? 'Lưu sơ đồ' : 'Sắp xếp bàn'}
              </Button>
            </div>
          )}
        </div>

        {/* Vùng chính */}
        <div className="flex min-h-0 flex-1 flex-col">
          {clockNow === null && view !== 'floor' && <div className="px-4 md:px-5"><SkeletonList rows={6} label="Đang dựng Timeline" /></div>}
          {clockNow !== null && view === 'timeline' && (
            <TimelineView
              tables={filteredTables}
              areas={floor.draft.areas}
              rows={timeline.rows}
              unassigned={areaFilter === ALL ? timeline.unassigned : []}
              window={timeWindow}
              now={now}
              sessionsById={sessionsById}
              reservationsById={reservationsById}
              trayColors={trayColors}
              selectedSessionId={selectedSessionId}
              pickedSessionIds={pickedSessionIds}
              selectedReservationId={selectedReservationId}
              onSelectSession={selectSession}
              onSelectReservation={selectReservation}
              slotMinutes={slotIntervalMinutes}
              holdMinutes={planningHoldMinutes}
              bookUntil={servingShiftEnd(servingHours, now)}
              onPickSlot={reservationsEnabled && !mergeMode && !arrange && !reservationPick ? (tableId, at) => {
                const table = placed.find((t) => t.id === tableId)
                if (!table || arrange || reservationPick) return
                setBookingError(null)
                setNewBooking({ table: { id: table.id, table_number: table.table_number }, arrivalAt: new Date(at).toISOString() })
              } : undefined}
            />
          )}
          {clockNow !== null && view === 'list' && (
            <ListView
              sessions={sessions}
              reservationBars={[...reservationBars.values()]}
              reservationsById={reservationsById}
              tableNames={tableNames}
              trayColors={trayColors}
              visibleTableIds={visibleTableIds}
              selectedSessionId={selectedSessionId}
              pickedSessionIds={pickedSessionIds}
              selectedReservationId={selectedReservationId}
              onSelectSession={selectSession}
              onSelectReservation={selectReservation}
            />
          )}
          {view === 'floor' && (
            <div className="min-h-0 flex-1 overflow-auto">
              <AreaControls floor={floor} />
              <div className="overflow-auto p-4 md:p-5">
                {floor.ready && !placed.some((t) => t.area_id === floor.areaId) && (
                  <EmptyState className="py-4 text-left">Khu vực này chưa có bàn. Vào Sắp xếp bàn để phân bàn vào khu vực.</EmptyState>
                )}
                <FloorMap
                  placed={placed.filter((t) => t.area_id === floor.areaId)}
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
          )}
        </div>

        {/* Chân — số liệu có chấm màu như Stitch P01 */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-slate-200 bg-white px-4 py-2.5 md:px-5">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-slate-500 tabular">
            <li><b className="text-base font-bold text-slate-900">{placed.length}</b> tổng bàn</li>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" aria-hidden /><b className="font-bold text-emerald-700">{servingCount} bàn đang ăn</b>{placed.length > 0 ? ` (${Math.round((servingCount / placed.length) * 100)}% lấp đầy)` : ''}</li>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-orange-500" aria-hidden /><b className="font-bold text-orange-700">{bookedSoon} đã đặt trong ca</b></li>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-slate-400" aria-hidden /><b className="font-bold text-slate-700">{freeTables.length} bàn trống</b></li>
          </ul>
          <TableStateLegend className="2xl:hidden" />
        </div>
      </div>

      {workOpen && (
        <button type="button" aria-label="Đóng việc cần xử lý" onClick={() => setWorkOpen(false)} className="fixed inset-0 z-30 cursor-default bg-foreground/30 xl:hidden" />
      )}
      {/* Cột phải. Việc cần xử lý LUÔN mount (ẩn bằng class) để watcher gọi NV + chuông không bị tắt. */}
      <aside
        aria-label="Việc cần xử lý"
        className={cn(
          'flex-col bg-surface',
          // Màn hẹp: sheet phủ khi bấm chip/nút; từ xl: cột cố định khi không mở bill.
          workOpen ? 'fixed inset-y-0 right-0 z-40 flex w-full max-w-md shadow-modal xl:static xl:inset-auto xl:z-auto xl:max-w-none xl:shadow-none' : 'hidden',
          panel === 'work' ? 'xl:flex' : 'xl:hidden',
          'xl:w-[400px] xl:shrink-0 xl:border-l xl:border-border',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-orange-600 bg-white py-2.5 pr-2 pl-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-orange-700">
            <ListTodo className="size-5" aria-hidden />Hàng đợi việc cần xử lý
            {workTotal > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 text-[12px] leading-6 font-bold text-white tabular">{workTotal}</span>}
          </h2>
          <IconButton icon={<X />} label="Đóng" onClick={() => setWorkOpen(false)} className="xl:hidden" />
        </header>
        <WorkQueue
          items={workItems}
          filter={workFilter}
          onFilter={setWorkFilter}
          now={now}
          reservationsEnabled={reservationsEnabled}
          sessionsById={sessionsById}
          requestsById={requestsById}
          reservationsById={reservationsById}
          customerCallsById={customerCallsById}
          trayColors={trayColors}
          reminderIds={reminderIds}
          busy={busy || reminderBusy || customerCallBusy}
          requestBusyId={serviceRequests.busyId}
          requestError={serviceRequests.error}
          footer={reservationsEnabled ? (
            <div className="-mx-4 mt-1">
              <ReservationPreorderPanel
                rows={preorders}
                busy={busy}
                onRelease={onReleasePreorder}
                onPrint={onPrintPreorder}
                onResolveWaste={onResolvePreorderWaste}
              />
            </div>
          ) : null}
          handlers={{
            onOpenSession: openQueueSession,
            onOpenReservation: selectReservation,
            onConfirmOrder: (id) => void onConfirmOrder(id),
            onRejectOrder: setRejectingOrderId,
            onResolveRequest: (id) => void resolveRequest(id),
            onConfirmReservation: beginReservationConfirm,
            onArriveReservation: (r) => void arriveReservationFromPos(r),
            onSnoozeReservation: (id, minutes) => void snoozeReminders([id], minutes),
            onResolveCustomerCall: (id, outcome) => void resolveCustomerCall(id, outcome),
          }}
        />
      </aside>

      {panel === 'pick' && pickReservation && reservationPick && (
        <ReservationPickPanel
          reservation={pickReservation}
          tableCount={reservationPick.tableIds.size}
          busy={busy}
          onCancel={cancelReservationPick}
          onConfirm={() => void confirmReservationFromPos()}
        />
      )}
      {panel === 'reservation' && selectedReservation && (
        <ReservationDetail
          key={selectedReservation.reservationId}
          reservation={selectedReservation}
          bar={reservationBars.get(selectedReservation.reservationId)}
          preorder={preorders.find((p) => p.reservationId === selectedReservation.reservationId)}
          busy={busy || reminderBusy}
          canSnooze={new Date(selectedReservation.arrivalAt).getTime() <= now}
          onClose={() => setSelectedReservationId(null)}
          onConfirm={beginReservationConfirm}
          onArrive={(r) => void arriveReservationFromPos(r)}
          onSnooze={(id, minutes) => void snoozeReminders([id], minutes)}
          onNoShow={noShowReservation}
          onCancel={(r, reason) => void reservationAction(() => cancelStoreReservation(r.reservationId, reason))}
          onPrintPreorder={(row, popup, reason) => onPrintPreorder(row, 'original', popup, reason)}
        />
      )}
      {panel === 'bill' && (
        <PosBillPanel
          // Đổi bàn / gộp bill khác = bill mới: về tab Hoá đơn, thoát màn thanh toán đang dở.
          key={selected?.session_id ?? [...pickedSessionIds].sort().join(',') ?? 'pick'}
          trayColors={trayColors}
          preorders={preorders}
          onPrintPreorder={(row, popup, reason) => onPrintPreorder(row, 'original', popup, reason)}
          selected={selected}
          picked={pickedSessions}
          freeTables={freeTables}
          otherSessions={openSessions.filter((s) => s.session_id !== selectedSessionId)}
          pickedFreeTables={pickedTableIds.size}
          busy={busy}
          onPay={(list, ins) => void onPay(list, ins)}
          onPrint={onPrint}
          onConfirmOrder={(id) => void onConfirmOrder(id)}
          onRejectOrder={setRejectingOrderId}
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
          onDismiss={dongBill}
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
      {newBooking && (
        <NewReservationSheet
          table={newBooking.table}
          arrivalAt={newBooking.arrivalAt}
          busy={bookingBusy}
          error={bookingError}
          onClose={() => setNewBooking(null)}
          onSubmit={(values) => void submitNewBooking(values)}
        />
      )}
      {rejectingOrderId && (
        <RejectOrderSheet
          orderId={rejectingOrderId}
          busy={busy}
          onClose={() => setRejectingOrderId(null)}
          onConfirm={(reason, note) => onRejectOrder(rejectingOrderId, reason, note)}
        />
      )}
    </div>
  )
}

function ReservationPickPanel({ reservation, tableCount, busy, onCancel, onConfirm }: {
  reservation: ReservationRow
  tableCount: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <aside
      aria-label="Xác nhận đặt bàn"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 border-t border-info-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-modal xl:static xl:w-[400px] xl:shrink-0 xl:overflow-y-auto xl:border-t-0 xl:border-l xl:border-l-border xl:shadow-none"
    >
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarDays className="size-5 text-info" aria-hidden />
          Xác nhận đặt bàn
        </h2>
        <p className="mt-1 text-sm font-medium text-foreground">{reservation.customerName} · {reservation.partySize} khách</p>
        <p className="mt-1 text-[13px] text-muted">Chọn bàn trực tiếp trên sơ đồ. Bill đang mở được giữ nguyên và không thể thao tác trong lúc này.</p>
      </div>
      <p className="rounded-lg bg-info-bg px-3 py-2 text-sm font-medium text-info tabular">Đã chọn {tableCount} bàn</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="touch" disabled={busy} onClick={onCancel}>Hủy</Button>
        <Button variant="primary" size="touch" isLoading={busy} disabled={tableCount === 0} onClick={onConfirm}>Xác nhận bàn</Button>
      </div>
    </aside>
  )
}
