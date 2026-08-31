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
  type SessionTable,
} from '@/lib/actions/table-session'

const dong = (n: number) => n.toLocaleString('vi-VN') + 'đ'

const gio = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý',
  confirmed: 'Đã nhận',
  cooking: 'Đang làm',
  ready: 'Xong',
  paid: 'Hoàn tất',
}

type Sheet =
  | { kind: 'none' }
  | { kind: 'pay'; sessions: OpenTableSession[] }
  | { kind: 'more'; session: OpenTableSession }
  | { kind: 'reset'; session: OpenTableSession }
  | { kind: 'tray' }
  | { kind: 'merge'; session: OpenTableSession }
  | { kind: 'addTable'; session: OpenTableSession }

export default function TablesClient({
  storeId,
  paymentTiming,
  allTables,
  initialSessions,
  initialError,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  allTables: SessionTable[]
  initialSessions: OpenTableSession[]
  initialError: string | null
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })
  const [connected, setConnected] = useState(false)
  // Chế độ gộp bill: tick nhiều mâm rồi thu một lần. Tách bill là MẶC ĐỊNH (mỗi mâm vốn là
  // một bill con) — chỉ bật chế độ này khi trưởng đoàn trả chung.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickTables, setPickTables] = useState<Set<string>>(new Set())
  const reloading = useRef(false)

  // Realtime: KHÔNG cộng dồn tại chỗ mà tải lại CẢ danh sách. Tổng tiền phải do server tính —
  // nhiều nguồn cùng đổi một phiên (khách gọi thêm, bếp đổi trạng thái, nhân viên khác chốt
  // bill), cộng tay ở client là mời hai số lệch nhau, và optimistic + event realtime cùng đến
  // sẽ đếm đôi.
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
      .channel(`staff-tables-${storeId}`)
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

  // Bàn trống = bàn không nằm trong phiên nào đang mở.
  const freeTables = useMemo(() => {
    const busyIds = new Set<string>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      for (const t of s.tables) busyIds.add(t.id)
    }
    return allTables.filter((t) => !busyIds.has(t.id))
  }, [sessions, allTables])

  const openSessions = sessions.filter((s) => s.status === 'open')
  const pickedSessions = sessions.filter((s) => picked.has(s.session_id))
  const pickedTotal = pickedSessions.reduce((n, s) => n + s.total, 0)

  const finish = async (msg?: string) => {
    setBusy(false)
    setSheet({ kind: 'none' })
    setPicked(new Set())
    setPickTables(new Set())
    if (msg) setError(msg)
    await reload()
  }

  const doClose = async (
    list: OpenTableSession[],
    reason: 'paid' | 'staff_reset',
    instrument: 'cash' | 'bank' | null,
  ) => {
    setBusy(true)
    const ids = list.map((s) => s.session_id)
    const res =
      ids.length === 1
        ? await closeTableSession(ids[0], reason, instrument)
        : await closeTableSessionsBulk(ids, reason, instrument)
    if (!res.ok) {
      setBusy(false)
      setError(res.error)
      return
    }
    await finish(
      reason === 'staff_reset' && res.ordersLeftInKitchen > 0
        ? `Đã bỏ bàn. Còn ${res.ordersLeftInKitchen} món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay.`
        : undefined,
    )
  }

  const printBill = (list: OpenTableSession[]) => {
    const ids = list.map((s) => s.session_id).join(',')
    window.open(`/staff/tables/print?ids=${ids}`, '_blank')
  }

  const doSimple = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const res = await fn()
    if (!res.ok) {
      setBusy(false)
      setError(res.error ?? 'Lỗi')
      return
    }
    await finish()
  }

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleTable = (id: string) =>
    setPickTables((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}
          />
          <span className="text-xs font-medium text-gray-500">
            {connected ? 'Đang cập nhật trực tiếp' : 'Mất kết nối — đang thử lại...'}
          </span>
        </div>
        <button
          onClick={() => setSheet({ kind: 'tray' })}
          disabled={busy || freeTables.length === 0}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white active:bg-black disabled:opacity-40"
        >
          ＋ Ghép mâm
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-semibold underline">
            Đóng
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-24">
        {sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">Chưa có bàn nào đang mở.</p>
            {paymentTiming === 'prepay' && (
              <p className="mt-2 text-xs text-gray-400">
                Quán đang chạy <b>trả trước</b> — phiên bàn chỉ dùng ở chế độ trả sau.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li
                key={s.session_id}
                className={`rounded-xl border bg-white p-3 ${
                  picked.has(s.session_id)
                    ? 'border-orange-400 ring-1 ring-orange-200'
                    : s.needs_review
                      ? 'border-amber-300'
                      : 'border-gray-100'
                }`}
              >
                {s.needs_review && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                    ⏰ Phiên đã quá 6 giờ không hoạt động nên bàn được mở khoá, nhưng
                    <b> vẫn còn {dong(s.unpaid_total)} chưa thu</b>. Xử lý nốt rồi đóng.
                  </p>
                )}

                <div className="mb-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={picked.has(s.session_id)}
                    onChange={() => togglePick(s.session_id)}
                    className="mt-1 h-4 w-4 flex-shrink-0 accent-orange-500"
                    aria-label={`Chọn ${s.table_number} để gộp bill`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">
                      {s.is_open_ordering ? '🍲' : '🪑'} {s.table_number}
                      {s.is_open_ordering && s.tables.length > 1 && (
                        <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          mâm {s.tables.length} bàn
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      mở lúc {gio(s.opened_at)} · {s.order_count} đơn
                      {s.opened_by === 'staff' && ' · nhân viên mở'}
                      {!s.is_open_ordering && !s.has_host && ' · chưa có máy giữ bàn'}
                    </p>
                  </div>
                  <span className="flex-shrink-0 font-bold text-gray-900">{dong(s.total)}</span>
                </div>

                <ul className="mb-2.5 space-y-1">
                  {s.orders.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 text-gray-600">
                        •{' '}
                        {o.items.map((it) => it.name + ' ×' + it.quantity).join(', ') ||
                          'Không có món'}
                      </span>
                      <span className="flex-shrink-0 text-gray-400">
                        {gio(o.created_at)} {STATUS_LABEL[o.status] ?? o.status}
                        {o.payment_received_at && ' ✓'}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSheet({ kind: 'pay', sessions: [s] })}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                  >
                    Thu tiền &amp; đóng bàn
                  </button>
                  <button
                    onClick={() => printBill([s])}
                    disabled={busy}
                    className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-500 active:bg-gray-50 disabled:opacity-50"
                    title="In bill"
                  >
                    🖨️
                  </button>
                  <button
                    onClick={() => setSheet({ kind: 'more', session: s })}
                    disabled={busy}
                    className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-500 active:bg-gray-50 disabled:opacity-50"
                  >
                    ⋯
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Thanh gộp bill — chỉ hiện khi đã tick từ 2 mâm trở lên */}
      {picked.size > 1 && (
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md border-t border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-500">Gộp {picked.size} mâm</span>
            <span className="font-bold text-gray-900">{dong(pickedTotal)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPicked(new Set())}
              className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-500"
            >
              Bỏ chọn
            </button>
            <button
              onClick={() => printBill(pickedSessions)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-700"
            >
              🖨️ In 1 hoá đơn
            </button>
            <button
              onClick={() => setSheet({ kind: 'pay', sessions: pickedSessions })}
              disabled={busy}
              className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
            >
              Thu tiền
            </button>
          </div>
        </div>
      )}

      {sheet.kind !== 'none' && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => !busy && setSheet({ kind: 'none' })}
        >
          <div
            className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            {sheet.kind === 'pay' && (
              <>
                <p className="text-base font-bold text-gray-900">
                  Thu {dong(sheet.sessions.reduce((n, s) => n + s.total, 0))}
                  {sheet.sessions.length === 1
                    ? ` — ${sheet.sessions[0].table_number}`
                    : ` — ${sheet.sessions.length} mâm`}
                </p>
                {sheet.sessions.some((s) => s.cooking_count > 0) && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠️ Còn {sheet.sessions.reduce((n, s) => n + s.cooking_count, 0)} món chưa xong.
                    Vẫn thu tiền và đóng bàn? Món đang làm vẫn nằm ở màn bếp.
                  </p>
                )}
                <p className="mt-3 text-xs text-gray-500">Khách trả bằng gì?</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void doClose(sheet.sessions, 'paid', 'cash')}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                  >
                    💵 Tiền mặt
                  </button>
                  <button
                    onClick={() => void doClose(sheet.sessions, 'paid', 'bank')}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-gray-800 py-3 text-sm font-semibold text-white active:bg-gray-900 disabled:opacity-50"
                  >
                    🏦 Chuyển khoản
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">
                  Chuyển khoản: cho khách quét mã QR của quán, nghe loa báo tiền về rồi mới bấm.
                </p>
              </>
            )}

            {sheet.kind === 'more' && (
              <>
                <p className="text-base font-bold text-gray-900">{sheet.session.table_number}</p>

                <button
                  onClick={() => setSheet({ kind: 'addTable', session: sheet.session })}
                  disabled={busy || freeTables.length === 0}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-left text-sm font-semibold text-gray-700 active:bg-gray-50 disabled:opacity-50"
                >
                  <span className="px-3">➕ Thêm bàn vào mâm</span>
                  <span className="mt-0.5 block px-3 text-xs font-normal text-gray-400">
                    Đoàn đông thêm người. Thêm bàn xong là cả nhóm cùng gọi vào một bill.
                  </span>
                </button>

                <button
                  onClick={() => setSheet({ kind: 'merge', session: sheet.session })}
                  disabled={busy || openSessions.length < 2}
                  className="mt-2 w-full rounded-xl border border-gray-200 py-3 text-left text-sm font-semibold text-gray-700 active:bg-gray-50 disabled:opacity-50"
                >
                  <span className="px-3">🔗 Nhập vào mâm khác</span>
                  <span className="mt-0.5 block px-3 text-xs font-normal text-gray-400">
                    Khách quét QR trước khi kịp ghép bàn. Chuyển cả món lẫn bàn sang mâm đích.
                  </span>
                </button>

                {!sheet.session.is_open_ordering && (
                  <button
                    onClick={() => void doSimple(() => releaseTableSessionHost(sheet.session.session_id))}
                    disabled={busy || sheet.session.status !== 'open'}
                    className="mt-2 w-full rounded-xl border border-gray-200 py-3 text-left text-sm font-semibold text-gray-700 active:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="px-3">🔄 Chuyển quyền gọi món</span>
                    <span className="mt-0.5 block px-3 text-xs font-normal text-gray-400">
                      Nhả máy đang giữ bàn. Máy nào gọi món tiếp theo sẽ thành chủ. Bàn vẫn mở,
                      bill giữ nguyên.
                    </span>
                  </button>
                )}

                <button
                  onClick={() => setSheet({ kind: 'reset', session: sheet.session })}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-red-200 py-3 text-left text-sm font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
                >
                  <span className="px-3">🗑️ Bỏ bàn (không thu tiền)</span>
                  <span className="mt-0.5 block px-3 text-xs font-normal text-red-400">
                    Dùng cho đơn ma. Huỷ món chưa nấu, giữ nguyên món đã vào bếp.
                  </span>
                </button>
              </>
            )}

            {sheet.kind === 'reset' && (
              <>
                <p className="text-base font-bold text-gray-900">
                  Bỏ {sheet.session.table_number} mà KHÔNG thu tiền?
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  {dong(sheet.session.total)} sẽ không được ghi nhận. Món chưa nấu bị huỷ; món đã
                  vào bếp giữ nguyên và vẫn phải xử lý tay.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setSheet({ kind: 'more', session: sheet.session })}
                    className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600"
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={() => void doClose([sheet.session], 'staff_reset', null)}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white active:bg-red-600 disabled:opacity-50"
                  >
                    Bỏ bàn
                  </button>
                </div>
              </>
            )}

            {sheet.kind === 'tray' && (
              <>
                <p className="text-base font-bold text-gray-900">Ghép bàn thành mâm</p>
                <p className="mt-1 text-xs text-gray-500">
                  Chọn các bàn đoàn đang ngồi. QR của bàn nào trong mâm cũng dẫn về đúng mâm này,
                  và cả nhóm gọi thêm được — không khoá theo một máy.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {freeTables.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTable(t.id)}
                      className={`rounded-lg border-2 py-2.5 text-sm font-semibold ${
                        pickTables.has(t.id)
                          ? 'border-orange-500 bg-orange-50 text-orange-600'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
                {freeTables.length === 0 && (
                  <p className="mt-3 text-sm text-gray-400">Không còn bàn trống nào.</p>
                )}
                <button
                  onClick={() => void doSimple(() => createTraySession([...pickTables]))}
                  disabled={busy || pickTables.size === 0}
                  className="mt-4 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                >
                  Ghép {pickTables.size > 0 ? `${pickTables.size} bàn ` : ''}thành mâm
                </button>
              </>
            )}

            {sheet.kind === 'merge' && (
              <>
                <p className="text-base font-bold text-gray-900">
                  Nhập {sheet.session.table_number} vào mâm nào?
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Cả món đã gọi lẫn bàn sẽ chuyển sang mâm đích. Phiên này đóng lại, tiền gộp vào
                  bill của mâm đích.
                </p>
                <div className="mt-3 space-y-2">
                  {openSessions
                    .filter((s) => s.session_id !== sheet.session.session_id)
                    .map((s) => (
                      <button
                        key={s.session_id}
                        onClick={() =>
                          void doSimple(() =>
                            mergeSessionIntoTray(sheet.session.session_id, s.session_id),
                          )
                        }
                        disabled={busy}
                        className="w-full rounded-xl border border-gray-200 p-3 text-left active:bg-gray-50 disabled:opacity-50"
                      >
                        <span className="block text-sm font-semibold text-gray-800">
                          {s.is_open_ordering ? '🍲' : '🪑'} {s.table_number}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-400">
                          {s.order_count} đơn · {dong(s.total)}
                        </span>
                      </button>
                    ))}
                </div>
              </>
            )}

            {sheet.kind === 'addTable' && (
              <>
                <p className="text-base font-bold text-gray-900">
                  Thêm bàn vào {sheet.session.table_number}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {freeTables.map((t) => (
                    <button
                      key={t.id}
                      onClick={() =>
                        void doSimple(() => addTableToSession(sheet.session.session_id, t.id))
                      }
                      disabled={busy}
                      className="rounded-lg border-2 border-gray-200 py-2.5 text-sm font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
                    >
                      {t.table_number}
                    </button>
                  ))}
                </div>
                {freeTables.length === 0 && (
                  <p className="mt-3 text-sm text-gray-400">Không còn bàn trống nào.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
