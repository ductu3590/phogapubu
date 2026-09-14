import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listOpenTableSessions } from '@/lib/actions/table-session'
import { loadFloorLayout } from '@/lib/actions/floor-layout'
import type { PosMenuCategory } from './manual-order-sheet'
import CashierClient from './cashier-client'
import { listOpenServiceRequests } from '@/lib/actions/service-requests'

// Màn POS thu ngân — chỉ chủ quán. AdminLayout đã chặn, kiểm lại ở đây cho fail-closed
// theo tầng (page có thể bị render ngoài layout khi Next đổi cách nhóm route).
export default async function CashierPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const supabase = await createClient()

  const { data: workflow } = await supabase.rpc('get_public_store_workflow', {
    p_store_id: operator.storeId,
  })

  const floor = await loadFloorLayout()

  const { data: categoryRows } = await supabase
    .from('menu_categories')
    .select('id, name, sort_order, menu_items(id, name, price, is_available, sort_order, menu_item_toppings(topping_id), menu_item_variants(id, name, price, is_available, sort_order))')
    .eq('store_id', operator.storeId)
    .eq('is_active', true)
    .order('sort_order')

  const { data: toppingRows } = await supabase
    .from('toppings')
    .select('id, name, price, is_available, sort_order')
    .eq('store_id', operator.storeId)
    .eq('is_available', true)
    .order('sort_order')

  const toppingById = new Map((toppingRows ?? []).map((topping) => [topping.id as string, topping]))
  const categories: PosMenuCategory[] = (categoryRows ?? []).map((category) => ({
    id: category.id as string,
    name: category.name as string,
    items: ((category.menu_items ?? []) as unknown as Array<{
      id: string; name: string; price: number; is_available: boolean; sort_order: number
      menu_item_toppings: { topping_id: string }[]
      menu_item_variants: { id: string; name: string; price: number; is_available: boolean; sort_order: number }[]
    }>)
      .filter((item) => item.is_available)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        toppings: (item.menu_item_toppings ?? [])
          .map((row) => toppingById.get(row.topping_id))
          .filter((topping): topping is NonNullable<typeof topping> => !!topping)
          .map((topping) => ({ id: topping.id as string, name: topping.name as string, price: topping.price as number })),
        variants: (item.menu_item_variants ?? [])
          .filter((variant) => variant.is_available)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((variant) => ({ id: variant.id, name: variant.name, price: variant.price })),
        hasVariantGroup: (item.menu_item_variants ?? []).length > 0,
      })),
  }))

  const res = await listOpenTableSessions()
  const requests = await listOpenServiceRequests()

  return (
    <CashierClient
      storeId={operator.storeId}
      initialRequests={requests.ok ? requests.requests : []}
      initialRequestError={requests.ok ? null : requests.error}
      paymentTiming={
        ((workflow as { payment_timing?: 'prepay' | 'postpay' } | null)?.payment_timing) ??
        'prepay'
      }
      initialFloor={floor.ok ? floor.snapshot : null}
      initialFloorError={floor.ok ? null : floor.error}
      categories={categories}
      initialSessions={res.ok ? res.sessions : []}
      initialError={res.ok ? null : res.error}
    />
  )
}
