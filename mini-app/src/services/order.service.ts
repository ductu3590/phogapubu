import { supabase } from './supabase'
import type { Database } from '../types/database.types'

type Order = Database['public']['Tables']['orders']['Row']
type OrderInsert = Database['public']['Tables']['orders']['Insert']

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  note?: string
}

export interface CreateOrderParams {
  storeId: string
  tableId: string
  items: CartItem[]
  zaloUserId?: string
  note?: string
  paymentMethod?: 'zalopay' | 'cash'
}

export async function createOrder(params: CreateOrderParams): Promise<Order> {
  const totalAmount = params.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  const orderInsert: OrderInsert = {
    store_id: params.storeId,
    table_id: params.tableId,
    total_amount: totalAmount,
    zalo_user_id: params.zaloUserId ?? null,
    note: params.note ?? null,
    payment_method: params.paymentMethod ?? 'zalopay',
    status: 'pending',
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(orderInsert)
    .select()
    .single()

  if (orderError || !order) throw orderError

  // Snapshot tên + giá vào order_items — bảo vệ khi menu thay đổi sau này
  const { error: itemsError } = await supabase.from('order_items').insert(
    params.items.map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      item_name: item.name,
      item_price: item.price,
      quantity: item.quantity,
      note: item.note ?? null,
    }))
  )

  if (itemsError) throw itemsError

  return order
}

export async function getOrderWithItems(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single()

  if (error || !data) throw new Error(`Không tìm thấy đơn hàng: ${orderId}`)
  return data
}

// Subscribe realtime cho 1 đơn hàng (Mini App — trang trạng thái)
export function subscribeToOrder(
  orderId: string,
  onUpdate: (order: Order) => void
) {
  return supabase
    .channel(`order-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => onUpdate(payload.new as Order)
    )
    .subscribe()
}
