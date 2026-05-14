'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatVND, timeAgo } from '@/lib/utils'
import type { KitchenOrder, OrderStatus, Store } from '@/types/database.types'

// ─── Âm thanh thông báo đơn mới (Web Audio API, không cần file ngoài) ───────
function playBell() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4)
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 1)
  } catch {
    // Bỏ qua lỗi audio (user chưa tương tác trang)
  }
}

// ─── Gọi ZNS edge function (không chặn UI, fail silently) ───────────────────
async function callZnsNotify(orderId: string) {
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/zns-notify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ orderId }),
      },
    )
  } catch {
    // ZNS là tính năng phụ — không để lỗi ảnh hưởng kitchen display
  }
}

// ─── Map raw Supabase row → KitchenOrder ────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(row: any, tableNumber: string, items: any[]): KitchenOrder {
  return {
    id: row.id,
    storeId: row.store_id,
    tableId: row.table_id,
    tableNumber,
    status: row.status as OrderStatus,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    zaloUserId: row.zalo_user_id ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id ?? null,
      name: item.item_name,
      quantity: item.quantity,
      price: item.item_price,
      note: item.note ?? null,
    })),
  }
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  storeSlug: string
}

export default function KitchenDisplay({ storeSlug }: Props) {
  const supabase = createClient()
  const [store, setStore] = useState<Store | null>(null)
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  // Giữ track đơn đã biết để phát tiếng chuông đúng lần
  const knownOrderIds = useRef<Set<string>>(new Set())

  // Cập nhật "X phút trước" mỗi 30 giây
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── Fetch đơn đầy đủ kèm items + table ──────────────────────────────────
  const fetchOrder = useCallback(
    async (orderId: string): Promise<KitchenOrder | null> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), tables(table_number)')
        .eq('id', orderId)
        .single()
      if (error || !data) return null
      return mapOrder(
        data,
        (data.tables as { table_number: string } | null)?.table_number ?? 'Bàn ?',
        data.order_items ?? [],
      )
    },
    [supabase],
  )

  // ── Load store + tất cả đơn hôm nay ──────────────────────────────────────
  useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)

      // 1. Lấy store theo slug
      const { data: storeData, error: storeErr } = await supabase
        .from('stores')
        .select('id, name, slug')
        .eq('slug', storeSlug)
        .eq('is_active', true)
        .single()

      if (storeErr || !storeData) {
        setError(`Không tìm thấy quán "${storeSlug}"`)
        setLoading(false)
        return
      }
      setStore(storeData as Store)

      // 2. Lấy đơn hôm nay (active: chưa trả tiền, chưa huỷ)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: ordersData, error: ordersErr } = await supabase
        .from('orders')
        .select('*, order_items(*), tables(table_number)')
        .eq('store_id', storeData.id)
        .in('status', ['pending', 'confirmed', 'cooking', 'ready'])
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })

      if (ordersErr) {
        setError('Lỗi tải đơn hàng')
        setLoading(false)
        return
      }

      const mapped = (ordersData ?? []).map((row) =>
        mapOrder(
          row,
          (row.tables as { table_number: string } | null)?.table_number ?? 'Bàn ?',
          row.order_items ?? [],
        ),
      )
      mapped.forEach((o) => knownOrderIds.current.add(o.id))
      setOrders(mapped)
      setLoading(false)

      // 3. Subscribe Supabase Realtime
      const channel = supabase
        .channel(`kitchen-${storeData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${storeData.id}`,
          },
          async (payload) => {
            const newRow = payload.new as { id: string; status: string }
            if (knownOrderIds.current.has(newRow.id)) return
            // Chỉ hiện đơn active
            if (!['pending', 'confirmed', 'cooking', 'ready'].includes(newRow.status)) return

            const order = await fetchOrder(newRow.id)
            if (!order) return

            knownOrderIds.current.add(order.id)
            setOrders((prev) => [order, ...prev])
            playBell()
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `store_id=eq.${storeData.id}`,
          },
          (payload) => {
            const updated = payload.new as { id: string; status: string; updated_at: string }
            setOrders((prev) =>
              prev
                .map((o) =>
                  o.id === updated.id
                    ? { ...o, status: updated.status as OrderStatus, updatedAt: updated.updated_at }
                    : o,
                )
                // Xoá khỏi màn hình khi đã thanh toán hoặc huỷ
                .filter((o) => !['paid', 'cancelled'].includes(o.status)),
            )
          },
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    init()
  }, [storeSlug, supabase, fetchOrder])

  // ── Cập nhật trạng thái đơn ───────────────────────────────────────────────
  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    // Optimistic update ngay lập tức
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
    )

    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)

    if (error) {
      // Rollback nếu thất bại
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: newStatus === 'cooking' ? 'confirmed' : 'cooking' }
            : o,
        ),
      )
      alert('Cập nhật thất bại, thử lại!')
      return
    }

    // Khi đơn xong → gửi ZNS thông báo cho khách
    if (newStatus === 'ready') {
      callZnsNotify(orderId)
    }
  }

  // ── Chia đơn theo cột ─────────────────────────────────────────────────────
  // pending chỉ hiện cho tiền mặt — ZaloPay pending chưa thanh toán không vào bếp
  const waitingOrders = orders.filter((o) =>
    o.status === 'confirmed' ||
    (o.status === 'pending' && o.paymentMethod === 'cash')
  )
  const cookingOrders = orders.filter((o) => o.status === 'cooking')
  const readyOrders = orders.filter((o) => o.status === 'ready')

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="text-gray-400">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-2xl text-red-400">⚠️ {error}</p>
          <p className="mt-2 text-gray-500">Kiểm tra lại URL hoặc kết nối mạng</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍜</span>
          <div>
            <h1 className="text-xl font-bold text-white">{store?.name ?? storeSlug}</h1>
            <p className="text-sm text-gray-400">Kitchen Display</p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <span>
            ⏳ <strong className="text-yellow-400">{waitingOrders.length}</strong> chờ
          </span>
          <span>
            🍳 <strong className="text-blue-400">{cookingOrders.length}</strong> đang làm
          </span>
          <span>
            ✅ <strong className="text-green-400">{readyOrders.length}</strong> xong
          </span>
          <Clock />
        </div>
      </header>

      {/* 3 cột */}
      <div className="grid flex-1 grid-cols-3 gap-0 divide-x divide-gray-800 overflow-hidden">
        {/* Cột 1 — Chờ xử lý */}
        <Column
          title="⏳ CHỜ XỬ LÝ"
          titleColor="text-yellow-400"
          orders={waitingOrders}
          now={now}
          action={{
            label: 'Bắt đầu làm',
            color: 'bg-blue-600 hover:bg-blue-500',
            nextStatus: 'cooking',
          }}
          onAction={(id) => updateStatus(id, 'cooking')}
        />

        {/* Cột 2 — Đang làm */}
        <Column
          title="🍳 ĐANG LÀM"
          titleColor="text-blue-400"
          orders={cookingOrders}
          now={now}
          action={{
            label: 'Đã xong ✓',
            color: 'bg-green-600 hover:bg-green-500',
            nextStatus: 'ready',
          }}
          onAction={(id) => updateStatus(id, 'ready')}
        />

        {/* Cột 3 — Xem lại */}
        <Column
          title="✅ XEM LẠI"
          titleColor="text-green-400"
          orders={readyOrders}
          now={now}
        />
      </div>
    </div>
  )
}

