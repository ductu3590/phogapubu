// Database types tương ứng với schema Supabase
export type OrderStatus = 'pending' | 'confirmed' | 'cooking' | 'ready' | 'paid' | 'cancelled'
export type PaymentMethod = 'zalopay' | 'cash'

// --- Row types ---
interface StoreRow {
  id: string
  name: string
  slug: string
  phone: string | null
  address: string | null
  logo_url: string | null
  zalopay_app_id: string | null
  zalopay_key1: string | null
  zalopay_key2: string | null
  zalo_oa_id: string | null
  is_active: boolean
  created_at: string
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
  table_id: string
  status: OrderStatus
  total_amount: number
  payment_method: PaymentMethod
  zalopay_trans_id: string | null
  zalo_user_id: string | null
  note: string | null
  created_at: string
  updated_at: string
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
        Insert: { store_id: string; table_id: string; total_amount: number; payment_method: PaymentMethod; status?: OrderStatus; note?: string | null; zalo_user_id?: string | null }
        Update: Partial<OrderRow>
        Relationships: []
      }
      order_items: {
        Row: OrderItemRow
        Insert: { order_id: string; item_name: string; item_price: number; quantity: number; menu_item_id?: string | null; note?: string | null }
        Update: Partial<OrderItemRow>
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
}

export interface KitchenOrder {
  id: string
  storeId: string
  tableId: string
  tableNumber: string
  status: OrderStatus
  totalAmount: number
  paymentMethod: PaymentMethod
  zaloUserId: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  items: KitchenOrderItem[]
}

export interface Store {
  id: string
  name: string
  slug: string
}
