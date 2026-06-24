'use server'

// Server actions sinh / thu hồi token bếp. Gated bởi operator.
// Dùng service_role để đọc store + bump version (bỏ qua RLS), nhưng CHỈ sau khi
// đã xác thực caller là operator.
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { signKitchenToken } from '@/lib/kitchen-token'

async function assertOperator(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Chưa đăng nhập')

  const { data: op } = await supabase
    .from('mevo_operators')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!op) throw new Error('Không có quyền vận hành')
}

type KitchenLink = { path: string }

// Sinh link bếp hiện tại (theo version đang lưu) cho 1 quán.
export async function generateKitchenLink(storeId: string): Promise<KitchenLink> {
  await assertOperator()
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
  await assertOperator()
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
