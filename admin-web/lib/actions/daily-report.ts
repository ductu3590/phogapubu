import { createClient } from '@/lib/supabase/server'
import { requirePosOperatorStoreId } from '@/lib/auth/operator'
import { parseDailyReport, type DailyReport } from '@/lib/daily-report'

// Báo cáo ngày (PA-1): gọi bằng phiên đăng nhập (không dùng service key) — RPC tự kiểm quyền theo auth.uid().
// Chỉ dùng từ server component (không 'use server': không cần gọi từ trình duyệt).
// Chủ quán + thu ngân (PA-2).
export async function loadDailyReport(date: string): Promise<{ ok: true; report: DailyReport } | { ok: false; error: string }> {
  const storeId = await requirePosOperatorStoreId()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_daily_report', { p_store_id: storeId, p_date: date })
  if (error) return { ok: false, error: error.message }
  return { ok: true, report: parseDailyReport(data) }
}
