// Database types tương ứng với schema Supabase
export type OrderStatus = 'pending' | 'confirmed' | 'cooking' | 'ready' | 'paid' | 'cancelled'
export type PaymentMethod = 'zalo_checkout' | 'cash' | 'bank_transfer'
export type OrderType = 'dine_in' | 'pickup' | 'delivery'

// --- App-level types ---
export interface KitchenOrderItem {
  id: string
  menuItemId: string | null
  name: string
  quantity: number
  price: number
  note: string | null
  selectedToppings: { id: string; name: string; price: number }[]
  // Sprint 2: giữ món trong bếp để biết món nào khách vừa bỏ, không xoá audit.
  voidType: 'cancelled' | 'gift' | null
  voidReason: string | null
}

export interface KitchenOrder {
  id: string
  storeId: string
  tableId: string | null
  tableNumber: string
  status: OrderStatus
  totalAmount: number
  paymentMethod: PaymentMethod
  zaloUserId: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  orderType: OrderType
  orderSource: string
  paymentReceivedAt: string | null
  bankHandoffAt: string | null
  paymentInstrument: string | null
  customerName: string | null
  customerPhone: string | null
  pickupTime: string | null
  deliveryAddress: string | null
  items: KitchenOrderItem[]
}

export interface Store {
  id: string
  name: string
  slug: string
  // mig 039 — quyết định đơn có được vào bếp khi chưa có tiền (xem lib/kitchen-announce.ts)
  payment_timing: 'prepay' | 'postpay'
}
