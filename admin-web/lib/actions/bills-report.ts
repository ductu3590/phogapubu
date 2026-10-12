import { createClient } from '@/lib/supabase/server'
import { requirePosOperatorStoreId } from '@/lib/auth/operator'
import { parseBillsReport, type BillsReport } from '@/lib/bills-report'

// Trang "Hoá đơn & Báo cáo" (A04-1): gọi bằng phiên đăng nhập (không dùng service key) — RPC tự kiểm quyền
// theo auth.uid() (chủ quán + thu ngân). Chỉ dùng từ server component (không 'use server').
export async function loadBillsReport(date: string): Promise<{ ok: true; report: BillsReport } | { ok: false; error: string }> {
  const storeId = await requirePosOperatorStoreId()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_bills_report', { p_store_id: storeId, p_date: date })
  if (error) return { ok: false, error: error.message }
  return { ok: true, report: parseBillsReport(data) }
}
