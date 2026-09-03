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
import { saveTableLayout } from '@/lib/actions/table-layout'
import {
  changedPositions,
  layoutTables,
  moveTable,
  type LayoutTable,
  type PlacedTable,
} from '@/lib/table-layout'
import { assignTrayColors } from '@/lib/tray-colors'
import FloorMap, { type TableState } from './floor-map'
import BillPanel from './bill-panel'
import NewOrdersFeed from './new-orders-feed'

export default function CashierClient({
  storeId,
  paymentTiming,
  initialTables,
  initialSessions,
  initialError,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  initialTables: LayoutTable[]
  initialSessions: OpenTableSession[]
  initialError: string | null
}) {
  const [placed, setPlaced] = useState<PlacedTable[]>(() => layoutTables(initialTables))
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState(initialError)
  const [arrange, setArrange] = useState(false)
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [pickedSessionIds, setPickedSessionIds] = useState<Set<string>>(new Set())
  const [pickedTableIds, setPickedTableIds] = useState<Set<string>>(new Set())
  const reloading = useRef(false)

  // Tải lại CẢ danh sách thay vì cộng dồn tại chỗ: tổng tiền phải do server tính, nhiều nguồn
  // cùng đổi một phiên (khách gọi thêm, bếp đổi trạng thái, nhân viên chốt bill ở máy khác).
  const reload = useCallback(async () => {
    if (reloading.current) return
    reloading.current = true
    try {
      const res = await listOpenTableSessions()
      if (res.ok) {
        setSessions(res.sessions)
        setError(null)
      } else {
        setError(res.error)
      }
    } finally {
      reloading.current = false
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

  const onMove = async (tableId: string, x: number, y: number) => {
    const truoc = placed
    const sau = moveTable(truoc, tableId, x, y)
    if (sau === truoc) return
    setPlaced(sau)
    const res = await saveTableLayout(changedPositions(truoc, sau))
    // Lỗi mạng: trả vị trí về đúng như DB, không để sơ đồ máy này khác máy khác.
    if (!res.ok) {
      setPlaced(truoc)
      setError(res.error)
    }
  }

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

  const onPrint = (list: OpenTableSession[]) => {
    window.open(`/staff/tables/print?ids=${list.map((s) => s.session_id).join(',')}`, '_blank')
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

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
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
            <button
              onClick={() => {
                setArrange((v) => !v)
                setSelectedSessionId(null)
                setPickedTableIds(new Set())
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                arrange ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600'
              }`}
            >
              {arrange ? '✓ Xong sắp xếp' : '⇄ Sắp xếp bàn'}
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

        {arrange && (
          <p className="mx-5 mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Kéo bàn sang ô trống để sắp lại. Thả lên bàn khác thì hai bàn đổi chỗ. Xong nhớ bấm
            <b> Xong sắp xếp</b> để quay về chế độ thu tiền.
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <FloorMap
            placed={placed}
            stateByTable={stateByTable}
            arrange={arrange}
            selectedSessionId={selectedSessionId}
            pickedSessionIds={pickedSessionIds}
            pickedTableIds={pickedTableIds}
            onPickTable={togglePickTable}
            onSelectSession={selectSession}
            onMove={(id, x, y) => void onMove(id, x, y)}
          />
        </div>

        <NewOrdersFeed sessions={sessions} onSelectSession={(id) => selectSession(id, false)} />
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
    </div>
  )
}
