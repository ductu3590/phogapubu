'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createStaffOrder, type StaffOrderItem } from '@/lib/actions/staff-order'
import { listOpenTableSessions, type OpenTableSession } from '@/lib/actions/table-session'
import { createClient } from '@/lib/supabase/client'
import { assignTrayColors } from '@/lib/tray-colors'
import { tableVisualState } from '@/lib/table-status'
import { ArrowLeftRight, Banknote, ChevronRight, CircleCheck, Landmark, Minus, Plus, ShoppingCart } from 'lucide-react'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Banner, EmptyState } from '@/components/ui/feedback'
import { Input } from '@/components/ui/field'
import { TABLE_STATE } from '@/components/ui/status'
import { cn } from '@/lib/utils'

type Topping = { id: string; name: string; price: number }
type Variant = { id: string; name: string; price: number }
type Item = { id: string; name: string; price: number; imageUrl: string | null; toppings: Topping[]; variants: Variant[]; hasVariantGroup: boolean; variantGroupName: string | null }
type Category = { id: string; name: string; items: Item[] }
type Table = { id: string; tableNumber: string }

type CartLine = {
  lineId: string
  menuItemId: string
  name: string
  basePrice: number
  toppings: Topping[]
  // Biến thể đã chọn (null = món không có nhóm biến thể). basePrice ĐÃ là giá biến thể.
  variant: Variant | null
  quantity: number
  note: string
}

const dong = (n: number) => `${n.toLocaleString('vi-VN')}đ`
const lineUnit = (l: CartLine) => l.basePrice + l.toppings.reduce((s, t) => s + t.price, 0)
const lineTotal = (l: CartLine) => lineUnit(l) * l.quantity

