'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { paymentBadge } from '@/lib/order-payment-badge'
import { Badge, StatusDot } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { orderStatusTone } from '@/components/ui/status'
import { mapStaffOrderRow, STAFF_ORDER_SELECT, ACTIVE_STATUSES, type StaffOrder } from './types'

const dong = (n: number) => `${n.toLocaleString('vi-VN')}đ`

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý', confirmed: 'Đã xác nhận', cooking: 'Đang làm', ready: 'Xong',
}

export default function StaffOrdersClient({
  storeId,
  initialOrders,
}: {
  storeId: string
  initialOrders: StaffOrder[]
}) {
  const [orders, setOrders] = useState<StaffOrder[]>(initialOrders)
  const [connected, setConnected] = useState(true)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const wasErrored = useRef(false)

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient()
    const supabase = supabaseRef.current

    async function fetchOne(id: string): Promise<StaffOrder | null> {
      const { data } = await supabase.from('orders').select(STAFF_ORDER_SELECT).eq('id', id).single()
      return data ? mapStaffOrderRow(data) : null
    }

    // Reconnect: kéo lại toàn bộ danh sách 1 lần để bù các sự kiện lỡ khi mất kết nối.
    async function refetchAll() {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('orders')
        .select(STAFF_ORDER_SELECT)
        .eq('store_id', storeId)
        .in('status', ACTIVE_STATUSES)
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
      if (data) setOrders(data.map(mapStaffOrderRow))
    }

    const channel = supabase
      .channel(`staff-orders-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        async (payload) => {
          const row = payload.new as { id: string; status: string }
          if (!ACTIVE_STATUSES.includes(row.status)) return
          const o = await fetchOne(row.id)
          if (o) setOrders((prev) => (prev.some((p) => p.id === o.id) ? prev : [o, ...prev]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload) => {
          const row = payload.new as {
            id: string; status: string; payment_method: string
            payment_received_at: string | null; zalopay_trans_id: string | null
          }
          setOrders((prev) =>
            prev
              .map((o) =>
                o.id === row.id
                  ? {
                      ...o,
                      status: row.status,
                      paymentMethod: row.payment_method,
                      paymentReceivedAt: row.payment_received_at ?? null,
                      zalopayTransId: row.zalopay_trans_id ?? null,
                    }
                  : o,
              )
              // Đã thanh toán xong / huỷ → rời danh sách "đang xử lý"
              .filter((o) => ACTIVE_STATUSES.includes(o.status)),
          )
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true)
          if (wasErrored.current) {
            wasErrored.current = false
            refetchAll()
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false)
          wasErrored.current = true
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-background">
      <div className="flex shrink-0 items-center border-b border-border bg-surface px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted" role="status">
          <StatusDot tone={connected ? 'success' : 'neutral'} />
          {connected ? 'Đang cập nhật trực tiếp' : 'Mất kết nối — đang thử lại...'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {orders.length === 0 ? (
          <EmptyState className="py-12">Chưa có đơn nào đang xử lý hôm nay.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const pay = paymentBadge(o.paymentMethod, !!(o.paymentReceivedAt || o.zalopayTransId), !!o.sessionId)
              return (
                <li key={o.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-foreground">{o.tableNumber}</span>
                      <span className="font-mono text-[13px] text-muted">#{o.id.slice(-6).toUpperCase()}</span>
                      {o.orderSource === 'staff' && <span className="text-[13px] text-muted">· Đặt hộ</span>}
                    </div>
                    <span className="shrink-0 font-semibold text-foreground tabular">{dong(o.totalAmount)}</span>
                  </div>

                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone={orderStatusTone(o.status)}>{STATUS_LABEL[o.status] ?? o.status}</Badge>
                    <Badge tone={pay.tone === 'received' ? 'success' : 'warning'}>{pay.label}</Badge>
                    <span className="text-[13px] text-muted tabular">
                      {new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <ul className="space-y-0.5">
                    {o.items.map((it) => (
                      <li key={it.id} className="text-sm text-foreground/80">
                        <span className="font-medium text-foreground tabular">×{it.quantity}</span> {it.name}
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
