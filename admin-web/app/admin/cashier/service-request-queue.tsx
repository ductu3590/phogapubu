'use client'

import { useEffect, useRef, useState } from 'react'
import { listOpenServiceRequests, resolveServiceRequest, type ServiceRequestRow } from '@/lib/actions/service-requests'
import type { OpenTableSession } from '@/lib/actions/table-session'
import { createClient } from '@/lib/supabase/client'
import { playBell, unlockBell } from '@/lib/bell'
import { serviceRequestSession, watchServiceRequests } from '@/lib/service-request-queue'

export default function ServiceRequestQueue({ storeId, initialRequests, initialError, sessions, onSelect }: {
  storeId: string
  initialRequests: ServiceRequestRow[]
  initialError: string | null
  sessions: OpenTableSession[]
  onSelect?: (request: ServiceRequestRow) => void
}) {
  const [requests, setRequests] = useState(initialRequests)
  const [error, setError] = useState(initialError)
  const [actionError, setActionError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const busy = useRef(false)
  const refresh = useRef(() => {})

  useEffect(() => {
    const watcher = watchServiceRequests({
      client: createClient(), storeId, load: listOpenServiceRequests,
      initial: initialError ? null : initialRequests,
      onRows: setRequests, onError: setError, onNew: () => playBell(), onConnected: setConnected,
    })
    refresh.current = watcher.refresh
    window.addEventListener('focus', watcher.refresh)
    return () => {
      watcher.dispose()
      window.removeEventListener('focus', watcher.refresh)
    }
  }, [storeId, initialRequests, initialError])

  const resolve = async (id: string) => {
    if (busy.current) return
    busy.current = true
    setBusyId(id)
    setActionError(null)
    try {
      const result = await resolveServiceRequest(id)
      if (!result.ok) setActionError(result.error)
      // Chỉ snapshot server sau RPC thành công mới gỡ card, không dismiss cục bộ.
      else refresh.current()
    } catch {
      setActionError('Chưa xác nhận được đã xử lý. Kiểm tra mạng rồi thử lại.')
    } finally {
      busy.current = false
      setBusyId(null)
    }
  }

  return (
    <section aria-label="Gọi nhân viên" className="border-b border-orange-200 bg-orange-50 p-3 text-gray-900" onClickCapture={() => unlockBell()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">🔔 Gọi nhân viên ({requests.length})</h2>
        {!connected && <span className="text-xs text-amber-800">Đang kết nối lại…</span>}
        <button className="text-xs underline" onClick={() => refresh.current()}>Tải lại yêu cầu</button>
      </div>
      {(error || actionError) && <p role="alert" className="mt-2 text-xs text-red-700">{actionError ?? error}</p>}
      {!requests.length && !error && <p className="mt-1 text-xs text-gray-600">Không có yêu cầu đang chờ.</p>}
      <ul className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto">
        {requests.map(request => {
          const session = serviceRequestSession(request, sessions)
          const label = session?.table_number ?? request.table_number
          return (
            <li key={request.id} className="flex items-center gap-3 rounded-lg border border-orange-200 bg-white p-3">
              <div>
                {onSelect ? <button className="text-left text-sm font-bold underline" onClick={() => onSelect(request)}>{label}</button> : <p className="text-sm font-bold">{label}</p>}
                <p className="text-xs text-gray-600">Gọi lần cuối <time dateTime={request.last_ping_at}>{new Date(request.last_ping_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time> · {request.ping_count} lần</p>
              </div>
              <button disabled={busyId !== null} onClick={() => void resolve(request.id)} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {busyId === request.id ? 'Đang xử lý…' : 'Đã xử lý'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
