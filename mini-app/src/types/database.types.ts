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
          zalopay_app_id: string | null
          zalopay_key1: string | null
          zalopay_key2: string | null
          zalo_oa_id: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['stores']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['stores']['Insert']>
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
      }
      orders: {
        Row: {
          id: string
          store_id: string
          table_id: string
          status: 'pending' | 'confirmed' | 'cooking' | 'ready' | 'paid' | 'cancelled'
          total_amount: number
          zalopay_trans_id: string | null
          zalo_user_id: string | null
          note: string | null
          payment_method: 'zalopay' | 'cash'
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
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
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
    }
  }
}
