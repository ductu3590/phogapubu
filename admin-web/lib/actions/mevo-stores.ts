'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/auth/operator'
import { revalidatePath } from 'next/cache'

async function requireSuperadmin() {
  const operator = await requireOperator()
  if (operator.role !== 'mevo_superadmin') throw new Error('Chỉ MEVO superadmin mới thao tác được ở đây')
}

// Tạo quán mới: row `stores` + config rỗng `store_app_configs`.
export async function createStore(formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()

  const name = (formData.get('name') as string).trim()
  const slug = (formData.get('slug') as string).trim()
  const phone = (formData.get('phone') as string | null)?.trim() || null
  const address = (formData.get('address') as string | null)?.trim() || null
  if (!name || !slug) throw new Error('Thiếu tên quán hoặc slug')

  const { data: store, error } = await admin
    .from('stores')
    .insert({ name, slug, phone, address, is_active: false })
    .select('id')
    .single()
  if (error) throw new Error(`createStore: ${error.message}`)

  const { error: cfgError } = await admin.from('store_app_configs').insert({ store_id: store.id })
  if (cfgError) throw new Error(`createStore(config): ${cfgError.message}`)

  revalidatePath('/mevo/stores')
  return store.id as string
}

// Sửa thông tin cơ bản quán
export async function updateStoreBasicInfo(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const patch = {
    name: (formData.get('name') as string).trim(),
    phone: (formData.get('phone') as string | null)?.trim() || null,
    address: (formData.get('address') as string | null)?.trim() || null,
    zalo_oa_id: (formData.get('zalo_oa_id') as string | null)?.trim() || null,
    is_active: formData.get('is_active') === 'on',
  }
  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) throw new Error(`updateStoreBasicInfo: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Cập nhật app config công khai (không bí mật)
export async function updateAppConfig(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const patch = {
    zalo_mini_app_name: (formData.get('zalo_mini_app_name') as string | null)?.trim() || null,
    onboarding_status: formData.get('onboarding_status') as string,
    deployment_status: formData.get('deployment_status') as string,
    notes: (formData.get('notes') as string | null)?.trim() || null,
  }
  const { error } = await admin.from('store_app_configs').upsert({ store_id: storeId, ...patch })
  if (error) throw new Error(`updateAppConfig: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Ghi/cập nhật secret Checkout — KHÔNG BAO GIỜ trả lại secret cho client.
export async function updateCheckoutConfig(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const zaloMiniAppId = (formData.get('zalo_mini_app_id') as string).trim()
  const secret = (formData.get('zalo_checkout_secret_key') as string | null)?.trim()
  if (!zaloMiniAppId) throw new Error('Thiếu Zalo Mini App ID')

  const { data: existing } = await admin
    .from('store_checkout_configs')
    .select('zalo_checkout_secret_key')
    .eq('store_id', storeId)
    .maybeSingle()

  if (!existing && !secret) throw new Error('Thiếu Checkout Secret Key cho lần cấu hình đầu tiên')

  const patch: Record<string, unknown> = { store_id: storeId, zalo_mini_app_id: zaloMiniAppId, is_enabled: true }
  patch.zalo_checkout_secret_key = secret || existing?.zalo_checkout_secret_key // chỉ ghi đè khi operator nhập giá trị mới

  const { error } = await admin.from('store_checkout_configs').upsert(patch)
  if (error) throw new Error(`updateCheckoutConfig: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Ghi/cập nhật secret Zalo OA/webhook — KHÔNG BAO GIỜ trả lại secret cho client.
export async function updateZaloConfig(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const oaAccessToken = (formData.get('zalo_oa_access_token') as string | null)?.trim()
  const appSecretKey = (formData.get('zalo_app_secret_key') as string | null)?.trim()

  const patch: Record<string, unknown> = { store_id: storeId, is_enabled: true }
  if (oaAccessToken) patch.zalo_oa_access_token = oaAccessToken
  if (appSecretKey) patch.zalo_app_secret_key = appSecretKey

  const { error } = await admin.from('store_zalo_configs').upsert(patch)
  if (error) throw new Error(`updateZaloConfig: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

// Gán tài khoản chủ quán: tạo Supabase Auth user nếu chưa có (email chưa tồn tại) rồi
// upsert vào mevo_operators với role store_owner. Trả về mật khẩu tạm SINH RA (chỉ 1 lần,
// không lưu lại được sau đó) để superadmin gửi cho chủ quán.
export async function assignStoreOwner(storeId: string, formData: FormData) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const email = (formData.get('email') as string).trim().toLowerCase()
  if (!email) throw new Error('Thiếu email')

  const { data: existingList, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) throw new Error(`assignStoreOwner(list): ${listErr.message}`)
  const existing = existingList.users.find((u) => u.email?.toLowerCase() === email)

  let userId: string
  let tempPassword: string | null = null
  if (existing) {
    userId = existing.id
  } else {
    tempPassword = crypto.randomUUID().slice(0, 12)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createErr || !created.user) throw new Error(`assignStoreOwner(create): ${createErr?.message}`)
    userId = created.user.id
  }

  const { error: opError } = await admin
    .from('mevo_operators')
    .upsert({ user_id: userId, store_id: storeId, role: 'store_owner' })
  if (opError) throw new Error(`assignStoreOwner(operator): ${opError.message}`)

  revalidatePath(`/mevo/stores/${storeId}`)
  return { email, tempPassword }
}
