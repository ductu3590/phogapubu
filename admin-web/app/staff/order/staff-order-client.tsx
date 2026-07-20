'use client'

import { useMemo, useRef, useState } from 'react'
import { createStaffOrder, type StaffOrderItem } from '@/lib/actions/staff-order'

type Topping = { id: string; name: string; price: number }
type Item = { id: string; name: string; price: number; imageUrl: string | null; toppings: Topping[] }
type Category = { id: string; name: string; items: Item[] }
type Table = { id: string; tableNumber: string }

type CartLine = {
  lineId: string
  menuItemId: string
  name: string
  basePrice: number
  toppings: Topping[]
  quantity: number
  note: string
}

const dong = (n: number) => `${n.toLocaleString('vi-VN')}đ`
const lineUnit = (l: CartLine) => l.basePrice + l.toppings.reduce((s, t) => s + t.price, 0)
const lineTotal = (l: CartLine) => lineUnit(l) * l.quantity

export default function StaffOrderClient({ tables, categories }: { tables: Table[]; categories: Category[] }) {
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

  function mutateCart(fn: (prev: CartLine[]) => CartLine[]) {
    resetReqId()
    setCart(fn)
  }

  function addSimple(item: Item) {
    mutateCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === item.id && l.toppings.length === 0 && l.note === '')
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, { lineId: crypto.randomUUID(), menuItemId: item.id, name: item.name, basePrice: item.price, toppings: [], quantity: 1, note: '' }]
    })
  }

  function onTapItem(item: Item) {
    if (item.toppings.length > 0) setSheetItem(item)
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
        <div className="mb-3 text-6xl">✅</div>
        <h1 className="text-xl font-bold text-gray-900">Đã gửi vào bếp</h1>
        <div className="mx-auto mt-5 max-w-xs space-y-1 rounded-2xl border border-gray-200 bg-white p-5 text-left text-sm">
          <p className="flex justify-between"><span className="text-gray-500">Bàn</span><span className="font-semibold text-gray-900">{success.tableNumber}</span></p>
          <p className="flex justify-between"><span className="text-gray-500">Mã đơn</span><span className="font-mono text-gray-900">#{success.orderId.slice(0, 8)}</span></p>
          <p className="flex justify-between border-t border-gray-100 pt-2"><span className="text-gray-500">Tổng</span><span className="text-lg font-bold text-orange-600">{dong(success.total)}</span></p>
        </div>
        <p className="mt-4 text-sm text-gray-500">💵 Khách thanh toán tại quầy sau khi ăn.</p>
        <button onClick={newOrder} className="mt-6 w-full max-w-xs rounded-xl bg-orange-500 py-3.5 text-base font-semibold text-white hover:bg-orange-600">
          Đơn mới
        </button>
      </div>
    )
  }

  // ---- Màn chọn bàn ----
  if (!tableId) {
    return (
      <div className="mx-auto h-full max-w-md overflow-y-auto px-4 py-6">
        <h1 className="mb-4 text-lg font-bold text-gray-900">Chọn bàn</h1>
        {tables.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Quán chưa có bàn nào đang bật.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => setTableId(t.id)}
                className="flex min-h-[64px] items-center justify-center rounded-2xl border border-gray-200 bg-white px-2 py-3 text-center text-sm font-semibold text-gray-800 active:bg-orange-50"
              >
                {t.tableNumber}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---- Màn menu ----
  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      {/* Bàn hiện tại + đổi bàn */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-white px-4 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">🪑 {tableNumber}</span>
          <button onClick={() => setTableId(null)} className="rounded-lg px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50">Đổi bàn</button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm món..."
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />
        {!search && categories.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${activeCat === c.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
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
          <p className="py-10 text-center text-sm text-gray-400">Không có món phù hợp.</p>
        ) : (
          <ul className="space-y-2">
            {visibleItems.map((item) => {
              const inCart = cart.filter((l) => l.menuItemId === item.id).reduce((s, l) => s + l.quantity, 0)
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-orange-600">{dong(item.price)}</p>
                    {item.toppings.length > 0 && <p className="text-[11px] text-gray-400">Có topping</p>}
                  </div>
                  <button
                    onClick={() => onTapItem(item)}
                    className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xl font-bold text-white active:bg-orange-600"
                    aria-label={`Thêm ${item.name}`}
                  >
                    +
                    {inCart > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-900 px-1 text-[11px] text-white">{inCart}</span>
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
        <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50 p-3">
          <button
            onClick={() => setShowCart(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-orange-500 px-5 py-3.5 text-white shadow-lg active:bg-orange-600"
          >
            <span className="text-sm font-semibold">🛒 {cartCount} món</span>
            <span className="text-base font-bold">{dong(cartTotal)} →</span>
          </button>
        </div>
      )}

      {/* Bottom sheet: topping + số lượng + ghi chú khi thêm món */}
      {sheetItem && (
        <ToppingSheet
          item={sheetItem}
          onClose={() => setSheetItem(null)}
          onAdd={(toppings, qty, note) => {
            mutateCart((prev) => [...prev, { lineId: crypto.randomUUID(), menuItemId: sheetItem.id, name: sheetItem.name, basePrice: sheetItem.price, toppings, quantity: qty, note }])
            setSheetItem(null)
          }}
        />
      )}

      {/* Sheet giỏ hàng */}
      {showCart && (
        <Sheet title="Giỏ hàng" onClose={() => setShowCart(false)}>
          {cart.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Giỏ trống.</p>
          ) : (
            <ul className="space-y-3">
              {cart.map((l) => (
                <li key={l.lineId} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{l.name}</p>
                      {l.toppings.length > 0 && <p className="text-[11px] text-gray-500">+ {l.toppings.map((t) => t.name).join(', ')}</p>}
                      <p className="text-xs text-orange-600">{dong(lineUnit(l))} × {l.quantity} = {dong(lineTotal(l))}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button onClick={() => setQty(l.lineId, -1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg">−</button>
                      <span className="w-5 text-center text-sm font-semibold">{l.quantity}</span>
                      <button onClick={() => setQty(l.lineId, 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-lg">+</button>
                    </div>
                  </div>
                  <input
                    value={l.note}
                    onChange={(e) => setLineNote(l.lineId, e.target.value)}
                    placeholder="Ghi chú (vd: ít cay, không hành...)"
                    className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-orange-400"
                  />
                </li>
              ))}
            </ul>
          )}
          {cart.length > 0 && (
            <button
              onClick={() => { setShowCart(false); setCheckout(true) }}
              className="mt-4 flex w-full items-center justify-between rounded-xl bg-orange-500 px-5 py-3.5 font-semibold text-white active:bg-orange-600"
            >
              <span>Đặt món</span><span className="font-bold">{dong(cartTotal)}</span>
            </button>
          )}
        </Sheet>
      )}

      {/* Sheet checkout: chọn phương thức */}
      {checkout && (
        <Sheet title="Khách trả bằng gì?" onClose={() => !submitting && setCheckout(false)}>
          <div className="mb-3 rounded-xl bg-gray-50 p-3 text-sm">
            <p className="flex justify-between"><span className="text-gray-500">Bàn</span><span className="font-semibold">{tableNumber}</span></p>
            <p className="flex justify-between"><span className="text-gray-500">Tổng</span><span className="font-bold text-orange-600">{dong(cartTotal)}</span></p>
          </div>
          {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
          <p className="mb-3 text-center text-xs text-gray-500">Đơn vào bếp ngay. Khách thanh toán tại quầy sau khi ăn.</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => submit('cash')} disabled={submitting} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl bg-green-500 font-semibold text-white active:bg-green-600 disabled:opacity-60">
              <span className="text-2xl">💵</span><span className="text-sm">{submitting ? 'Đang gửi...' : 'Tiền mặt'}</span>
            </button>
            <button onClick={() => submit('bank_transfer')} disabled={submitting} className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl bg-blue-500 font-semibold text-white active:bg-blue-600 disabled:opacity-60">
              <span className="text-2xl">🏦</span><span className="text-sm">{submitting ? 'Đang gửi...' : 'Chuyển khoản'}</span>
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// Bottom sheet chung
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100">Đóng</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ToppingSheet({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (toppings: Topping[], qty: number, note: string) => void }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const chosen = item.toppings.filter((t) => selected[t.id])
  const unit = item.price + chosen.reduce((s, t) => s + t.price, 0)

  return (
    <Sheet title={item.name} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">Chọn topping (nếu có):</p>
      <ul className="space-y-2">
        {item.toppings.map((t) => (
          <li key={t.id}>
            <label className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
              <span className="text-sm text-gray-800">{t.name} <span className="text-orange-600">+{dong(t.price)}</span></span>
              <input
                type="checkbox"
                checked={!!selected[t.id]}
                onChange={(e) => setSelected((s) => ({ ...s, [t.id]: e.target.checked }))}
                className="h-5 w-5 accent-orange-500"
              />
            </label>
          </li>
        ))}
      </ul>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú (vd: ít cay...)"
        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
      />
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg">−</button>
          <span className="w-5 text-center font-semibold">{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 text-lg">+</button>
        </div>
        <button
          onClick={() => onAdd(chosen, qty, note.trim())}
          className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white active:bg-orange-600"
        >
          Thêm · {dong(unit * qty)}
        </button>
      </div>
    </Sheet>
  )
}
