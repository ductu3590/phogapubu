// Auto-generate bằng: npx supabase gen types typescript --project-id [project-id] > src/types/database.types.ts
// File này là placeholder cho đến khi có Supabase project thật

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string
          name: string
          slug: string
          phone: string | null
          address: string | null
          logo_url: string | null
          zalo_oa_id: string | null
          zalo_oa_url: string | null
          payment_methods: string[] | null
          takeaway_banner_url: string | null
          about_text: string | null
          wifi_name: string | null
          wifi_password: string | null
          primary_color: string
          is_accepting_orders: boolean
          serving_hours: Json
          delivery_area_note: string | null
          terms_of_use: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['stores']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['stores']['Insert']>
        Relationships: []
      }
      tables: {
        Row: {
          id: string
          store_id: string
          table_number: string
          is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['tables']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['tables']['Insert']>
        Relationships: []
      }
      menu_categories: {
        Row: {
          id: string
          store_id: string
          name: string
          sort_order: number
          is_active: boolean
        }
        Insert: Omit<Database['public']['Tables']['menu_categories']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['menu_categories']['Insert']>
        Relationships: []
      }
      menu_items: {
        Row: {
          id: string
          store_id: string
          category_id: string | null
          name: string
          description: string | null
          price: number
          image_url: string | null
          is_available: boolean
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['menu_items']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['menu_items']['Insert']>
        Relationships: []
      }
      toppings: {
        Row: { id: string; store_id: string; name: string; price: number; is_available: boolean; sort_order: number; created_at: string }
        Insert: Omit<Database['public']['Tables']['toppings']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['toppings']['Insert']>
        Relationships: []
      }
      menu_item_toppings: {
        Row: { menu_item_id: string; topping_id: string; store_id: string }
        Insert: Database['public']['Tables']['menu_item_toppings']['Row']
        Update: Partial<Database['public']['Tables']['menu_item_toppings']['Row']>
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          store_id: string
          table_id: string
          status: 'pending' | 'confirmed' | 'cooking' | 'ready' | 'paid' | 'cancelled'
          total_amount: number
          discount_amount: number
          voucher_id: string | null
          zalopay_trans_id: string | null
          zalo_user_id: string | null
          note: string | null
          payment_method: 'zalopay' | 'cash'
          capability_token: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          menu_item_id: string | null
          item_name: string
          item_price: number
          quantity: number
          note: string | null
          selected_toppings: { id: string; name: string; price: number }[]
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_zalopay_to_cash: {
        Args: { p_order_id: string; p_token: string }
        Returns: Json
      }
      cancel_order: {
        Args: { p_order_id: string; p_token: string }
        Returns: undefined
      }
      create_order: {
        Args: {
          p_store_id: string
          p_table_id: string
          p_items: Json
          p_payment_method: string
          p_zalo_user_id?: string | null
          p_note?: string | null
          p_order_type?: string | null
          p_customer_name?: string | null
          p_customer_phone?: string | null
          p_delivery_address?: string | null
          p_voucher_code?: string | null
        }
        Returns: Json
      }
      get_my_vouchers: {
        Args: { p_store_id: string; p_zalo_user_id: string }
        Returns: Json
      }
      check_voucher: {
        Args: { p_store_id: string; p_code: string; p_zalo_user_id: string; p_subtotal: number }
        Returns: Json
      }
      confirm_order_received: {
        Args: { p_order_id: string; p_zalo_user_id: string }
        Returns: undefined
      }
      get_takeaway_orders: {
        Args: { p_zalo_user_id: string; p_store_id: string }
        Returns: {
          id: string
          store_id: string
          status: string
          total_amount: number
          payment_method: string
          note: string | null
          order_type: string
          customer_name: string | null
          delivery_address: string | null
          ready_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }[]
      }
      get_spin_state: {
        Args: { p_order_id: string }
        Returns: Json
      }
      spin_wheel: {
        Args: { p_order_id: string }
        Returns: Json
      }
    }
  }
}
