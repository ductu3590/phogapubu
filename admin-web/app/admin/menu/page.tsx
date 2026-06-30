import { createClient } from '@/lib/supabase/server'
import MenuClient from './menu-client'

export default async function MenuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Lấy store
  const storeIdMeta: string | undefined = user.user_metadata?.store_id
  let storeId = storeIdMeta
  if (!storeId) {
    const { data } = await supabase.from('stores').select('id').eq('is_active', true).limit(1).single()
    storeId = data?.id
  }
  if (!storeId) return <p className="p-6 text-gray-400">Chưa có quán nào.</p>

  // Lấy categories + items (mỗi món kèm danh sách topping_id đã gán)
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*, menu_item_toppings(topping_id))')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('sort_order')

  // Kho topping dùng chung của quán
  const { data: toppings } = await supabase
    .from('toppings')
    .select('id, name, price, is_available, sort_order')
    .eq('store_id', storeId)
    .order('sort_order')
  const menuVersion = (categories ?? [])
    .map((category) => `${category.id}:${category.sort_order}:${category.name}:${category.menu_items?.length ?? 0}`)
    .join('|')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🍽️ Quản lý menu</h1>
        <p className="text-sm text-gray-500">Toggle hết hàng, thêm/sửa/xóa món</p>
      </div>
      <MenuClient key={menuVersion} categories={categories ?? []} toppings={toppings ?? []} storeId={storeId} />
    </div>
  )
}
