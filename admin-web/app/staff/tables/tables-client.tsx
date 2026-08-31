'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  closeTableSession,
  listOpenTableSessions,
  releaseTableSessionHost,
  type OpenTableSession,
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
  | { kind: 'pay'; session: OpenTableSession }
  | { kind: 'more'; session: OpenTableSession }
  | { kind: 'reset'; session: OpenTableSession }

export default function TablesClient({
  storeId,
  paymentTiming,
  initialSessions,
  initialError,
}: {
  storeId: string
  paymentTiming: 'prepay' | 'postpay'
  initialSessions: OpenTableSession[]
  initialError: string | null
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })
  const [connected, setConnected] = useState(false)
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

  const doClose = async (
    session: OpenTableSession,
    reason: 'paid' | 'staff_reset',
    instrument: 'cash' | 'bank' | null,
  ) => {
    setBusy(session.session_id)
    const res = await closeTableSession(session.session_id, reason, instrument)
    setBusy(null)
    setSheet({ kind: 'none' })
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (reason === 'staff_reset' && res.ordersLeftInKitchen > 0) {
      setError(
        `Đã bỏ bàn ${session.table_number}. Còn ${res.ordersLeftInKitchen} món đã vào bếp — vẫn nằm ở màn bếp, xử lý tay.`,
      )
    }
    await reload()
  }

  const doRelease = async (session: OpenTableSession) => {
    setBusy(session.session_id)
    const res = await releaseTableSessionHost(session.session_id)
    setBusy(null)
    setSheet({ kind: 'none' })
    if (!res.ok) setError(res.error)
    else await reload()
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-4 py-2.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}
        />
        <span className="text-xs font-medium text-gray-500">
          {connected ? 'Đang cập nhật trực tiếp' : 'Mất kết nối — đang thử lại...'}
        </span>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-semibold underline">
            Đóng
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
                  s.needs_review ? 'border-amber-300' : 'border-gray-100'
                }`}
              >
                {s.needs_review && (
                  <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                    ⏰ Phiên đã quá 6 giờ không hoạt động nên bàn được mở khoá, nhưng
                    <b> vẫn còn {dong(s.unpaid_total)} chưa thu</b>. Xử lý nốt rồi đóng.
                  </p>
                )}

                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">🪑 {s.table_number}</p>
                    <p className="text-xs text-gray-400">
                      mở lúc {gio(s.opened_at)} · {s.order_count} đơn
                      {s.opened_by === 'staff' && ' · nhân viên mở'}
                      {!s.has_host && ' · chưa có máy giữ bàn'}
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
                    onClick={() => setSheet({ kind: 'pay', session: s })}
                    disabled={busy === s.session_id}
                    className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                  >
                    Thu tiền &amp; đóng bàn
                  </button>
                  <button
                    onClick={() => setSheet({ kind: 'more', session: s })}
                    disabled={busy === s.session_id}
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

      {sheet.kind !== 'none' && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40"
          onClick={() => setSheet({ kind: 'none' })}
        >
          <div
            className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            {sheet.kind === 'pay' && (
              <>
                <p className="text-base font-bold text-gray-900">
                  Thu {dong(sheet.session.total)} — {sheet.session.table_number}
                </p>
                {sheet.session.cooking_count > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠️ Bàn còn {sheet.session.cooking_count} món chưa xong. Vẫn thu tiền và đóng
                    bàn? Món đang làm vẫn nằm ở màn bếp.
                  </p>
                )}
                <p className="mt-3 text-xs text-gray-500">Khách trả bằng gì?</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void doClose(sheet.session, 'paid', 'cash')}
                    disabled={busy !== null}
                    className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                  >
                    💵 Tiền mặt
                  </button>
                  <button
                    onClick={() => void doClose(sheet.session, 'paid', 'bank')}
                    disabled={busy !== null}
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
                  onClick={() => void doRelease(sheet.session)}
                  disabled={busy !== null || sheet.session.status !== 'open'}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-left text-sm font-semibold text-gray-700 active:bg-gray-50 disabled:opacity-50"
                >
                  <span className="px-3">🔄 Chuyển quyền gọi món</span>
                  <span className="mt-0.5 block px-3 text-xs font-normal text-gray-400">
                    Nhả máy đang giữ bàn. Máy nào gọi món tiếp theo sẽ thành chủ. Bàn vẫn mở, bill
                    giữ nguyên.
                  </span>
                </button>
                <button
                  onClick={() => setSheet({ kind: 'reset', session: sheet.session })}
                  disabled={busy !== null}
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
                  Bỏ bàn {sheet.session.table_number} mà KHÔNG thu tiền?
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
                    onClick={() => void doClose(sheet.session, 'staff_reset', null)}
                    disabled={busy !== null}
                    className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white active:bg-red-600 disabled:opacity-50"
                  >
                    Bỏ bàn
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
