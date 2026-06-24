'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Bucket Storage chứa ảnh món (public read, chỉ service-role ghi)
const MENU_BUCKET = 'menu-images'

// Upload ảnh món lên Storage, trả public URL. Trả null nếu không có file.
// File do client crop sẵn 1:1 rồi mới gửi lên.
async function uploadMenuImage(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  file: File | null,
): Promise<string | null> {
  if (!file || file.size === 0) return null
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`
  const { error } = await admin.storage
    .from(MENU_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) throw new Error(`uploadMenuImage: ${error.message}`)
  return admin.storage.from(MENU_BUCKET).getPublicUrl(path).data.publicUrl
}

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
  const imageUrl = await uploadMenuImage(admin, storeId, formData.get('image') as File | null)
  const { error } = await admin.from('menu_items').insert({
    store_id: storeId,
    category_id: formData.get('category_id') as string,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    price: parseInt(formData.get('price') as string, 10),
    image_url: imageUrl,
    is_available: true,
    sort_order: 0,
  })
  if (error) throw new Error(`addMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sửa món — chỉ đổi ảnh khi có file mới gửi lên
export async function updateMenuItem(itemId: string, formData: FormData) {
  const storeId = await getStoreId() // xác thực user
  const admin = createAdminClient()
  const imageUrl = await uploadMenuImage(admin, storeId, formData.get('image') as File | null)
  const patch: Record<string, unknown> = {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    price: parseInt(formData.get('price') as string, 10),
    category_id: formData.get('category_id') as string,
  }
  if (imageUrl) patch.image_url = imageUrl // không gửi ảnh mới thì giữ ảnh cũ
  const { error } = await admin.from('menu_items').update(patch).eq('id', itemId)
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

// Sửa tên danh mục
export async function updateCategory(categoryId: string, formData: FormData) {
  await getStoreId() // xác thực user
  const admin = createAdminClient()
  const { error } = await admin
    .from('menu_categories')
    .update({ name: formData.get('name') as string })
    .eq('id', categoryId)
  if (error) throw new Error(`updateCategory: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá danh mục — chặn nếu còn món để tránh mất dữ liệu ngoài ý muốn
export async function deleteCategory(categoryId: string) {
  await getStoreId() // xác thực user
  const admin = createAdminClient()
  const { count, error: countErr } = await admin
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
  if (countErr) throw new Error(`deleteCategory(count): ${countErr.message}`)
  if ((count ?? 0) > 0) {
    throw new Error('Danh mục còn món — hãy xoá hoặc chuyển hết món sang danh mục khác trước.')
  }
  const { error } = await admin.from('menu_categories').delete().eq('id', categoryId)
  if (error) throw new Error(`deleteCategory: ${error.message}`)
  revalidatePath('/admin/menu')
}
