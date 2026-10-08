'use server'

import { createAdminClient, createClient } from '@/lib/supabase/server'
import { buildSortUpdates } from '@/lib/menu/reorder'
import { parseVnd } from '@/lib/money'
import { revalidatePath } from 'next/cache'
import { requirePosOperatorStoreId, requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { parseBadge, parseManualSku, parsePrefix } from '@/lib/menu/sku'

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
  return requireStoreOwnerStoreId()
}

// Ném lỗi nếu món không thuộc store của user → chống service-role sửa chéo store
async function assertMenuItemInStore(menuItemId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_items')
    .select('id, store_id')
    .eq('id', menuItemId)
    .single()
  if (error || !data) throw new Error('Không tìm thấy món')
  if (data.store_id !== storeId) throw new Error('Món không thuộc quán của bạn')
}

async function assertCategoryInStore(categoryId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_categories')
    .select('id, store_id')
    .eq('id', categoryId)
    .single()
  if (error || !data) throw new Error('Không tìm thấy danh mục')
  if (data.store_id !== storeId) throw new Error('Danh mục không thuộc quán của bạn')
}

// Ném lỗi nếu topping không thuộc store của user (kho topping dùng chung)
async function assertToppingInStore(toppingId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('toppings').select('id, store_id').eq('id', toppingId).single()
  if (error || !data) throw new Error('Không tìm thấy topping')
  if (data.store_id !== storeId) throw new Error('Topping không thuộc quán của bạn')
}

// Ném lỗi nếu biến thể không thuộc store của user
async function assertVariantInStore(variantId: string, storeId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_item_variants')
    .select('id, store_id')
    .eq('id', variantId)
    .single()
  if (error || !data) throw new Error('Không tìm thấy lựa chọn')
  if (data.store_id !== storeId) throw new Error('Lựa chọn không thuộc quán của bạn')
}

