import 'server-only'
import { parseActiveDiscounts } from './menu-discount'

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

// Chương trình giảm giá đang hiệu lực của quán (mig 115). Lỗi (mig chưa áp, mất mạng) → coi như không có:
// màn vẫn chạy, chỉ không vẽ giá gạch; server create_order/staff_create_order vẫn tự trừ đúng.
export async function loadActiveMenuDiscounts(supabase: RpcClient, storeId: string) {
  try {
    const { data, error } = await supabase.rpc('get_active_menu_discounts', { p_store_id: storeId })
    return parseActiveDiscounts(error ? null : data)
  } catch {
    return parseActiveDiscounts(null)
  }
}
