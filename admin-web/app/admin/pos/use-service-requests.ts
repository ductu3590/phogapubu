'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveServiceRequest, type ServiceRequestRow } from '@/lib/actions/service-requests'
import { readServiceRequests } from '@/lib/pos-browser-reads'
import { createClient } from '@/lib/supabase/client'
import { playBell } from '@/lib/bell'
import { watchServiceRequests } from '@/lib/service-request-queue'

// Yêu cầu "Gọi nhân viên" cho /admin/pos — cùng watcher + chuông với ServiceRequestQueue của POS cũ,
// chỉ đưa dữ liệu lên trang để gộp vào danh sách Việc cần xử lý.
export function useServiceRequests(storeId: string, initialRequests: ServiceRequestRow[], initialError: string | null) {
  const [requests, setRequests] = useState(initialRequests)
  const [error, setError] = useState(initialError)
  const [busyId, setBusyId] = useState<string | null>(null)
  const refresh = useRef(() => {})
  const busy = useRef(false)

  useEffect(() => {
    // Đọc định kỳ thẳng từ trình duyệt, không qua server action (xem lib/pos-browser-reads.ts).
    const client = createClient()
    const watcher = watchServiceRequests({
      client, storeId, load: () => readServiceRequests(client, storeId),
      initial: initialError ? null : initialRequests,
      onRows: setRequests, onError: setError, onNew: () => playBell(), onConnected: () => undefined,
    })
    refresh.current = watcher.refresh
    window.addEventListener('focus', watcher.refresh)
    return () => {
      watcher.dispose()
      window.removeEventListener('focus', watcher.refresh)
    }
  }, [storeId, initialRequests, initialError])

  /** Trả lỗi (nếu có). Chỉ ảnh chụp server sau RPC thành công mới gỡ thẻ, không gỡ tại chỗ. */
  const resolve = useCallback(async (id: string): Promise<string | null> => {
    if (busy.current) return null
    busy.current = true
    setBusyId(id)
    try {
      const result = await resolveServiceRequest(id)
      if (!result.ok) return result.error
      refresh.current()
      return null
    } catch {
      return 'Chưa xác nhận được đã xử lý. Kiểm tra mạng rồi thử lại.'
    } finally {
      busy.current = false
      setBusyId(null)
    }
  }, [])

  return { requests, error, busyId, resolve, reload: () => refresh.current() }
}
