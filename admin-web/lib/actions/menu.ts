'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Lấy storeId của user hiện tại (dùng anon client để xác thực)
async function getStoreId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Chưa đăng nhập')

  const storeId: string | undefined = user.user_metadata?.store_id
  if (storeId) return storeId

  // Fallback: lấy store đầu tiên
  const admin = createAdminClient()
  const { data } = await admin.from('stores').select('id').eq('is_active', true).limit(1).single()
  if (!data) throw new Error('Không tìm thấy quán')
  return data.id as string
}

// Toggle bật/tắt món (1 click)
export async function toggleMenuItem(itemId: string, isAvailable: boolean) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('menu_items')
    .update({ is_available: isAvailable })
    .eq('id', itemId)
  if (error) throw new Error(`toggleMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Thêm món mới
export async function addMenuItem(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { error } = await admin.from('menu_items').insert({
    store_id: storeId,
    category_id: formData.get('category_id') as string,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    price: parseInt(formData.get('price') as string, 10),
    is_available: true,
    sort_order: 0,
  })
  if (error) throw new Error(`addMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sửa món
export async function updateMenuItem(itemId: string, formData: FormData) {
  await getStoreId() // xác thực user
  const admin = createAdminClient()
  const { error } = await admin
    .from('menu_items')
    .update({
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
      price: parseInt(formData.get('price') as string, 10),
      category_id: formData.get('category_id') as string,
    })
    .eq('id', itemId)
  if (error) throw new Error(`updateMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá món
export async function deleteMenuItem(itemId: string) {
  await getStoreId() // xác thực user
  const admin = createAdminClient()
  const { error } = await admin.from('menu_items').delete().eq('id', itemId)
  if (error) throw new Error(`deleteMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Thêm danh mục
export async function addCategory(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { error } = await admin.from('menu_categories').insert({
    store_id: storeId,
    name: formData.get('name') as string,
    sort_order: 0,
    is_active: true,
  })
  if (error) throw new Error(`addCategory: ${error.message}`)
  revalidatePath('/admin/menu')
}
