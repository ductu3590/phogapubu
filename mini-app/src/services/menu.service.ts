import { supabase } from './supabase'
import type { Database } from '../types/database.types'

type Store = Database['public']['Tables']['stores']['Row']
type MenuCategory = Database['public']['Tables']['menu_categories']['Row']
type MenuItem = Database['public']['Tables']['menu_items']['Row']

export interface MenuCategoryWithItems extends MenuCategory {
  menu_items: MenuItem[]
}

export interface StoreMenu {
  store: Store
  categories: MenuCategoryWithItems[]
}

export async function getStoreMenu(storeSlug: string): Promise<StoreMenu> {
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('*')
    .eq('slug', storeSlug)
    .eq('is_active', true)
    .single()

  if (storeError || !store) {
    throw new Error(`Không tìm thấy quán: ${storeSlug}`)
  }

  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*)')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .order('sort_order')

  if (catError) throw catError

  return { store, categories: (categories ?? []) as MenuCategoryWithItems[] }
}

// Lấy thông tin bàn theo ID
export async function getTable(tableId: string) {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('id', tableId)
    .eq('is_active', true)
    .single()

  if (error || !data) throw new Error(`Không tìm thấy bàn: ${tableId}`)
  return data
}
