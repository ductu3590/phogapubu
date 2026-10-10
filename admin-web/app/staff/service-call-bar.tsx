'use client'

import { useEffect, useRef, useState } from 'react'
import { BellRing, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listOpenServiceRequests, resolveServiceRequest, type ServiceRequestRow } from '@/lib/actions/service-requests'
import { createClient } from '@/lib/supabase/client'
import { playBell, stopBell, unlockBell } from '@/lib/bell'
import { watchServiceRequests } from '@/lib/service-request-queue'

const gio = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })

/** Thanh "Gọi nhân viên" nằm ở layout /staff → hiện ở MỌI tab (Đặt món / Đang xử lý / Bàn), không bắt
 *  nhân viên phải đứng ở tab Bàn mới biết có khách gọi. Không có ai gọi thì ẩn hẳn, khỏi chiếm chỗ.
 *  Chạm vào thẻ bàn = "Đã xử lý" → tắt luôn. Thẻ chỉ gỡ sau khi server xác nhận (không dismiss cục bộ). */
export default function ServiceCallBar({ storeId, initialRequests, initialError }: {
  storeId: string
  initialRequests: ServiceRequestRow[]
  initialError: string | null
}) {
  const [requests, setRequests] = useState(initialRequests)
  const [error, setError] = useState(initialError)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const busy = useRef(false)
  const refresh = useRef(() => {})

  // Kiểu chuông "Báo liên tục": không còn ai gọi thì im.
  useEffect(() => { if (requests.length === 0) stopBell() }, [requests.length])

  useEffect(() => {
    const watcher = watchServiceRequests({
      client: createClient(), storeId, load: listOpenServiceRequests,
      initial: initialError ? null : initialRequests,
      onRows: setRequests, onError: setError,
      onNew: () => {
        playBell()
        // Điện thoại nhân viên hay để rung / để trong túi — rung kèm chuông.
        try { navigator.vibrate?.([300, 120, 300]) } catch { /* trình duyệt không hỗ trợ */ }
      },
      onConnected: () => {},
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
      else refresh.current()
    } catch {
      setActionError('Chưa tắt được. Kiểm tra mạng rồi chạm lại.')
    } finally {
      busy.current = false
      setBusyId(null)
    }
  }

  const loi = actionError ?? error
  if (requests.length === 0 && !loi) return null

  return (
    <section
      aria-label="Khách gọi nhân viên"
      aria-live="assertive"
      className="shrink-0 border-b border-warning-border bg-warning-bg px-3 py-2"
      onClickCapture={() => unlockBell()}
    >
      {requests.length > 0 && (
        <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-warning">
          <BellRing className="size-4 animate-pulse" aria-hidden />
          Khách gọi nhân viên · chạm vào bàn khi đã ra xử lý
        </p>
      )}
      {loi && <p role="alert" className="mb-1.5 text-[13px] text-error-text">{loi}</p>}
      {requests.length > 0 && (
        <ul className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
          {requests.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => void resolve(r.id)}
                disabled={busyId !== null}
                aria-label={`${r.table_number} gọi nhân viên — chạm để báo đã xử lý`}
                className={cn(
                  'flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 border-warning-border bg-surface px-3 text-left shadow-sm transition-colors active:bg-item-hover disabled:opacity-60',
                  busyId === r.id && 'animate-pulse',
                )}
              >
                <BellRing className="size-5 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-base font-bold text-foreground">{r.table_number}</span>
                  <span className="block text-[12px] text-muted tabular">
                    {gio(r.last_ping_at)}{r.ping_count > 1 ? ` · ${r.ping_count} lần` : ''}
                  </span>
                </span>
                <CircleCheck className="ml-1 size-5 shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