// Thêm topping vào kho dùng chung của quán
export async function addPoolTopping(name: string, price: number) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { data: maxRow } = await admin.from('toppings').select('sort_order')
    .eq('store_id', storeId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1
  const { error } = await admin.from('toppings').insert({
    store_id: storeId, name: name.trim(), price: Math.max(0, Math.round(price)),
    is_available: true, sort_order: nextSort,
  })
  if (error) throw new Error(`addPoolTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sửa topping trong kho (tên/giá/tạm hết)
export async function updatePoolTopping(toppingId: string, patch: { name?: string; price?: number; is_available?: boolean }) {
  const storeId = await getStoreId()
  await assertToppingInStore(toppingId, storeId)
  const admin = createAdminClient()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.price !== undefined) update.price = Math.max(0, Math.round(patch.price))
  if (patch.is_available !== undefined) update.is_available = patch.is_available
  const { error } = await admin.from('toppings').update(update).eq('id', toppingId)
  if (error) throw new Error(`updatePoolTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá topping khỏi kho — gỡ luôn khỏi mọi món (junction xoá theo FK/cascade)
export async function deletePoolTopping(toppingId: string) {
  const storeId = await getStoreId()
  await assertToppingInStore(toppingId, storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('toppings').delete().eq('id', toppingId)
  if (error) throw new Error(`deletePoolTopping: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Gán/bỏ topping cho 1 món — thay toàn bộ danh sách link bằng toppingIds mới
export async function setMenuItemToppings(menuItemId: string, toppingIds: string[]) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  const ids = [...new Set(toppingIds)]
  if (ids.length > 0) {
    const { data, error } = await admin.from('toppings').select('id').eq('store_id', storeId).in('id', ids)
    if (error) throw new Error(`setMenuItemToppings(check): ${error.message}`)
    if ((data?.length ?? 0) !== ids.length) throw new Error('Có topping không thuộc quán')
  }
  const { error: delErr } = await admin.from('menu_item_toppings').delete().eq('menu_item_id', menuItemId)
  if (delErr) throw new Error(`setMenuItemToppings(del): ${delErr.message}`)
  if (ids.length > 0) {
    const rows = ids.map((tid) => ({ menu_item_id: menuItemId, topping_id: tid, store_id: storeId }))
    const { error: insErr } = await admin.from('menu_item_toppings').insert(rows)
    if (insErr) throw new Error(`setMenuItemToppings(ins): ${insErr.message}`)
  }
  revalidatePath('/admin/menu')
}

// Toggle bật/tắt món (1 click)
export async function toggleMenuItem(itemId: string, isAvailable: boolean) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { error } = await admin
    .from('menu_items')
    .update({ is_available: isAvailable })
    .eq('id', itemId)
    .eq('store_id', storeId)
  if (error) throw new Error(`toggleMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

export async function reorderCategories(categoryIds: string[]) {
  const storeId = await getStoreId()
  const updates = buildSortUpdates(categoryIds)
  if (updates.length === 0) return

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_categories')
    .select('id')
    .eq('store_id', storeId)
    .in('id', updates.map((update) => update.id))
  if (error) throw new Error(`reorderCategories(select): ${error.message}`)
  if ((data?.length ?? 0) !== updates.length) {
    throw new Error('Danh sách danh mục không hợp lệ')
  }

  for (const update of updates) {
    const { error: updateError } = await admin
      .from('menu_categories')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id)
      .eq('store_id', storeId)
    if (updateError) throw new Error(`reorderCategories(update): ${updateError.message}`)
  }

  revalidatePath('/admin/menu')
}

export async function reorderMenuItems(categoryId: string, itemIds: string[]) {
  const storeId = await getStoreId()
  await assertCategoryInStore(categoryId, storeId)
  const updates = buildSortUpdates(itemIds)
  if (updates.length === 0) return

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_items')
    .select('id')
    .eq('store_id', storeId)
    .eq('category_id', categoryId)
    .in('id', updates.map((update) => update.id))
  if (error) throw new Error(`reorderMenuItems(select): ${error.message}`)
  if ((data?.length ?? 0) !== updates.length) {
    throw new Error('Danh sách món không hợp lệ')
  }

  for (const update of updates) {
    const { error: updateError } = await admin
      .from('menu_items')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id)
      .eq('store_id', storeId)
      .eq('category_id', categoryId)
    if (updateError) throw new Error(`reorderMenuItems(update): ${updateError.message}`)
  }

  revalidatePath('/admin/menu')
}

// Ngưỡng an toàn cho giá món — khớp MAX_PRICE của biến thể (lib/menu/variant.ts).
const MAX_ITEM_PRICE = 100_000_000

// Ô giá ở admin hiện số kiểu Việt Nam ("15.000") nên FormData gửi lên kèm dấu chấm.
// parseInt('15.000', 10) trả về 15 — giá món âm thầm còn 15 đồng. Bắt buộc đi qua
// parseVnd và ném lỗi rõ ràng thay vì để NaN/số sai chạm tới DB.
// Lỗi UNIQUE (23505) của mã món / tiền tố → câu báo dễ hiểu kèm tên đang dùng mã đó (PA-4).
async function friendlyUniqueError(admin: ReturnType<typeof createAdminClient>, storeId: string, kind: 'sku' | 'prefix', value: string): Promise<Error> {
  if (kind === 'sku') {
    const { data } = await admin.from('menu_items').select('name').eq('store_id', storeId).eq('sku', value).maybeSingle()
    return new Error(`Mã món đã dùng cho «${(data?.name as string | undefined) ?? value}»`)
  }
  const { data } = await admin.from('menu_categories').select('name').eq('store_id', storeId).eq('sku_prefix', value).maybeSingle()
  return new Error(`Tiền tố đã dùng cho danh mục «${(data?.name as string | undefined) ?? value}»`)
}

// Mã món (trống = DB tự sinh khi thêm / giữ mã cũ khi sửa) + nhãn món (PA-4).
function readSkuAndBadge(formData: FormData): { sku: string | null; badge: string | null } {
  const sku = parseManualSku((formData.get('sku') as string | null) ?? '')
  if (!sku.ok) throw new Error(sku.error)
  return { sku: sku.sku, badge: parseBadge(formData.get('badge')) }
}

function readPrefix(formData: FormData): string | null {
  const prefix = parsePrefix((formData.get('sku_prefix') as string | null) ?? '')
  if (!prefix.ok) throw new Error(prefix.error)
  return prefix.prefix
}

function readPrice(formData: FormData): number {
  const price = parseVnd(String(formData.get('price') ?? ''))
  if (price === null || price > MAX_ITEM_PRICE) {
    throw new Error('Giá món không hợp lệ — chỉ gồm chữ số, ví dụ 80000 hoặc 80.000')
  }
  return price
}

// Thêm món mới
export async function addMenuItem(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const categoryId = formData.get('category_id') as string
  await assertCategoryInStore(categoryId, storeId)
  const { sku, badge } = readSkuAndBadge(formData)
  const { data: maxRow } = await admin
    .from('menu_items')
    .select('sort_order')
    .eq('store_id', storeId)
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1
  const imageUrl = await uploadMenuImage(admin, storeId, formData.get('image') as File | null)
  const { data, error } = await admin.from('menu_items').insert({
    store_id: storeId,
    category_id: categoryId,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    price: readPrice(formData),
    image_url: imageUrl,
    is_available: true,
    sort_order: nextSort,
    badge,
    ...(sku ? { sku } : {}),
  }).select('id').single()
  if (error?.code === '23505' && sku) throw await friendlyUniqueError(admin, storeId, 'sku', sku)
  if (error) throw new Error(`addMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
  return data.id as string
}

// Sửa món — chỉ đổi ảnh khi có file mới gửi lên
export async function updateMenuItem(itemId: string, formData: FormData) {
  const storeId = await getStoreId() // xác thực user
  const admin = createAdminClient()
  const categoryId = formData.get('category_id') as string
  // Danh mục đích phải thuộc quán mình (vá 2026-10-08: trước đây chuyển được món sang danh mục quán khác).
  await assertCategoryInStore(categoryId, storeId)
  const { sku, badge } = readSkuAndBadge(formData)
  const imageUrl = await uploadMenuImage(admin, storeId, formData.get('image') as File | null)
  const patch: Record<string, unknown> = {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    price: readPrice(formData),
    category_id: categoryId,
    badge,
  }
  if (sku) patch.sku = sku // để trống thì GIỮ mã cũ (đổi danh mục không đổi mã)
  if (imageUrl) patch.image_url = imageUrl // không gửi ảnh mới thì giữ ảnh cũ
  // Lọc store_id (vá 2026-10-08): service key bỏ qua RLS, trước đây biết id là sửa được món quán khác.
  const { error } = await admin.from('menu_items').update(patch).eq('id', itemId).eq('store_id', storeId)
  if (error?.code === '23505' && sku) throw await friendlyUniqueError(admin, storeId, 'sku', sku)
  if (error) throw new Error(`updateMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá món
export async function deleteMenuItem(itemId: string) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { error } = await admin.from('menu_items').delete().eq('id', itemId).eq('store_id', storeId)
  if (error) throw new Error(`deleteMenuItem: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Thêm danh mục
export async function addCategory(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const prefix = readPrefix(formData) // trống → DB tự sinh từ tên (trigger mig 095)
  const { data: maxRow } = await admin
    .from('menu_categories')
    .select('sort_order')
    .eq('store_id', storeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1
  const { error } = await admin.from('menu_categories').insert({
    store_id: storeId,
    name: formData.get('name') as string,
    sort_order: nextSort,
    is_active: true,
    ...(prefix ? { sku_prefix: prefix } : {}),
  })
  if (error?.code === '23505' && prefix) throw await friendlyUniqueError(admin, storeId, 'prefix', prefix)
  if (error) throw new Error(`addCategory: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sửa tên danh mục
export async function updateCategory(categoryId: string, formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const prefix = readPrefix(formData) // trống → giữ tiền tố cũ; đổi tiền tố KHÔNG đổi mã các món cũ
  const { error } = await admin
    .from('menu_categories')
    .update({ name: formData.get('name') as string, ...(prefix ? { sku_prefix: prefix } : {}) })
    .eq('id', categoryId)
    .eq('store_id', storeId)
  if (error?.code === '23505' && prefix) throw await friendlyUniqueError(admin, storeId, 'prefix', prefix)
  if (error) throw new Error(`updateCategory: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá danh mục — chặn nếu còn món để tránh mất dữ liệu ngoài ý muốn
export async function deleteCategory(categoryId: string) {
  const storeId = await getStoreId()
  const admin = createAdminClient()
  const { count, error: countErr } = await admin
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId)
    .eq('store_id', storeId)
  if (countErr) throw new Error(`deleteCategory(count): ${countErr.message}`)
  if ((count ?? 0) > 0) {
    throw new Error('Danh mục còn món — hãy xoá hoặc chuyển hết món sang danh mục khác trước.')
  }
  const { error } = await admin.from('menu_categories').delete().eq('id', categoryId).eq('store_id', storeId)
  if (error) throw new Error(`deleteCategory: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Thêm biến thể (lựa chọn) cho món — giá TUYỆT ĐỐI, thay giá món
export async function addItemVariant(menuItemId: string, name: string, price: number) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  const { data: maxRow } = await admin.from('menu_item_variants').select('sort_order')
    .eq('menu_item_id', menuItemId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSort = (maxRow?.sort_order ?? -1) + 1
  const { error } = await admin.from('menu_item_variants').insert({
    menu_item_id: menuItemId, store_id: storeId, name: name.trim(),
    price: Math.max(0, Math.round(price)), is_available: true, sort_order: nextSort,
  })
  if (error) throw new Error(`addItemVariant: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sửa biến thể (tên/giá/tạm hết)
export async function updateItemVariant(variantId: string, patch: { name?: string; price?: number; is_available?: boolean }) {
  const storeId = await getStoreId()
  await assertVariantInStore(variantId, storeId)
  const admin = createAdminClient()
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.price !== undefined) update.price = Math.max(0, Math.round(patch.price))
  if (patch.is_available !== undefined) update.is_available = patch.is_available
  const { error } = await admin.from('menu_item_variants').update(update).eq('id', variantId)
  if (error) throw new Error(`updateItemVariant: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Xoá biến thể
export async function deleteItemVariant(variantId: string) {
  const storeId = await getStoreId()
  await assertVariantInStore(variantId, storeId)
  const admin = createAdminClient()
  const { error } = await admin.from('menu_item_variants').delete().eq('id', variantId)
  if (error) throw new Error(`deleteItemVariant: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Sắp xếp lại thứ tự biến thể trong 1 món
export async function reorderItemVariants(menuItemId: string, variantIds: string[]) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const updates = buildSortUpdates(variantIds)
  if (updates.length === 0) return

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_item_variants')
    .select('id')
    .eq('store_id', storeId)
    .eq('menu_item_id', menuItemId)
    .in('id', updates.map((update) => update.id))
  if (error) throw new Error(`reorderItemVariants(select): ${error.message}`)
  if ((data?.length ?? 0) !== updates.length) {
    throw new Error('Danh sách lựa chọn không hợp lệ')
  }

  for (const update of updates) {
    const { error: updateError } = await admin
      .from('menu_item_variants')
      .update({ sort_order: update.sort_order })
      .eq('id', update.id)
      .eq('store_id', storeId)
      .eq('menu_item_id', menuItemId)
    if (updateError) throw new Error(`reorderItemVariants(update): ${updateError.message}`)
  }

  revalidatePath('/admin/menu')
}

// Đổi tên nhóm biến thể hiển thị trên mini-app (rỗng → null = dùng nhãn mặc định)
export async function setVariantGroupName(menuItemId: string, groupName: string) {
  const storeId = await getStoreId()
  await assertMenuItemInStore(menuItemId, storeId)
  const admin = createAdminClient()
  const trimmed = groupName.trim()
  const { error } = await admin
    .from('menu_items')
    .update({ variant_group_name: trimmed === '' ? null : trimmed })
    .eq('id', menuItemId)
    .eq('store_id', storeId)
  if (error) throw new Error(`setVariantGroupName: ${error.message}`)
  revalidatePath('/admin/menu')
}

// Bật/tắt "Tạm hết" cho chủ quán VÀ thu ngân (PA-2). Đi qua RPC bằng phiên đăng nhập — KHÔNG dùng
// service key: RPC chỉ đổi is_available, thu ngân không có đường nào sửa giá/tên món.
export async function setMenuItemAvailable(itemId: string, isAvailable: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requirePosOperatorStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_menu_item_available', { p_item_id: itemId, p_available: isAvailable })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/menu')
  return { ok: true }
}
