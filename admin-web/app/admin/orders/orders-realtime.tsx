'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Nghe mọi thay đổi orders của quán → router.refresh() (debounce 500ms) để Server Component tải
// lại số liệu mới mà KHÔNG bắt chủ quán bấm F5. Giữ nguyên toàn bộ logic doanh thu/hành động ở
// page.tsx — đây chỉ là "cò" làm mới. Reconnect: supabase-js tự resubscribe; mỗi lần có event
// mới lại refresh nên không cần refetch tay.
export default function OrdersRealtime({ storeId }: { storeId: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const bump = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 500)
    }
    const channel = supabase
      .channel(`admin-orders-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        bump,
      )
      .subscribe()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
  }, [storeId, router])

  return null
}
