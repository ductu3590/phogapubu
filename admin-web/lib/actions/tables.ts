'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'

async function getStoreId(): Promise<string> {
  return requireStoreOwnerStoreId()
}

// Thêm bàn mới
export async function addTable(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { error } = await admin.from('tables').insert({
    store_id: storeId,
    table_number: formData.get('table_number') as string,
    is_active: true,
  })
  if (error) throw new Error(`addTable: ${error.message}`)
  revalidatePath('/admin/tables')
}

// Bật/tắt bàn
export async function toggleTable(tableId: string, isActive: boolean) {
  await getStoreId() // xác thực user
  const admin = createAdminClient()
  const { error } = await admin
    .from('tables')
    .update({ is_active: isActive })
    .eq('id', tableId)
  if (error) throw new Error(`toggleTable: ${error.message}`)
  revalidatePath('/admin/tables')
}

// Xoá bàn — trả về { error } thay vì throw để không làm crash trang.
export async function deleteTable(tableId: string): Promise<{ error?: string }> {
  const storeId = await getStoreId() // xác thực user + lấy đúng quán
  const admin = createAdminClient()

  // Bàn đã có đơn hàng thì KHÔNG xoá cứng: orders.table_id là khoá ngoại RESTRICT,
  // xoá sẽ vỡ và làm mất liên kết lịch sử đơn/doanh thu. Hướng dẫn "Đóng" bàn thay vì xoá.
  const { count } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('table_id', tableId)
  if (count && count > 0) {
    return { error: 'Bàn này đã có đơn hàng nên không thể xoá. Bấm "Đóng" để ẩn bàn thay vì xoá.' }
  }

  const { error } = await admin
    .from('tables')
    .delete()
    .eq('id', tableId)
    .eq('store_id', storeId) // chỉ xoá bàn của đúng quán mình
  if (error) return { error: `Không xoá được bàn: ${error.message}` }
  revalidatePath('/admin/tables')
  return {}
}
