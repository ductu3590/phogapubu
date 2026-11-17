import { createClient } from '@/lib/supabase/server'
import { parseSupplierList, type SupplierSummary } from '@/lib/suppliers'

// Đọc danh sách NCC cho server component (/admin/debts tab Nhà cung cấp, gợi ý NCC ở phiếu nhập). KHÔNG 'use server':
// không gọi được từ client. RPC gọi bằng phiên đăng nhập và tự kiểm quyền (chủ quán + quản lý). `storeId` phải lấy
// từ operator đã kiểm quyền ở nơi gọi, không bao giờ từ URL hay input client.
export async function loadSupplierList(storeId: string): Promise<
  { ok: true; suppliers: SupplierSummary[] } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('supplier_list', { p_store_id: storeId })
  if (error) return { ok: false, error: error.message }
  return { ok: true, suppliers: parseSupplierList(data) }
}
