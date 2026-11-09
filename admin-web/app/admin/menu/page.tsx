import { createClient } from '@/lib/supabase/server'
import MenuClient from './menu-client'
import MenuAvailabilityClient from './menu-availability-client'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import { parsePrintSettings } from '@/lib/print/print-settings'

export default async function MenuPage() {
  const operator = await requireAdminPageOrRedirect('pos')
  const storeId = operator.storeId

  const supabase = await createClient()

  // Thu ngân (PA-2) + quản lý (mig 116): chỉ bật/tắt "Tạm hết" — không tải kho topping, không có màn sửa món.
  // RLS menu_items vẫn chỉ cho chủ quán sửa (is_store_owner_or_admin). Ô "Trừ kho" cho quản lý do module KHO thêm.
  if (operator.role !== 'store_owner') {
    const { data: cashierCategories } = await supabase
      .from('menu_categories')
      .select('id, name, sort_order, menu_items(id, name, price, is_available, sort_order, sku)')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'menu_items' })
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
          <h1 className="text-xl font-bold text-foreground">Thực đơn — bật/tắt Tạm hết</h1>
          <p className="text-sm text-muted">Món tắt sẽ hiện &quot;Tạm hết&quot; trên Mini App ngay. Sửa tên, giá món do chủ quán làm.</p>
        </div>
        <MenuAvailabilityClient categories={cashierCategories ?? []} />
      </div>
    )
  }

  // Lấy categories + items (mỗi món kèm topping_id đã gán + danh sách lựa chọn quyết định giá)
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*, menu_items(*, menu_item_toppings(topping_id), menu_item_variants(id, name, price, is_available, sort_order))')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('sort_order')

  // Kho topping dùng chung của quán
  const { data: toppings } = await supabase
    .from('toppings')
    .select('id, name, price, is_available, sort_order')
    .eq('store_id', storeId)
    .order('sort_order')

  // Trạm in (mig 114) cho ô "Trạm in" của danh mục. RPC lỗi (vd. mig chưa áp) → [] → không vẽ ô chọn, trang vẫn chạy.
  const stations = await Promise.resolve(supabase.rpc('get_print_settings', { p_store_id: storeId }))
    .then(({ data, error }) => (error ? null : parsePrintSettings(data)))
    .catch(() => null)
    .then((settings) => (settings?.stations ?? []).map((st) => ({ id: st.id, name: st.name })))

  const menuVersion = (categories ?? [])
    .map((category) => `${category.id}:${category.sort_order}:${category.name}:${category.menu_items?.length ?? 0}`)
    .join('|')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Quản lý menu</h1>
        <p className="text-sm text-muted">Toggle hết hàng, thêm/sửa/xóa món</p>
      </div>
      <MenuClient key={menuVersion} categories={categories ?? []} toppings={toppings ?? []} stations={stations} storeId={storeId} />
    </div>
  )
}
