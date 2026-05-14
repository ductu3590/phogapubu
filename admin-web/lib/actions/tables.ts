'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getStoreId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Chưa đăng nhập')

  const storeId: string | undefined = user.user_metadata?.store_id
  if (storeId) return storeId

  const admin = createAdminClient()
  const { data } = await admin.from('stores').select('id').eq('is_active', true).limit(1).single()
  if (!data) throw new Error('Không tìm thấy quán')
  return data.id as string
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

// Xoá bàn
export async function deleteTable(tableId: string) {
  await getStoreId() // xác thực user
  const admin = createAdminClient()
  const { error } = await admin.from('tables').delete().eq('id', tableId)
  if (error) throw new Error(`deleteTable: ${error.message}`)
  revalidatePath('/admin/tables')
}
