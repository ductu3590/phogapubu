'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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

  const loi = actionError ?? error

  return (
    <section aria-label="Gọi nhân viên" className={cn('border-b border-border px-4 py-3 md:px-5', requests.length > 0 ? 'bg-warning-bg' : 'bg-surface')} onClickCapture={() => unlockBell()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell className={cn('size-4', requests.length > 0 ? 'text-warning' : 'text-muted')} aria-hidden />
          Gọi nhân viên
          <span className={cn('tabular', requests.length > 0 ? 'text-warning' : 'font-normal text-muted')}>({requests.length})</span>
          {!requests.length && !loi && <span className="font-normal text-muted">· Không có yêu cầu đang chờ.</span>}
        </h2>
        <div className="flex items-center gap-2">
          {!connected && <span className="text-[13px] text-warning">Đang kết nối lại…</span>}
          <Button variant="ghost" icon={<RotateCw />} onClick={() => refresh.current()} className="min-h-9 px-2.5 text-[13px] md:min-h-9">
            Tải lại yêu cầu
          </Button>
        </div>
      </div>
      {loi && <p role="alert" className="mt-2 text-sm text-error-text">{loi}</p>}
      {requests.length > 0 && (
        <ul className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto">
          {requests.map(request => {
            const session = serviceRequestSession(request, sessions)
            const label = session?.table_number ?? request.table_number
            return (
              <li key={request.id} className="flex items-center gap-3 rounded-xl border border-warning-border bg-surface p-3">
                <div className="min-w-0">
                  {onSelect ? (
                    <button type="button" className="cursor-pointer text-left text-sm font-semibold text-foreground underline-offset-4 hover:underline" onClick={() => onSelect(request)}>{label}</button>
                  ) : (
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                  )}
                  <p className="text-[13px] text-muted">Gọi lần cuối <time dateTime={request.last_ping_at}>{new Date(request.last_ping_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time> · {request.ping_count} lần</p>
                </div>
                <Button variant="primary" disabled={busyId !== null && busyId !== request.id} isLoading={busyId === request.id} onClick={() => void resolve(request.id)}>
                  Đã xử lý
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
