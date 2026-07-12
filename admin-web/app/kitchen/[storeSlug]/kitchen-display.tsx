'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createKitchenClient } from '@/lib/supabase/kitchen-client'
import { cn, formatVND, timeAgo } from '@/lib/utils'
import { speak, initTts, isTtsSupported, unlockTts } from '@/lib/tts'
import { orderInKitchen, shouldAnnounceOrder } from '@/lib/kitchen-announce'
import type { KitchenOrder, OrderStatus, Store } from '@/types/database.types'

// ─── Âm thanh thông báo đơn mới (Web Audio API, không cần file ngoài) ───────
// Dùng CHUNG 1 AudioContext (thay vì tạo mới mỗi lần) để có thể resume() sau
// gesture. Trình duyệt tạo AudioContext ở trạng thái 'suspended' cho tới khi
// người dùng chạm trang — nếu không sẽ câm dù toggle đang bật.
let sharedAudioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!sharedAudioCtx) sharedAudioCtx = new AC()
  return sharedAudioCtx
}

// Mở khoá audio chuông trong 1 gesture (resume context đang suspended)
function unlockBellAudio() {
  const ctx = getAudioCtx()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

function playBell() {
  try {
    const ctx = getAudioCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
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
    tableId: row.table_id ?? null,
    tableNumber,
    status: row.status as OrderStatus,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    zaloUserId: row.zalo_user_id ?? null,
    note: row.note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderType: (row.order_type ?? 'dine_in') as KitchenOrder['orderType'],
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    pickupTime: row.pickup_time ?? null,
    deliveryAddress: row.delivery_address ?? null,
    items: items.map((item) => ({
      id: item.id,
      menuItemId: item.menu_item_id ?? null,
      name: item.item_name,
      quantity: item.quantity,
      price: item.item_price,
      note: item.note ?? null,
      selectedToppings: (item.selected_toppings ?? []) as { id: string; name: string; price: number }[],
    })),
  }
}

// ─── Câu đọc TTS cho đơn mới (loa đọc đơn) ──────────────────────────────────
// VD: "Đơn mới, Bàn 3: 2 phở gà đặc biệt, 1 nước cam." — takeaway: "Đơn mang về: ..."
// Đọc tối đa 4 món, còn lại gộp "và N món khác".
function buildOrderSpeech(order: KitchenOrder): string {
  const MAX = 4
  const parts = order.items
    .slice(0, MAX)
    .map((i) => `${i.quantity} ${i.name}`)
  if (order.items.length > MAX) {
    parts.push(`và ${order.items.length - MAX} món khác`)
  }
  const lead =
    order.orderType !== 'dine_in' ? 'Đơn mang về' : `Đơn mới, ${order.tableNumber}`
  return parts.length > 0 ? `${lead}: ${parts.join(', ')}.` : `${lead}.`
}

// ─── Badge loại đơn (Bàn / Tự lấy / Ship) ───────────────────────────────────
function OrderTypeBadge({ order }: { order: KitchenOrder }) {
  if (order.orderType === 'pickup') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
        style={{ background: '#A0673D' }}
      >
        🚶 Tự lấy
      </span>
    )
  }
  if (order.orderType === 'delivery') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
        style={{ background: '#A0673D' }}
      >
        🛵 Ship
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ background: '#1a7f4b' }}
    >
      🪑 {order.tableNumber}
    </span>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  storeSlug: string
}

