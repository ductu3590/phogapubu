'use server'

// Giảm giá theo món / danh mục (mig 115). Chỉ chủ quán, như sửa giá món.
// createAdminClient bỏ qua RLS (bảng menu_discounts không có policy ghi) → PHẢI tự kiểm quyền và
// lọc store_id ở mọi câu. Lỗi người dùng TRẢ {ok,error}, không ném: Next prod giấu nội dung lỗi ném.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/auth/operator'
import { parseDiscountInput, type DiscountInput } from '@/lib/menu/menu-discount'

export type DiscountActionResult = { ok: true } | { ok: false; error: string }

async function ownerContext(): Promise<{ storeId: string; userId: string }> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner') throw new Error('Chỉ chủ quán mới thao tác được ở đây')
  return { storeId: operator.storeId, userId: operator.userId }
}

function readInput(fd: FormData): DiscountInput {
  const s = (k: string) => String(fd.get(k) ?? '')
  return {
    discount_type: s('discount_type'),
    value: s('value'),
    name: s('name'),
    schedule: s('schedule'),
    starts_on: s('starts_on'),
    ends_on: s('ends_on'),
    time_from: s('time_from'),
    time_to: s('time_to'),
    days: fd.getAll('days').map(String),
  }
}

async function targetInStore(admin: ReturnType<typeof createAdminClient>, storeId: string, target: { menuItemId?: string | null; categoryId?: string | null }): Promise<boolean> {
  const table = target.menuItemId ? 'menu_items' : 'menu_categories'
  const id = target.menuItemId ?? target.categoryId
  if (!id) return false
  const { data } = await admin.from(table).select('id').eq('id', id).eq('store_id', storeId).maybeSingle()
  return Boolean(data)
}

export async function addMenuDiscount(
  target: { menuItemId?: string | null; categoryId?: string | null },
  fd: FormData,
): Promise<DiscountActionResult> {
  const { storeId, userId } = await ownerContext()
  if (Boolean(target.menuItemId) === Boolean(target.categoryId)) return { ok: false, error: 'Chọn món hoặc danh mục' }
  const parsed = parseDiscountInput(readInput(fd))
  if (!parsed.ok) return parsed
  const admin = createAdminClient()
  if (!(await targetInStore(admin, storeId, target))) return { ok: false, error: 'Món hoặc danh mục không thuộc quán của bạn' }
  const { error } = await admin.from('menu_discounts').insert({
    store_id: storeId,
    menu_item_id: target.menuItemId ?? null,
    category_id: target.categoryId ?? null,
    created_by: userId,
    ...parsed.values,
  })
  if (error) return { ok: false, error: `Không lưu được giảm giá: ${error.message}` }
  revalidatePath('/admin/menu')
  return { ok: true }
}

export async function updateMenuDiscount(discountId: string, fd: FormData): Promise<DiscountActionResult> {
  const { storeId } = await ownerContext()
  const parsed = parseDiscountInput(readInput(fd))
  if (!parsed.ok) return parsed
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_discounts')
    .update({ ...parsed.values, updated_at: new Date().toISOString() })
    .eq('id', discountId)
    .eq('store_id', storeId)
    .select('id')
  if (error) return { ok: false, error: `Không lưu được giảm giá: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, error: 'Không tìm thấy chương trình giảm giá' }
  revalidatePath('/admin/menu')
  return { ok: true }
}

export async function setMenuDiscountActive(discountId: string, isActive: boolean): Promise<DiscountActionResult> {
  const { storeId } = await ownerContext()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('menu_discounts')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', discountId)
    .eq('store_id', storeId)
    .select('id')
  if (error) return { ok: false, error: `Không đổi được trạng thái: ${error.message}` }
  if (!data || data.length === 0) return { ok: false, error: 'Không tìm thấy chương trình giảm giá' }
  revalidatePath('/admin/menu')
  return { ok: true }
}

// Xoá hẳn: đơn đã tạo vẫn giữ giá đã giảm (snapshot), chỉ mất liên kết menu_discount_id (ON DELETE SET NULL).
export async function deleteMenuDiscount(discountId: string): Promise<DiscountActionResult> {
  const { storeId } = await ownerContext()
  const admin = createAdminClient()
  const { error } = await admin.from('menu_discounts').delete().eq('id', discountId).eq('store_id', storeId)
  if (error) return { ok: false, error: `Không xoá được: ${error.message}` }
  revalidatePath('/admin/menu')
  return { ok: true }
}
