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

export default function CashierClient({
  storeId,
  paymentTiming,
  initialFloor,
  initialFloorError,
  categories,
  initialSessions,
  initialError,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  initialFloor: FloorSnapshot | null
  initialFloorError: string | null
  categories: PosMenuCategory[]
  initialSessions: OpenTableSession[]
  initialError: string | null
}) {
  const floor = useFloorLayout(storeId, initialFloor, initialFloorError)
  const placed = floor.draft.tables
  const arrange = floor.arrange
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pickedSessionIds, setPickedSessionIds] = useState<Set<string>>(new Set())
  const [pickedTableIds, setPickedTableIds] = useState<Set<string>>(new Set())
  const [manualSessionId, setManualSessionId] = useState<string | null>(null)

  // Tải lại CẢ danh sách thay vì cộng dồn tại chỗ: tổng tiền phải do server tính, nhiều nguồn
  // cùng đổi một phiên (khách gọi thêm, bếp đổi trạng thái, nhân viên chốt bill ở máy khác).
  const reload = useCallback(async () => {
    const res = await listOpenTableSessions()
    if (res.ok) {
      setSessions(res.sessions)
      setError(null)
    } else {
      setError(res.error)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`cashier-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_sessions', filter: `store_id=eq.${storeId}` },
        () => void reload(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        () => void reload(),
      )
      // session_tables không có cột store_id nên không lọc được — nghe hết rồi tải lại.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_tables' },
        () => void reload(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          // Nối lại sau khi rớt mạng có thể đã lỡ sự kiện → tải lại cho chắc.
          void reload()
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          setConnected(false)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [storeId, reload])

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

  const sauKhiXong = async (msg?: string) => {
    setBusy(false)
    setSelectedSessionId(null)
    setPickedSessionIds(new Set())
    setPickedTableIds(new Set())
    if (msg) setError(msg)
    await reload()
  }

  const chay = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    if (!res.ok) {
      setBusy(false)
      setError(res.error ?? 'Lỗi')
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
      setError(res.error)
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
      setError(res.error)
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
      setError(res.error)
      return
    }
    onPrintOrder(orderId)
    setBusy(false)
    if (res.already) setError('Đơn này đã được xác nhận trước đó — chỉ in lại phiếu.')
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
        setError(res.error)
        return false
      }
      await reload()
      return true
    } catch {
      setError('Lỗi kết nối. Kiểm tra mạng rồi thử lại — bấm lại không tạo món trùng.')
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
      if (!res.ok) setError(res.error)
      else await reload()
    } catch {
      setError('Lỗi kết nối. Kiểm tra lại bill trước khi thao tác tiếp.')
    } finally {
      setBusy(false)
    }
  }

  const onRestoreOrderItem = async (orderItemId: string) => {
    setBusy(true)
    try {
      const res = await restoreOrderItem(orderItemId)
      if (!res.ok) setError(res.error)
      else await reload()
    } catch {
      setError('Lỗi kết nối. Kiểm tra lại bill trước khi thao tác tiếp.')
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

  // additive (ctrl/cmd+click) = tick thêm mâm để gộp bill; click thường = mở bill một mâm.
  const selectSession = (id: string, additive: boolean) => {
    if (arrange) return
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
    <div className="flex h-full min-h-0 flex-1" onClickCapture={() => unlockBell()}>
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
            {openSessions.length > 1 && !arrange && (
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
              disabled={floor.saving || !floor.ready}
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
              {floor.saving ? 'Đang xử lý…' : arrange ? 'Lưu sơ đồ' : '⇄ Sắp xếp bàn'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
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
          />
          </div>
        </div>

        <NewOrdersFeed
          sessions={sessions}
          busy={busy}
          onSelectSession={(id) => {
            if (arrange) return
            const table = placed.find(t => t.area_id === floor.areaId && stateByTable.get(t.id)?.session.session_id === id)
              ?? placed.find(t => stateByTable.get(t.id)?.session.session_id === id)
            if (table) floor.setAreaId(table.area_id)
            selectSession(id, false)
          }}
          onConfirmOrder={(id) => void onConfirmOrder(id)}
        />
      </div>

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
