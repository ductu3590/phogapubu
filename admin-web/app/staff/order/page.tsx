import { requireStaffAreaOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import StaffOrderClient from './staff-order-client'

// Loader dùng client authenticated → RLS (is_store_scoped_operator) tự khoá theo quán của nhân viên.
// Nhân viên bị tắt (is_active=false) sẽ đọc rỗng — nhưng layout đã chặn họ trước đó.
export default async function StaffOrderPage() {
  const operator = await requireStaffAreaOrRedirect()
  const storeId = operator.storeId
  const supabase = await createClient()

  const [tablesRes, categoriesRes, toppingsRes] = await Promise.all([
    supabase.from('tables').select('id, table_number').eq('store_id', storeId).eq('is_active', true),
    supabase
      .from('menu_categories')
      .select('id, name, sort_order, menu_items(id, name, price, image_url, is_available, sort_order, menu_item_toppings(topping_id))')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('toppings').select('id, name, price, is_available, sort_order').eq('store_id', storeId).order('sort_order'),
  ])

  // Bàn: sắp xếp tự nhiên (Bàn 2 trước Bàn 10)
  const tables = (tablesRes.data ?? [])
    .map((t) => ({ id: t.id as string, tableNumber: t.table_number as string }))
    .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, 'vi', { numeric: true, sensitivity: 'base' }))

  // Chỉ topping đang bán
  const toppings = (toppingsRes.data ?? [])
    .filter((t) => t.is_available)
    .map((t) => ({ id: t.id as string, name: t.name as string, price: t.price as number }))
  const toppingById = new Map(toppings.map((t) => [t.id, t]))

  // Categories → chỉ món đang bán; mỗi món kèm danh sách topping khả dụng (đã gán + đang bán)
  const categories = (categoriesRes.data ?? [])
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      items: ((c.menu_items ?? []) as Array<Record<string, unknown>>)
        .filter((m) => m.is_available)
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
        .map((m) => ({
          id: m.id as string,
          name: m.name as string,
          price: m.price as number,
          imageUrl: (m.image_url as string | null) ?? null,
          toppings: ((m.menu_item_toppings ?? []) as Array<{ topping_id: string }>)
            .map((mt) => toppingById.get(mt.topping_id))
            .filter((t): t is { id: string; name: string; price: number } => !!t),
        })),
    }))
    .filter((c) => c.items.length > 0)

  return <StaffOrderClient tables={tables} categories={categories} />
}