// ─── Component: 1 cột ───────────────────────────────────────────────────────
function Column({
  title,
  titleColor,
  orders,
  now,
  action,
  onAction,
}: {
  title: string
  titleColor: string
  orders: KitchenOrder[]
  now: number
  action?: { label: string; color: string; nextStatus: OrderStatus }
  onAction?: (id: string) => void
}) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="border-b border-gray-800 px-4 py-2">
        <h2 className={cn('text-base font-bold tracking-wide', titleColor)}>
          {title}
          <span className="ml-2 text-gray-500">({orders.length})</span>
        </h2>
      </div>
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
        {orders.length === 0 && (
          <p className="pt-8 text-center text-sm text-gray-600">Không có đơn</p>
        )}
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            now={now}
            action={action}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Component: Card đơn hàng ────────────────────────────────────────────────
function OrderCard({
  order,
  now,
  action,
  onAction,
}: {
  order: KitchenOrder
  now: number
  action?: { label: string; color: string; nextStatus: OrderStatus }
  onAction?: (id: string) => void
}) {
  const shortId = order.id.slice(-6).toUpperCase()
  const elapsed = Math.floor((now - new Date(order.createdAt).getTime()) / 1000)
  const isUrgent = elapsed > 600 // > 10 phút → highlight đỏ

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        order.status === 'ready'
          ? 'border-green-800 bg-gray-900'
          : isUrgent
            ? 'border-red-700 bg-red-950/30'
            : 'border-gray-700 bg-gray-900',
      )}
    >
      {/* Header card */}
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="text-lg font-bold text-white">{order.tableNumber}</span>
          <span className="ml-2 text-sm text-gray-400">#{shortId}</span>
        </div>
        <div className="text-right">
          <span
            className={cn(
              'text-sm font-medium',
              isUrgent && order.status !== 'ready' ? 'text-red-400' : 'text-gray-400',
            )}
          >
            ⏱ {timeAgo(order.createdAt)}
          </span>
          {order.paymentMethod === 'cash' && (
            <p className="text-xs text-yellow-500">💵 Tiền mặt</p>
          )}
        </div>
      </div>

      {/* Danh sách món */}
      <ul className="mb-2 space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between text-sm">
            <span className="text-gray-200">
              <strong className="text-white">×{item.quantity}</strong> {item.name}
            </span>
            {item.note && (
              <span className="ml-2 text-xs italic text-yellow-400">{item.note}</span>
            )}
          </li>
        ))}
      </ul>

      {/* Ghi chú đơn */}
      {order.note && (
        <p className="mb-2 rounded-lg bg-yellow-900/30 px-2 py-1 text-xs text-yellow-300">
          📝 {order.note}
        </p>
      )}

      {/* Tổng + nút action */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{formatVND(order.totalAmount)}</span>
        {action && onAction && (
          <button
            onClick={() => onAction(order.id)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-colors active:scale-95',
              action.color,
            )}
          >
            {action.label}
          </button>
        )}
        {order.status === 'ready' && (
          <span className="rounded-full bg-green-900 px-3 py-1 text-xs font-medium text-green-400">
            Nhân viên đang mang ra
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Component: Đồng hồ realtime ─────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () =>
      setTime(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      )
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="font-mono text-base text-white">{time}</span>
}
