// Database types tương ứng với schema Supabase
export type OrderStatus = 'pending' | 'confirmed' | 'cooking' | 'ready' | 'paid' | 'cancelled'
export type PaymentMethod = 'zalo_checkout' | 'cash' | 'bank_transfer'
export type OrderType = 'dine_in' | 'pickup' | 'delivery'

// --- Row types ---
interface StoreRow {
  id: string
  name: string
  slug: string
  phone: string | null
  address: string | null
  logo_url: string | null
  zalo_oa_id: string | null
  primary_color: string
  wifi_name: string | null
  wifi_password: string | null
  is_accepting_orders: boolean
  serving_hours: { open: string; close: string }[]
  delivery_area_note: string | null
  terms_of_use: string | null
  spin_enabled: boolean
  is_active: boolean
  created_at: string
}

interface SpinRewardRow {
  id: string
  store_id: string
  label: string
  type: 'gift' | 'none'
  weight: number
  sort_order: number
  is_active: boolean
  created_at: string
}

interface SpinResultRow {
  id: string
  store_id: string
  order_id: string
  zalo_user_id: string | null
  reward_id: string | null
  reward_label: string
  reward_type: string
  status: 'won' | 'redeemed'
  created_at: string
  redeemed_at: string | null
}

interface TableRow {
  id: string
  store_id: string
  table_number: string
  is_active: boolean
}

interface MenuCategoryRow {
  id: string
  store_id: string
  name: string
  sort_order: number
  is_active: boolean
}

interface MenuItemRow {
  id: string
  store_id: string
  category_id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  is_available: boolean
  sort_order: number
  created_at: string
}

interface OrderRow {
  id: string
  store_id: string
  table_id: string | null
  status: OrderStatus
  total_amount: number
  payment_method: PaymentMethod
  zalopay_trans_id: string | null
  zalo_user_id: string | null
  note: string | null
  created_at: string
  updated_at: string
  order_type: OrderType
  customer_name: string | null
  customer_phone: string | null
  pickup_time: string | null
  delivery_address: string | null
}

interface OrderItemRow {
  id: string
  order_id: string
  menu_item_id: string | null
  item_name: string
  item_price: number
  quantity: number
  note: string | null
}

// --- Database type cho Supabase client (phải có Relationships để match GenericTable) ---
export interface Database {
  public: {
    Tables: {
      stores: {
        Row: StoreRow
        Insert: { name: string; slug: string; phone?: string | null; address?: string | null; logo_url?: string | null; is_active?: boolean }
        Update: Partial<StoreRow>
        Relationships: []
      }
      tables: {
        Row: TableRow
        Insert: { store_id: string; table_number: string; is_active?: boolean }
        Update: Partial<TableRow>
        Relationships: []
      }
      menu_categories: {
        Row: MenuCategoryRow
        Insert: { store_id: string; name: string; sort_order?: number; is_active?: boolean }
        Update: Partial<MenuCategoryRow>
        Relationships: []
      }
      menu_items: {
        Row: MenuItemRow
        Insert: { store_id: string; category_id: string; name: string; price: number; description?: string | null; image_url?: string | null; is_available?: boolean; sort_order?: number }
        Update: Partial<MenuItemRow>
        Relationships: []
      }
      orders: {
        Row: OrderRow
        Insert: { store_id: string; table_id?: string | null; total_amount: number; payment_method: PaymentMethod; status?: OrderStatus; note?: string | null; zalo_user_id?: string | null }
        Update: Partial<OrderRow>
        Relationships: []
      }
      order_items: {
        Row: OrderItemRow
        Insert: { order_id: string; item_name: string; item_price: number; quantity: number; menu_item_id?: string | null; note?: string | null }
        Update: Partial<OrderItemRow>
        Relationships: []
      }
      spin_rewards: {
        Row: SpinRewardRow
        Insert: { store_id: string; label: string; type?: 'gift' | 'none'; weight?: number; sort_order?: number; is_active?: boolean; id?: string }
        Update: Partial<SpinRewardRow>
        Relationships: []
      }
      spin_results: {
        Row: SpinResultRow
        Insert: { store_id: string; order_id: string; reward_label: string; reward_type: string; zalo_user_id?: string | null; reward_id?: string | null; status?: 'won' | 'redeemed' }
        Update: Partial<SpinResultRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// --- App-level types ---
export interface KitchenOrderItem {
  id: string
  menuItemId: string | null
  name: string
  quantity: number
  price: number
  note: string | null
  selectedToppings: { id: string; name: string; price: number }[]
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
}
