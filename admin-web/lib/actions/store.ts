'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'

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

  // is_accepting_orders — công tắc tạm nghỉ
  patch.is_accepting_orders = formData.get('is_accepting_orders') === '1'

  // serving_hours — mảng ca [{open,close}]; validate định dạng HH:mm, bỏ ca hỏng
  const rawHours = (formData.get('serving_hours') as string | null) ?? '[]'
  let shifts: { open: string; close: string }[] = []
  try {
    const parsed = JSON.parse(rawHours)
    if (Array.isArray(parsed)) {
      const isHHmm = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)
      shifts = parsed
        .filter((s) => s && isHHmm(s.open) && isHHmm(s.close))
        .map((s) => ({ open: s.open, close: s.close }))
    }
  } catch {
    shifts = []
  }
  patch.serving_hours = shifts

  // delivery_area_note — text hiển thị, optional
  const deliveryNote = (formData.get('delivery_area_note') as string | null)?.trim()
  patch.delivery_area_note = deliveryNote || null

  // ── Khối "Quy trình vận hành" (mig 039, spec §2.3) ────────────────────────
  // order_flow quyết định cả payment_methods bên dưới nên phải đọc TRƯỚC.
  const orderFlow = formData.get('order_flow') === 'postpay' ? 'postpay' : 'prepay'

  // Đổi quy trình khi còn bàn chưa thanh toán = đơn nửa phiên treo giữa hai luật (§2.1).
  // Chặn ở server, không chỉ ẩn nút ở client.
  const { data: currentStore, error: readErr } = await admin
    .from('stores')
    .select('order_flow')
    .eq('id', storeId)
    .single()
  if (readErr) throw new Error(`updateStoreSettings(read): ${readErr.message}`)

  if (currentStore && currentStore.order_flow !== orderFlow) {
    const { count, error: sessErr } = await admin
      .from('table_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .is('closed_at', null)
    if (sessErr) throw new Error(`updateStoreSettings(sessions): ${sessErr.message}`)
    if ((count ?? 0) > 0) {
      throw new Error(
        `Còn ${count} bàn chưa thanh toán. Thu tiền hoặc đóng hết các bàn đang mở rồi mới đổi quy trình được.`,
      )
    }
  }

  patch.order_flow = orderFlow
  // Chỉ có nghĩa ở prepay; ở postpay không đơn nào chờ tiền để vào bếp nên luôn ép false
  // (tránh để lại giá trị cũ gây hiểu nhầm khi quán đổi qua đổi lại).
  patch.staff_order_needs_payment =
    orderFlow === 'prepay' && formData.get('staff_order_needs_payment') === '1'
  patch.kitchen_auto_print = formData.get('kitchen_auto_print') === '1'
  patch.printer_paper_width = formData.get('printer_paper_width') === '58' ? '58' : '80'

  // payment_methods — ít nhất 1 phương thức (luôn validate, không bỏ qua khi rỗng)
  if (orderFlow === 'postpay') {
    // Quán postpay chỉ có một kênh duy nhất: thu tại quầy cuối bữa. Phải set ở đây vì
    // create_order (mig 037) chặn phương thức không nằm trong stores.payment_methods —
    // quên là mọi đơn Bảo Lương bị từ chối ngay ở server.
    patch.payment_methods = ['counter']
  } else {
    const rawMethods = formData.getAll('payment_methods') as string[]
    const valid = rawMethods.filter((m) => m === 'zalo_checkout' || m === 'cash')
    if (valid.length === 0) throw new Error('Phải chọn ít nhất 1 phương thức thanh toán')
    patch.payment_methods = valid
  }

  const { error } = await admin.from('stores').update(patch).eq('id', storeId)
  if (error) throw new Error(`updateStoreSettings: ${error.message}`)
  revalidatePath('/admin/settings')
}
