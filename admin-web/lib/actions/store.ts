'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { normalizeMapsUrl } from '@/lib/maps-url'
import { parseBellStyle, type BellStyle } from '@/lib/bell-settings'

// Dùng chung bucket ảnh với menu (public read, service-role ghi)
const ASSET_BUCKET = 'menu-images'

// storeId của operator hiện tại (xác thực + chống đổi quán khác)
async function getStoreId(): Promise<string> {
  return requireStoreOwnerStoreId()
}

// Cập nhật cài đặt quán: tên + logo (logo crop sẵn 1:1 từ client)
export async function updateStoreSettings(formData: FormData) {
  const storeId = await getStoreId()
  const admin = createAdminClient()

  const patch: Record<string, unknown> = { name: formData.get('name') as string }

  // google_maps_url (mig 090) — kiểm TRƯỚC khi tải ảnh lên để link sai không để lại ảnh mồ côi.
  // Form không gửi ô này (form cũ) thì giữ nguyên link đang có, không xoá.
  if (formData.has('google_maps_url')) {
    const maps = normalizeMapsUrl(formData.get('google_maps_url') as string | null)
    if (!maps.ok) throw new Error(maps.error)
    patch.google_maps_url = maps.value
  }

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

  // terms_of_use — điều khoản sử dụng (Markdown), optional; rỗng = null (mini-app dùng mẫu mặc định)
  const termsOfUse = (formData.get('terms_of_use') as string | null)?.trim()
  patch.terms_of_use = termsOfUse || null

  // wifi_name, wifi_password — optional; tên rỗng thì coi như tắt hiển thị wifi
  const wifiName = (formData.get('wifi_name') as string | null)?.trim()
  const wifiPassword = (formData.get('wifi_password') as string | null)?.trim()
  patch.wifi_name = wifiName || null
  patch.wifi_password = wifiPassword || null

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
  } else if (formData.get('remove_banner')) {
    // Xoá banner: chỉ áp dụng khi không upload ảnh mới
    patch.takeaway_banner_url = null
  }

  // delivery_area_note — text hiển thị, optional
  const deliveryNote = (formData.get('delivery_area_note') as string | null)?.trim()
  patch.delivery_area_note = deliveryNote || null

  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) throw new Error(`updateStoreSettings: ${error.message}`)
  revalidatePath('/admin/settings')
}

// Kiểu chuông báo của quán (PA-1). Chỉ chủ quán; giá trị lạ bị chặn ở đây lẫn CHECK của DB.
export async function saveBellStyle(style: BellStyle): Promise<{ ok: true } | { ok: false; error: string }> {
  const storeId = await getStoreId()
  if (parseBellStyle(style) !== style) return { ok: false, error: 'Kiểu chuông không hợp lệ' }
  const { error } = await createAdminClient().from('stores').update({ bell_style: style }).eq('id', storeId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin', 'layout')
  return { ok: true }
}