export default function StaffOrderClient({
  storeId,
  tables,
  categories,
  paymentTiming,
  initialSessions,
}: {
  storeId: string
  tables: Table[]
  categories: Category[]
  paymentTiming: 'prepay' | 'postpay'
  initialSessions: OpenTableSession[]
}) {
  const [sessions, setSessions] = useState(initialSessions)
  const [tableId, setTableId] = useState<string | null>(tables.length === 1 ? tables[0].id : null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [sheetItem, setSheetItem] = useState<Item | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ orderId: string; total: number; tableNumber: string } | null>(null)

  // client_request_id giữ nguyên khi retry cùng một giỏ; reset khi giỏ đổi để không "dính" đơn cũ.
  const reqIdRef = useRef<string | null>(null)
  const resetReqId = () => { reqIdRef.current = null }

  const tableNumber = tables.find((t) => t.id === tableId)?.tableNumber ?? ''
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0)
  const cartTotal = cart.reduce((s, l) => s + lineTotal(l), 0)

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) return categories.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(q))
    return categories.find((c) => c.id === activeCat)?.items ?? []
  }, [search, activeCat, categories])

  // Tải lại danh sách phiên. Không cộng dồn tại chỗ — nhân viên khác ghép/đóng mâm ở máy
  // khác, chỉ server mới biết bàn nào đang thuộc mâm nào.
  const reloadingRef = useRef(false)
  const reloadSessions = useCallback(async () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    try {
      const res = await listOpenTableSessions()
      // Lỗi thì GIỮ nguyên danh sách cũ: mất màu còn đỡ hơn nhảy hết bàn về lưới "Bàn khác"
      // trong khi mâm vẫn đang mở.
      if (res.ok) setSessions(res.sessions)
    } finally {
      reloadingRef.current = false
    }
  }, [])

  // Nhân viên A ghép mâm ở máy khác trong lúc nhân viên B đứng ở màn này — không nghe sự
  // kiện thì B thấy màu cũ và bấm nhầm bàn.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`staff-order-tables-${storeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_sessions', filter: `store_id=eq.${storeId}` },
        () => void reloadSessions(),
      )
      // session_tables không có cột store_id nên không lọc được — đành nghe hết rồi tải lại.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_tables' },
        () => void reloadSessions(),
      )
      .subscribe((status) => {
        // Nối lại sau khi rớt mạng có thể đã lỡ sự kiện → tải lại cho chắc.
        if (status === 'SUBSCRIBED') void reloadSessions()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [storeId, reloadSessions])

  // Nhóm bàn theo mâm cho màn chọn bàn: mỗi mâm một khối, bàn còn lại rơi xuống "Bàn khác".
  const { trayGroups, looseTables } = useMemo(() => {
    const colors = assignTrayColors(sessions)
    const tableById = new Map(tables.map((t) => [t.id, t]))
    const grouped = new Set<string>()

    const groups = sessions
      .filter((s) => colors.has(s.session_id))
      .map((s) => {
        const assigned = colors.get(s.session_id)!
        // Bàn của phiên có thể đã bị tắt (is_active=false) sau khi mâm mở → không có trong
        // `tables`. Bỏ qua, đừng dựng nút trỏ vào bàn không còn tồn tại.
        const groupTables = s.tables
          .map((t) => tableById.get(t.id))
          .filter((t): t is Table => !!t)
        for (const t of groupTables) grouped.add(t.id)
        return { sessionId: s.session_id, ...assigned, tables: groupTables }
      })
      .filter((g) => g.tables.length > 0)
      .sort((a, b) => a.index - b.index)

    return { trayGroups: groups, looseTables: tables.filter((t) => !grouped.has(t.id)) }
  }, [sessions, tables])

  // Bàn nào đang thuộc phiên nào — để chấm trạng thái và để liệt kê món khách đã gọi.
  // Cùng nguồn dữ liệu và cùng hàm tableVisualState() với màn POS, nếu không hai bên báo hai màu.
  const sessionByTable = useMemo(() => {
    const m = new Map<string, OpenTableSession>()
    for (const s of sessions) {
      if (s.status !== 'open') continue
      for (const t of s.tables) m.set(t.id, s)
    }
    return m
  }, [sessions])

  const phienBanNay = tableId ? sessionByTable.get(tableId) : undefined

  // Món khách đã gọi ở bàn này từ đầu bữa, gộp theo tên. Nhân viên cần con số này để trả lời
  // "tôi gọi mấy món rồi" và để khỏi bấm trùng món khách đã gọi qua mini-app.
  const daGoi = useMemo(() => {
    if (!phienBanNay) return { lines: [] as { name: string; quantity: number }[], count: 0 }
    const m = new Map<string, number>()
    for (const o of phienBanNay.orders) {
      for (const it of o.items) m.set(it.name, (m.get(it.name) ?? 0) + it.quantity)
    }
    const lines = [...m.entries()].map(([name, quantity]) => ({ name, quantity }))
    return { lines, count: lines.reduce((n, l) => n + l.quantity, 0) }
  }, [phienBanNay])

  function mutateCart(fn: (prev: CartLine[]) => CartLine[]) {
    resetReqId()
    setCart(fn)
  }

  function addSimple(item: Item) {
    mutateCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === item.id && l.variant === null && l.toppings.length === 0 && l.note === '')
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, { lineId: crypto.randomUUID(), menuItemId: item.id, name: item.name, basePrice: item.price, toppings: [], variant: null, quantity: 1, note: '' }]
    })
  }

  function onTapItem(item: Item) {
    // Món còn nhóm biến thể nhưng tắt hết lựa chọn: KHÔNG cho vào giỏ — server sẽ từ chối cả giỏ.
    if (item.hasVariantGroup && item.variants.length === 0) return
    if (item.toppings.length > 0 || item.variants.length > 0) setSheetItem(item)
    else addSimple(item)
  }

  function setQty(lineId: string, delta: number) {
    mutateCart((prev) =>
      prev
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    )
  }

  function setLineNote(lineId: string, note: string) {
    mutateCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, note } : l)))
  }

  async function submit(paymentMethod: 'cash' | 'bank_transfer') {
    if (!tableId || cart.length === 0) return
    setError('')
    setSubmitting(true)
    if (!reqIdRef.current) reqIdRef.current = crypto.randomUUID()
    const items: StaffOrderItem[] = cart.map((l) => ({
      menu_item_id: l.menuItemId,
      quantity: l.quantity,
      topping_ids: l.toppings.map((t) => t.id),
      variant_id: l.variant?.id ?? null,
      note: l.note.trim() || null,
    }))
    try {
      const res = await createStaffOrder({ tableId, items, paymentMethod, clientRequestId: reqIdRef.current, note: null })
      if (res.ok) {
        setSuccess({ orderId: res.orderId, total: res.total, tableNumber })
        setCart([])
        setCheckout(false)
        setShowCart(false)
        resetReqId()
      } else {
        setError(res.error)
      }
    } catch {
      // Lỗi mạng: GIỮ giỏ + client_request_id để bấm lại không tạo trùng.
      setError('Lỗi kết nối. Kiểm tra mạng rồi thử lại — bấm lại không tạo đơn trùng.')
    } finally {
      setSubmitting(false)
    }
  }

  function newOrder() {
    setSuccess(null)
    setError('')
    resetReqId()
    // Giữ bàn để đặt tiếp nhanh; nhân viên đổi bàn nếu cần.
  }

  // ---- Màn thành công ----
  if (success) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center">
        <CircleCheck className="mb-3 size-14 text-success-dot" aria-hidden />
        <h1 className="text-xl font-semibold text-foreground">Đã gửi vào bếp</h1>
        <dl className="mx-auto mt-5 w-full max-w-xs space-y-2 rounded-xl border border-border bg-surface p-4 text-left text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">Bàn</dt><dd className="font-medium text-foreground">{success.tableNumber}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Mã đơn</dt><dd className="font-mono text-foreground">#{success.orderId.slice(0, 8)}</dd></div>
          <div className="flex justify-between gap-3 border-t border-border pt-2"><dt className="text-muted">Tổng</dt><dd className="text-lg font-semibold text-foreground tabular">{dong(success.total)}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted">
          {paymentTiming === 'postpay'
            ? `Đã thêm vào ${success.tableNumber} — thu tiền khi khách ra về.`
            : 'Khách thanh toán tại quầy sau khi ăn.'}
        </p>
        <Button variant="primary" size="touch" onClick={newOrder} className="mt-6 w-full max-w-xs">
          Đơn mới
        </Button>
      </div>
    )
  }

  // ---- Màn chọn bàn ----
  if (!tableId) {
    return (
      <div className="mx-auto h-full max-w-md overflow-y-auto px-4 py-5">
        <h1 className="text-lg font-semibold text-foreground">Chọn bàn</h1>
        <ul className="mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Chú giải màu bàn">
          <li className="inline-flex items-center gap-1.5"><StatusDot tone={TABLE_STATE.free.tone} />{TABLE_STATE.free.label}</li>
          <li className="inline-flex items-center gap-1.5"><StatusDot tone={TABLE_STATE.serving.tone} />{TABLE_STATE.serving.label}</li>
          <li className="inline-flex items-center gap-1.5"><StatusDot tone={TABLE_STATE.pending.tone} />{TABLE_STATE.pending.label}</li>
        </ul>
        {tables.length === 0 ? (
          <EmptyState className="rounded-xl border border-dashed border-border-strong">Quán chưa có bàn nào đang bật.</EmptyState>
        ) : (
          <>
            {/* Mâm lên trên, theo thứ tự mở. Bấm bàn nào trong mâm cũng vào chung một bill —
                server tự nối qua open_session_id_for_table, ở đây chỉ là chuyện nhìn cho rõ.
                Màu mâm chỉ ở vạch trái (nhận diện), trạng thái bàn nói bằng chấm + chữ. */}
            {trayGroups.map((g) => (
              <section key={g.sessionId} aria-label={`Mâm ${g.index}`} className={`mb-3 rounded-xl border p-3 ${g.color.box}`}>
                <p className={`mb-2 text-sm font-semibold ${g.color.label}`}>
                  Mâm {g.index} · {g.tables.length} bàn
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {g.tables.map((t) => (
                    <BanNut key={t.id} label={t.tableNumber} session={sessionByTable.get(t.id)} className={g.color.chip} onClick={() => setTableId(t.id)} />
                  ))}
                </div>
              </section>
            ))}

            {/* Không có mâm nào thì màn hình y hệt trước đây — không thừa chữ "Bàn khác". */}
            {trayGroups.length > 0 && looseTables.length > 0 && (
              <p className="mt-4 mb-2 text-sm font-medium text-muted">Bàn khác</p>
            )}
            {looseTables.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {looseTables.map((t) => (
                  <BanNut key={t.id} label={t.tableNumber} session={sessionByTable.get(t.id)} onClick={() => setTableId(t.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ---- Màn menu ----
  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-background">
      {/* Bàn hiện tại + đổi bàn */}
      <div className="shrink-0 space-y-2 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-base font-semibold text-foreground">{tableNumber}</span>
          <Button icon={<ArrowLeftRight />} onClick={() => setTableId(null)}>
            Đổi bàn
          </Button>
        </div>

        {/* Món khách đã gọi từ đầu bữa — nhân viên phải biết để kiểm soát và trả lời khách.
            Gấp lại mặc định cho khỏi chiếm chỗ ô tìm món. */}
        {daGoi.count > 0 && (
          <details className="rounded-lg border border-border bg-background px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Khách đã gọi {daGoi.count} món · <span className="tabular">{phienBanNay?.total.toLocaleString('vi-VN')}đ</span>
            </summary>
            <ul className="mt-2 space-y-1">
              {daGoi.lines.map((l) => (
                <li key={l.name} className="flex justify-between gap-2 text-sm text-foreground">
                  <span className="min-w-0 truncate">{l.name}</span>
                  <span className="shrink-0 font-medium tabular">×{l.quantity}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[13px] text-muted">
              Gồm cả món khách tự gọi trên điện thoại.
            </p>
          </details>
        )}

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm món..."
          aria-label="Tìm món"
        />
        {!search && categories.length > 1 && (
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Danh mục">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
                className={cn(
                  'h-9 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  activeCat === c.id ? 'bg-primary-light text-primary' : 'text-foreground/70 active:bg-item-hover',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Danh sách món */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {visibleItems.length === 0 ? (
          <EmptyState>{search ? 'Không có món phù hợp.' : 'Danh mục này chưa có món đang bán.'}</EmptyState>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {visibleItems.map((item) => {
              const inCart = cart.filter((l) => l.menuItemId === item.id).reduce((s, l) => s + l.quantity, 0)
              // Hai kiểu tạm hết: chủ quán tắt cả món (page.tsx đã lọc bỏ, không tới đây), hoặc món
              // còn nhóm biến thể nhưng mọi lựa chọn đều tắt → bấm vào thì server từ chối CẢ giỏ.
              const soldOutByVariants = item.hasVariantGroup && item.variants.length === 0
              return (
                <li key={item.id} className={cn('flex items-center justify-between gap-3 p-3', soldOutByVariants && 'opacity-60')}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      {soldOutByVariants && <Badge tone="neutral">Tạm hết</Badge>}
                    </div>
                    {/* Món có biến thể: menu_items.price là giá lựa chọn RẺ NHẤT còn bán (trigger mig 042),
                        không phải giá bán thật → phải có tiền tố "Từ". Món tắt hết biến thể vẫn giữ giá
                        lựa chọn cuối cùng nên số trơ trọi càng dễ hiểu nhầm. */}
                    <p className="text-sm text-muted tabular">
                      {item.variants.length > 0 || soldOutByVariants ? 'Từ ' : ''}{dong(item.price)}
                    </p>
                    {item.toppings.length > 0 && <p className="text-[13px] text-muted">Có topping</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onTapItem(item)}
                    disabled={soldOutByVariants}
                    className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors active:bg-primary-hover disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted"
                    aria-label={soldOutByVariants ? `${item.name} tạm hết` : `Thêm ${item.name}`}
                  >
                    <Plus className="size-5" aria-hidden />
                    {inCart > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[13px] font-semibold text-surface tabular">{inCart}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Thanh giỏ cố định đáy (trong luồng flex, không dùng fixed để khỏi tràn viewport) */}
      {cartCount > 0 && (
        <div className="shrink-0 border-t border-border bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="flex min-h-12 w-full cursor-pointer items-center justify-between rounded-lg bg-primary px-4 text-primary-foreground transition-colors active:bg-primary-hover"
          >
            <span className="flex items-center gap-2 text-sm font-medium"><ShoppingCart className="size-5" aria-hidden />{cartCount} món</span>
            <span className="flex items-center gap-1 text-base font-semibold tabular">{dong(cartTotal)}<ChevronRight className="size-5" aria-hidden /></span>
          </button>
        </div>
      )}

      {/* Bottom sheet: chọn loại (bắt buộc nếu có) + topping + số lượng + ghi chú khi thêm món */}
      {sheetItem && (
        <OptionSheet
          key={sheetItem.id}
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onAdd={(variant, toppings, qty, note) => {
            mutateCart((prev) => [...prev, {
              lineId: crypto.randomUUID(),
              menuItemId: sheetItem.id,
              // Tên ghép sẵn 'Bia hơi (Cốc)' cho giống chuỗi staff_create_order sinh ra ở order_items.item_name
              name: variant ? `${sheetItem.name} (${variant.name})` : sheetItem.name,
              basePrice: variant ? variant.price : sheetItem.price,
              toppings, variant, quantity: qty, note,
            }])
            setSheetItem(null)
          }}
        />
      )}

      {/* Sheet giỏ hàng */}
      {showCart && (
        <Sheet
          title="Giỏ hàng"
          onClose={() => setShowCart(false)}
          footer={cart.length > 0 ? (
            <Button
              variant="primary"
              size="touch"
              onClick={() => { setShowCart(false); setCheckout(true) }}
              className="w-full"
            >
              Đặt món · <span className="tabular">{dong(cartTotal)}</span>
            </Button>
          ) : undefined}
        >
          {cart.length === 0 ? (
            <EmptyState>Giỏ trống.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {cart.map((l) => (
                <li key={l.lineId} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{l.name}</p>
                      {l.toppings.length > 0 && <p className="text-[13px] text-muted">+ {l.toppings.map((t) => t.name).join(', ')}</p>}
                      <p className="text-[13px] text-muted tabular">{dong(lineUnit(l))} × {l.quantity} = <span className="font-medium text-foreground">{dong(lineTotal(l))}</span></p>
                    </div>
                    <Stepper value={l.quantity} label={l.name} onMinus={() => setQty(l.lineId, -1)} onPlus={() => setQty(l.lineId, 1)} />
                  </div>
                  <Input
                    value={l.note}
                    onChange={(e) => setLineNote(l.lineId, e.target.value)}
                    placeholder="Ghi chú (vd: ít cay, không hành...)"
                    aria-label={`Ghi chú cho ${l.name}`}
                    className="mt-2"
                  />
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}

      {/* Sheet checkout: chọn phương thức */}
      {checkout && (
        <Sheet title="Khách trả bằng gì?" onClose={() => !submitting && setCheckout(false)}>
          <dl className="mb-3 space-y-1 rounded-lg bg-background p-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Bàn</dt><dd className="font-medium text-foreground">{tableNumber}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tổng</dt><dd className="font-semibold text-foreground tabular">{dong(cartTotal)}</dd></div>
          </dl>
          {error && <Banner tone="error" title={error} className="mb-3" />}
          <p className="mb-3 text-center text-[13px] text-muted">Đơn vào bếp ngay. Khách thanh toán tại quầy sau khi ăn.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="primary" size="touch" icon={<Banknote />} isLoading={submitting} onClick={() => submit('cash')} className="min-h-16">
              Tiền mặt
            </Button>
            <Button size="touch" icon={<Landmark />} isLoading={submitting} onClick={() => submit('bank_transfer')} className="min-h-16">
              Chuyển khoản
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function Stepper({ value, onMinus, onPlus, label }: { value: number; onMinus: () => void; onPlus: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Số lượng ${label}`}>
      <IconButton icon={<Minus />} label={`Bớt ${label}`} onClick={onMinus} className="border border-border-strong" />
      <span className="w-7 text-center text-sm font-semibold tabular">{value}</span>
      <IconButton icon={<Plus />} label={`Thêm ${label}`} onClick={onPlus} className="border border-border-strong" />
    </div>
  )
}

// Bottom sheet chung — dựng trên Dialog dùng chung (mobile trượt từ dưới, có nút đóng, khoá focus).
function Sheet({ title, onClose, footer, children }: { title: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Dialog open placement="side" title={title} onClose={onClose} footer={footer} className="md:inset-x-0 md:top-auto md:bottom-0 md:mx-auto md:h-auto md:max-h-[85dvh] md:w-full md:max-w-md md:rounded-none md:rounded-t-2xl">
      {children}
    </Dialog>
  )
}

function OptionSheet({ item, onClose, onAdd }: {
  item: Item
  onClose: () => void
  onAdd: (variant: Variant | null, toppings: Topping[], qty: number, note: string) => void
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  // KHÔNG chọn sẵn ô nào: nhân viên phải đọc giá rồi mới bấm, tránh bấm quen tay ra Tháp 200k.
  const [variantId, setVariantId] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  // item.variants đã lọc còn-bán và sắp thứ tự ở page.tsx → ở đây không lọc lại
  const available = item.variants
  const variant = available.find((v) => v.id === variantId) ?? null
  const canAdd = available.length === 0 || variant !== null
  const chosen = item.toppings.filter((t) => selected[t.id])
  const unit = (variant ? variant.price : item.price) + chosen.reduce((s, t) => s + t.price, 0)

  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Stepper value={qty} label={item.name} onMinus={() => setQty((q) => Math.max(1, q - 1))} onPlus={() => setQty((q) => q + 1)} />
          <Button variant="primary" size="touch" onClick={() => onAdd(variant, chosen, qty, note.trim())} disabled={!canAdd} className="flex-1">
            {canAdd ? `Thêm · ${dong(unit * qty)}` : 'Chọn loại trước'}
          </Button>
        </div>
      }
    >
      {available.length > 0 && (
        <>
          <p className="mb-2 text-sm font-medium text-foreground">
            {item.variantGroupName ?? 'Chọn loại'} <span className="font-normal text-muted">(bắt buộc)</span>
          </p>
          <div className="space-y-1.5" role="radiogroup" aria-label={item.variantGroupName ?? 'Chọn loại'}>
            {available.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={variantId === v.id}
                onClick={() => setVariantId(v.id)}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg border px-3 text-left text-sm transition-colors',
                  variantId === v.id ? 'border-primary bg-primary-light' : 'border-border-strong active:bg-item-hover',
                )}
              >
                <span className="text-foreground">{v.name}</span>
                <span className="font-medium text-foreground tabular">{v.price.toLocaleString('vi-VN')}đ</span>
              </button>
            ))}
          </div>
        </>
      )}
      {item.toppings.length > 0 && (
        <p className={cn('mb-2 text-sm font-medium text-foreground', available.length > 0 && 'mt-4')}>Chọn topping (nếu có)</p>
      )}
      <ul className="divide-y divide-border">
        {item.toppings.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-foreground">{t.name} <span className="text-muted tabular">+{dong(t.price)}</span></span>
              <input
                type="checkbox"
                checked={!!selected[t.id]}
                onChange={(e) => setSelected((s) => ({ ...s, [t.id]: e.target.checked }))}
                className="size-5 accent-[var(--primary)]"
              />
            </label>
          </li>
        ))}
      </ul>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú (vd: ít cay...)"
        aria-label="Ghi chú"
        className="mt-3"
      />
    </Sheet>
  )
}

// Nút bàn ở màn chọn bàn — chấm + chữ trạng thái đọc CÙNG hàm với sơ đồ POS (/admin/pos).
function BanNut({ label, session, className, onClick }: { label: string; session: OpenTableSession | undefined; className?: string; onClick: () => void }) {
  const state = TABLE_STATE[tableVisualState(session)]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${state.label}`}
      className={cn(
        'flex min-h-16 cursor-pointer flex-col items-start justify-center gap-1 rounded-xl border border-border-strong bg-surface px-3 py-2 text-left transition-colors active:bg-item-hover',
        className,
      )}
    >
      <span className="w-full truncate text-sm font-semibold text-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-[13px] text-muted">
        <StatusDot tone={state.tone} />
        {state.label}
      </span>
    </button>
  )
}
