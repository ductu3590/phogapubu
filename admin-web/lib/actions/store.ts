'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Dùng chung bucket ảnh với menu (public read, service-role ghi)
const ASSET_BUCKET = 'menu-images'

// storeId của operator hiện tại (xác thực + chống đổi quán khác)
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

// Cập nhật cài đặt quán: tên + logo (logo crop sẵn 1:1 từ client)
export async function updateStoreSettings(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()

  const patch: Record<string, unknown> = { name: formData.get('name') as string }

  const logo = formData.get('logo') as File | null
  if (logo && logo.size > 0) {
    const ext = logo.type === 'image/png' ? 'png' : logo.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${storeId}/logo-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(ASSET_BUCKET)
      .upload(path, logo, { contentType: logo.type || 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`upload logo: ${upErr.message}`)
    patch.logo_url = admin.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
  }

  // zalo_oa_url — tuỳ chọn, để rỗng nếu không điền
  const oaUrl = (formData.get('zalo_oa_url') as string | null)?.trim()
  if (oaUrl) patch.zalo_oa_url = oaUrl
  else patch.zalo_oa_url = null

  // address, phone, about_text — optional, set null nếu rỗng
  const address = (formData.get('address') as string | null)?.trim()
  patch.address = address || null

  const phone = (formData.get('phone') as string | null)?.trim()
  patch.phone = phone || null

  const aboutText = (formData.get('about_text') as string | null)?.trim()
  patch.about_text = aboutText || null

  // banner — upload file nếu có (tương tự logo)
  const banner = formData.get('banner') as File | null
  if (banner && banner.size > 0) {
    const ext = banner.type === 'image/png' ? 'png' : banner.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${storeId}/banner-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await admin.storage
      .from(ASSET_BUCKET)
      .upload(path, banner, { contentType: banner.type || 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`upload banner: ${upErr.message}`)
    patch.takeaway_banner_url = admin.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
  }

  // payment_methods — ít nhất 1 phương thức (luôn validate, không bỏ qua khi rỗng)
  const rawMethods = formData.getAll('payment_methods') as string[]
  const valid = rawMethods.filter((m) => m === 'zalopay' || m === 'cash')
  if (valid.length === 0) throw new Error('Phải chọn ít nhất 1 phương thức thanh toán')
  patch.payment_methods = valid

  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) throw new Error(`updateStoreSettings: ${error.message}`)
  revalidatePath('/admin/settings')
}