export default function KitchenDisplay({ storeSlug }: Props) {
  // Token bếp: lấy từ ?k=... (lần đầu, do MEVO cấp) rồi lưu localStorage; lần sau không cần link.
  const [token, setToken] = useState<string | null>(null)
  const [tokenMissing, setTokenMissing] = useState(false)

  useEffect(() => {
    const key = `mevo_kitchen_token_${storeSlug}`
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('k')
    if (fromUrl) {
      localStorage.setItem(key, fromUrl)
      setToken(fromUrl)
      // Xoá token khỏi thanh địa chỉ cho đỡ lộ khi chụp màn hình
      params.delete('k')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
      return
    }
    const stored = localStorage.getItem(key)
    if (stored) {
      setToken(stored)
      return
    }
    setTokenMissing(true)
  }, [storeSlug])

  // Client gắn token (chỉ tạo khi đã có token). RLS role 'kitchen' scope đúng quán.
  const supabase = useMemo(() => (token ? createKitchenClient(token) : null), [token])

  const [store, setStore] = useState<Store | null>(null)
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [callAlerts, setCallAlerts] = useState<Array<{ id: number; tableNumber: string; type: string }>>([])
  // Giải hiện vật vòng quay chưa đưa cho khách (card + loa TTS)
  const [giftAlerts, setGiftAlerts] = useState<Array<{
    id: string; label: string; where: string; createdAt: string
  }>>([])
  // Giữ track đơn đã biết để không thêm trùng vào danh sách
  const knownOrderIds = useRef<Set<string>>(new Set())
  // Đơn đã "báo bếp" (chuông + đọc) rồi — chống báo lại khi nhận nhiều event
  const announcedOrderIds = useRef<Set<string>>(new Set())

  // ── Loa đọc đơn (TTS) — mặc định TẮT, lưu localStorage theo quán ──────────
  const TTS_KEY = `mevo_kitchen_tts_${storeSlug}`
  const [ttsEnabled, setTtsEnabled] = useState(false)
  // Ref để realtime callback (closure cũ) đọc được trạng thái mới nhất
  const ttsEnabledRef = useRef(false)

  useEffect(() => {
    if (isTtsSupported()) initTts()
    const saved = localStorage.getItem(TTS_KEY) === '1'
    setTtsEnabled(saved)
    ttsEnabledRef.current = saved
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug])

  // Mở khoá audio ở cú CHẠM ĐẦU TIÊN của phiên. Trình duyệt chặn autoplay tới khi
  // có gesture → tab vừa reload (toggle bật sẵn từ localStorage) sẽ CÂM cho tới khi
  // nhân viên chạm màn hình. Sau 1 chạm bất kỳ, chuông + đọc đơn hoạt động.
  useEffect(() => {
    const onGesture = () => {
      unlockBellAudio()
      if (ttsEnabledRef.current) unlockTts()
      // chạm 1 lần là đủ mở khoá cho cả phiên → gỡ listener
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
    window.addEventListener('pointerdown', onGesture)
    window.addEventListener('keydown', onGesture)
    return () => {
      window.removeEventListener('pointerdown', onGesture)
      window.removeEventListener('keydown', onGesture)
    }
  }, [])

  // Bật/tắt loa. Lần bấm bật chính là user gesture để unlock audio (chặn autoplay).
  const toggleTts = () => {
    const next = !ttsEnabled
    setTtsEnabled(next)
    ttsEnabledRef.current = next
    localStorage.setItem(TTS_KEY, next ? '1' : '0')
    if (next) {
      initTts()
      // Cú chạm này là gesture → mở khoá cả chuông lẫn TTS cho phiên
      unlockBellAudio()
      // Đọc thử để xác nhận có tiếng + unlock audio trong cùng cú chạm
      speak('Đã bật đọc đơn')
    }
  }

  // Cập nhật "X phút trước" mỗi 30 giây
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // ── Fetch đơn đầy đủ kèm items + table ──────────────────────────────────
  const fetchOrder = useCallback(
    async (orderId: string): Promise<KitchenOrder | null> => {
      if (!supabase) return null
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
    if (!supabase) return

    // Hoist channel vars ra ngoài init() để cleanup đồng bộ có thể tham chiếu
    let ordersChannel: ReturnType<typeof supabase.channel> | null = null
    let srChannel: ReturnType<typeof supabase.channel> | null = null
    let giftChannel: ReturnType<typeof supabase.channel> | null = null

    async function init() {
      setLoading(true)
      setError(null)

      // 1. Lấy store theo slug
      const { data: storeData, error: storeErr } = await supabase!
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

      const { data: ordersData, error: ordersErr } = await supabase!
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
      mapped.forEach((o) => {
        knownOrderIds.current.add(o.id)
        // Đơn đã ở trong bếp lúc tải trang → coi như đã báo, reload không kêu lại.
        // ZaloPay còn pending (chưa trả) KHÔNG đánh dấu → lúc confirmed sẽ báo.
        if (orderInKitchen(o.status, o.paymentMethod)) announcedOrderIds.current.add(o.id)
      })
      setOrders(mapped)
      setLoading(false)

      // Giải hiện vật 6h gần nhất chưa đưa (phòng bếp F5 mất card)
      const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString()
      const { data: gifts } = await supabase!
        .from('spin_results')
        .select('id, reward_label, created_at, orders(order_type, tables(table_number))')
        .eq('store_id', storeData.id)
        .eq('reward_type', 'gift')
        .eq('status', 'won')
        .gte('created_at', sixHoursAgo)
        .order('created_at', { ascending: true })
      setGiftAlerts(
        (gifts ?? []).map((g) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const o = g.orders as any
          const where =
            o?.order_type && o.order_type !== 'dine_in'
              ? 'Đơn mang về'
              : (o?.tables?.table_number ?? 'Bàn ?')
          return { id: g.id, label: g.reward_label, where, createdAt: g.created_at }
        }),
      )

      // Báo bếp: chuông + (nếu bật) đọc đơn. Chỉ báo LẦN ĐẦU đơn vào bếp.
      const announce = (order: KitchenOrder) => {
        if (
          !shouldAnnounceOrder(
            order.status,
            order.paymentMethod,
            announcedOrderIds.current.has(order.id),
          )
        )
          return
        announcedOrderIds.current.add(order.id)
        playBell()
        // Chuông kêu trước, đọc sau ~300ms cho khỏi đè tiếng
        if (ttsEnabledRef.current) {
          setTimeout(() => speak(buildOrderSpeech(order)), 300)
        }
      }

      // 3. Subscribe Supabase Realtime — gán vào outer vars để cleanup hoạt động
      ordersChannel = supabase!
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
            // Chỉ báo khi đơn thực sự vào bếp: tiền mặt vào ngay; ZaloPay phải
            // chờ thanh toán xong (sẽ báo ở event UPDATE → confirmed bên dưới).
            announce(order)
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
          async (payload) => {
            const updated = payload.new as {
              id: string; status: string; updated_at: string; payment_method: string
            }
            setOrders((prev) =>
              prev
                .map((o) =>
                  o.id === updated.id
                    ? {
                        ...o,
                        status: updated.status as OrderStatus,
                        updatedAt: updated.updated_at,
                        paymentMethod: updated.payment_method as KitchenOrder['paymentMethod'],
                      }
                    : o,
                )
                // Xoá khỏi màn hình khi đã thanh toán hoặc huỷ
                .filter((o) => !['paid', 'cancelled'].includes(o.status)),
            )
            // Báo khi đơn VỪA vào bếp — vd ZaloPay pending→confirmed sau khi khách
            // trả tiền xong. Đã báo rồi (cooking/ready...) → bỏ qua, khỏi fetch thừa.
            if (
              shouldAnnounceOrder(
                updated.status,
                updated.payment_method,
                announcedOrderIds.current.has(updated.id),
              )
            ) {
              const order = await fetchOrder(updated.id)
              if (order) announce(order)
            }
          },
        )
        .subscribe()

      // Subscribe service_requests — nút chuông gọi nhân viên
      srChannel = supabase!
        .channel(`service-requests-${storeData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'service_requests',
            filter: `store_id=eq.${storeData.id}`,
          },
          (payload) => {
            const req = payload.new as { table_number: string; type: string }
            const alertId = Date.now()
            setCallAlerts((prev) => [
              ...prev,
              { id: alertId, tableNumber: req.table_number, type: req.type },
            ])
            playBell()
            // Loa đọc yêu cầu gọi nhân viên
            if (ttsEnabledRef.current) {
              const what = req.type === 'help' ? 'cần hỗ trợ' : 'gọi thanh toán'
              setTimeout(() => speak(`${req.table_number} ${what}`), 300)
            }
          },
        )
        .subscribe()

      // Subscribe spin_results — giải hiện vật vòng quay → báo mang ra luôn
      giftChannel = supabase!
        .channel(`spin-gifts-${storeData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'spin_results',
            filter: `store_id=eq.${storeData.id}`,
          },
          async (payload) => {
            const row = payload.new as {
              id: string; reward_type: string; reward_label: string
              order_id: string; created_at: string
            }
            if (row.reward_type !== 'gift') return // voucher/none KHÔNG báo bếp
            // Lấy bàn từ đơn (kitchen đọc được orders + tables)
            const { data: ord } = await supabase!
              .from('orders')
              .select('order_type, tables(table_number)')
              .eq('id', row.order_id)
              .single()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const o = ord as any
            const where =
              o?.order_type && o.order_type !== 'dine_in'
                ? 'Đơn mang về'
                : (o?.tables?.table_number ?? 'Bàn ?')
            setGiftAlerts((prev) => [
              ...prev,
              { id: row.id, label: row.reward_label, where, createdAt: row.created_at },
            ])
            playBell()
            if (ttsEnabledRef.current) {
              setTimeout(() => speak(`${where} trúng ${row.reward_label}`), 300)
            }
          },
        )
        .subscribe()
    }

    init()

    // Cleanup đồng bộ — React thấy return value này, channels được unsubscribe đúng khi unmount
    return () => {
      if (ordersChannel) supabase.removeChannel(ordersChannel)
      if (srChannel) supabase.removeChannel(srChannel)
      if (giftChannel) supabase.removeChannel(giftChannel)
    }
  }, [storeSlug, supabase, fetchOrder])

  // ── Cập nhật trạng thái đơn ───────────────────────────────────────────────
  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    if (!supabase) return
    // Optimistic update ngay lập tức
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
    )

    // Ghi qua RPC kitchen_set_status (state machine + scope store_id), KHÔNG update trực tiếp
    const { error } = await supabase.rpc('kitchen_set_status', {
      p_order_id: orderId,
      p_status: newStatus,
    })

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

  // Nhân viên đã mang quà ra → gạch card (RPC redeem_spin_result cho phép role kitchen)
  const redeemGift = async (resultId: string) => {
    if (!supabase) return
    setGiftAlerts((prev) => prev.filter((g) => g.id !== resultId)) // optimistic
    const { error } = await supabase.rpc('redeem_spin_result', { p_result_id: resultId })
    if (error) alert('Không đánh dấu được, thử lại!')
  }

  // ── Chia đơn theo cột ─────────────────────────────────────────────────────
  // pending chỉ hiện cho tiền mặt — ZaloPay pending chưa thanh toán không vào bếp.
  // Dùng chung predicate với logic "báo bếp" (lib/kitchen-announce) cho khỏi lệch.
  const waitingOrders = orders.filter((o) => orderInKitchen(o.status, o.paymentMethod))
  const cookingOrders = orders.filter((o) => o.status === 'cooking')
  const readyOrders = orders.filter((o) => o.status === 'ready')

  // ── Render ────────────────────────────────────────────────────────────────
  if (tokenMissing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="max-w-md text-center">
          <p className="text-2xl text-yellow-400">🍳 Chưa cấu hình bếp</p>
          <p className="mt-3 text-gray-400">
            Màn hình này cần link bếp do MEVO cấp. Vào Admin → “Màn hình bếp” → “Lấy link bếp”,
            rồi mở link đó trên tablet này một lần.
          </p>
        </div>
      </div>
    )
  }

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
      {/* Chuông gọi nhân viên — dismissable banners, xếp dọc không chồng nhau */}
      {callAlerts.length > 0 && (
        <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
          {callAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-3 rounded-xl bg-orange-500 px-4 py-3 text-white shadow-lg"
            >
              <span className="text-2xl">🔔</span>
              <div>
                <p className="font-bold">{alert.tableNumber} gọi thanh toán</p>
                <p className="text-sm opacity-80">Ra bàn thanh toán cho khách</p>
              </div>
              <button
                onClick={() => setCallAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                className="ml-2 opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Giải hiện vật vòng quay — mang ra cho khách */}
      {giftAlerts.length > 0 && (
        <div className="fixed left-4 top-4 z-50 flex flex-col gap-2">
          {giftAlerts.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-3 rounded-xl bg-purple-600 px-4 py-3 text-white shadow-lg"
            >
              <span className="text-2xl">🎁</span>
              <div>
                <p className="font-bold">{g.where} trúng {g.label}</p>
                <p className="text-sm opacity-80">Mang ra cho khách</p>
              </div>
              <button
                onClick={() => void redeemGift(g.id)}
                className="ml-2 rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30"
              >
                Đã đưa ✓
              </button>
            </div>
          ))}
        </div>
      )}

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
          {isTtsSupported() && (
            <button
              onClick={toggleTts}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                ttsEnabled
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
              )}
              title={ttsEnabled ? 'Đang bật đọc đơn — bấm để tắt' : 'Bật loa đọc đơn'}
            >
              {ttsEnabled ? '🔊' : '🔇'} Đọc đơn
            </button>
          )}
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
  const isTakeaway = order.orderType !== 'dine_in'

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        order.status === 'ready'
          ? 'border-green-800 bg-gray-900'
          : isUrgent
            ? 'border-red-700 bg-red-950/30'
            : isTakeaway
              ? 'border-2 border-amber-500 bg-gray-900'
              : 'border-gray-700 bg-gray-900',
      )}
    >
      {/* Banner nổi bật đơn mang về — bếp đóng túi mang đi */}
      {isTakeaway && (
        <div
          className="-mx-3 -mt-3 mb-2 rounded-t-xl px-3 py-1.5 text-center"
          style={{ background: '#A0673D' }}
        >
          <span className="text-sm font-extrabold tracking-wide text-white">
            {order.orderType === 'delivery' ? '🛵 SHIP' : '📦 MANG VỀ'}
          </span>
        </div>
      )}
      {/* Header card */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <OrderTypeBadge order={order} />
            {order.orderType !== 'dine_in' && order.customerName && (
              <span className="text-xs text-gray-400">{order.customerName}</span>
            )}
          </div>
          <span className="text-sm text-gray-400">#{shortId}</span>
          {order.orderType === 'delivery' && order.deliveryAddress && (
            <p className="text-[10px] text-gray-500 line-clamp-1">📍 {order.deliveryAddress}</p>
          )}
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
          <li key={item.id} className="text-sm">
            <div className="flex justify-between">
              <span className="text-gray-200">
                <strong className="text-white">×{item.quantity}</strong> {item.name}
              </span>
              {item.note && (
                <span className="ml-2 text-xs italic text-yellow-400">{item.note}</span>
              )}
            </div>
            {item.selectedToppings.length > 0 && (
              <div className="text-sm text-gray-500">
                {item.selectedToppings.map((t) => `+ ${t.name}`).join(', ')}
              </div>
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
