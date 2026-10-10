'use server'

// Server actions sinh / thu hồi token bếp. Chỉ chủ quán của đúng quán.
// Dùng service_role để đọc store + bump version (bỏ qua RLS), nhưng CHỈ sau khi
// đã xác thực caller là chủ quán của quán đó.
import { createAdminClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { signKitchenToken } from '@/lib/kitchen-token'

// Chỉ CHỦ QUÁN của ĐÚNG quán đó (vá 2026-10-08): bản cũ chỉ kiểm "có dòng mevo_operators" — nhân viên,
// thu ngân, tài khoản đã khoá hay chủ quán khác đều lấy được token bếp (đọc được đơn) của quán bất kỳ.
async function assertStoreOwnerOf(storeId: string): Promise<void> {
  const ownStoreId = await requireStoreOwnerStoreId()
  if (ownStoreId !== storeId) throw new Error('Chỉ chủ quán của quán này mới quản lý được link bếp')
}

type KitchenLink = { path: string }

// Sinh link bếp hiện tại (theo version đang lưu) cho 1 quán.
export async function generateKitchenLink(storeId: string): Promise<KitchenLink> {
  await assertStoreOwnerOf(storeId)
  const admin = createAdminClient()
  const { data: store, error } = await admin
    .from('stores')
    .select('slug, kitchen_token_version')
    .eq('id', storeId)
    .single()
  if (error || !store) throw new Error('Không tìm thấy quán')

  const token = await signKitchenToken(storeId, store.kitchen_token_version as number)
  return { path: `/kitchen/${store.slug}?k=${token}` }
}

// Thu hồi: bump version (token cũ chết ngay) rồi cấp link mới.
export async function revokeKitchenToken(storeId: string): Promise<KitchenLink> {
  await assertStoreOwnerOf(storeId)
  const admin = createAdminClient()
  const { data: store, error } = await admin
    .from('stores')
    .select('slug, kitchen_token_version')
    .eq('id', storeId)
    .single()
  if (error || !store) throw new Error('Không tìm thấy quán')

  const newVersion = ((store.kitchen_token_version as number) ?? 1) + 1
  const { error: upErr } = await admin
    .from('stores')
    .update({ kitchen_token_version: newVersion })
    .eq('id', storeId)
  if (upErr) throw new Error('Thu hồi thất bại')

  const token = await signKitchenToken(storeId, newVersion)
  return { path: `/kitchen/${store.slug}?k=${token}` }
}
