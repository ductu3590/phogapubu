'use server'

import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { BUSINESS_DAY_START_OPTIONS } from '@/lib/daily-report'
import { createClient } from '@/lib/supabase/server'

// Giờ bắt đầu ngày kinh doanh (mig 111). Gọi bằng phiên đăng nhập, không dùng service key: RPC tự kiểm quyền.
// RPC riêng, không qua update_store_workflow_settings: hàm đó bắt đủ 19 khoá và từ chối khoá lạ.
export async function saveBusinessDayStart(start: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!BUSINESS_DAY_START_OPTIONS.includes(start)) {
    return { ok: false, error: 'Giờ bắt đầu ngày phải từ 00:00 đến 12:00, bước 30 phút' }
  }
  try {
    const storeId = await requireStoreOwnerStoreId()
    const supabase = await createClient()
    const { error } = await supabase.rpc('set_business_day_start', { p_store_id: storeId, p_start: start })
    if (error) return { ok: false, error: error.message }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không lưu được giờ bắt đầu ngày' }
  }
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
