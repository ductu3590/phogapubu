'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { paymentBadge } from '@/lib/order-payment-badge'
import { mapStaffOrderRow, STAFF_ORDER_SELECT, ACTIVE_STATUSES, type StaffOrder } from './types'

const dong = (n: number) => `${n.toLocaleString('vi-VN')}đ`

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xử lý', confirmed: 'Đã xác nhận', cooking: 'Đang làm', ready: 'Xong',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  cooking: 'bg-orange-100 text-orange-700',
  ready: 'bg-green-100 text-green-700',
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
    <div className="mx-auto flex h-full max-w-md flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Đơn đang xử lý</span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-300'}`}
            title={connected ? 'Đang kết nối realtime' : 'Mất kết nối — đang thử lại'}
          />
        </div>
        <Link
          href="/staff/order"
          className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-600 shadow-sm active:bg-orange-100"
        >
          + Đặt món
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {orders.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Chưa có đơn nào đang xử lý hôm nay.</p>
        ) : (
          <ul className="space-y-2.5">
            {orders.map((o) => {
              const pay = paymentBadge(o)
              return (
                <li key={o.id} className="rounded-xl border border-gray-100 bg-white p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-gray-900">🪑 {o.tableNumber}</span>
                      <span className="text-xs text-gray-400">#{o.id.slice(-6).toUpperCase()}</span>
                      {o.orderSource === 'staff' && (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600">Đặt hộ</span>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-bold text-gray-900">{dong(o.totalAmount)}</span>
                  </div>

                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pay.tone === 'received' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-700'}`}>
                      {pay.label}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(o.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {o.items.map((it) => (
                      <p key={it.id} className="text-sm text-gray-600">
                        <span className="font-medium text-gray-800">×{it.quantity}</span> {it.name}
                      </p>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
