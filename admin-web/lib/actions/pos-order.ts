'use server'

import { createClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'

export type ConfirmOrderResult =
  | { ok: true; already: boolean; status: string }
  | { ok: false; error: string }

/**
 * Thu ngân xác nhận đơn khách vừa gọi → đơn chuyển 'pending' sang 'confirmed', rồi client mở
 * trang in 2 liên (phiếu bếp + phiếu bàn).
 *
 * Dùng createClient() — phiên đăng nhập thật — vì RPC cần auth.uid() để ghi confirmed_by;
 * createAdminClient() là mất sạch dấu vết "ai cho đơn này vào bếp".
 * requireStoreOwnerStoreId() chỉ để chặn sớm cho đẹp UI; chốt chặn thật nằm trong RPC
 * (is_store_owner_of), client không lách được.
 */
export async function confirmOrder(orderId: string): Promise<ConfirmOrderResult> {
  try {
    await requireStoreOwnerStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pos_confirm_order', { p_order_id: orderId })
  if (error) return { ok: false, error: error.message }

  const row = data as { already?: boolean; status?: string } | null
  return { ok: true, already: !!row?.already, status: row?.status ?? 'confirmed' }
}
