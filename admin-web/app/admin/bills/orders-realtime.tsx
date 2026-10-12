'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Nghe mọi thay đổi orders của quán → router.refresh() (debounce 500ms) để Server Component tải
// lại số liệu mới mà KHÔNG bắt chủ quán bấm F5. Giữ nguyên toàn bộ logic doanh thu/hành động ở
// page.tsx — đây chỉ là "cò" làm mới. Reconnect: supabase-js tự resubscribe; mỗi lần có event
// mới lại refresh nên không cần refetch tay.
// Client Supabase trình duyệt dùng chung một bản: `channel()` trùng tên trả lại kênh ĐANG chạy → `.on()` sau
// `subscribe()` ném lỗi (CLAUDE.md 2026-10-04). Trang này có thể có HAI bản cùng lúc — mở thẳng URL /admin/bills
// rồi đổi ngày: trang đầy đủ còn nằm ở slot children, bản hộp thoại (@modal) dựng thêm; removeChannel của bản cũ
// cũng chạy bất đồng bộ. Nên MỖI lần mount dùng một tên kênh riêng (hậu tố ngẫu nhiên).
export default function OrdersRealtime({ storeId, channelKey = 'admin-orders' }: { storeId: string; channelKey?: string }) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const bump = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 500)
    }
    const channel = supabase
      .channel(`${channelKey}-${storeId}-${Math.random().toString(36).slice(2, 10)}`)
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
  }, [storeId, channelKey, router])

  return null
}
