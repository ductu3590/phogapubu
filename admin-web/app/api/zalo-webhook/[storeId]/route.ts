// Webhook Zalo App (developers.zalo.me) — bắt buộc URL trên domain đã duyệt.
// Mỗi quán có 1 app Zalo riêng → mỗi quán đăng ký 1 URL webhook riêng dạng
// https://<domain>/api/zalo-webhook/<storeId> trên Zalo Developer Console của app đó.
// Nhận event "user.revoke.consent": khách rút đồng ý & yêu cầu xoá dữ liệu.
// Tài liệu: https://miniapp.zaloplatforms.com/documents/open-apis/open/revoke-and-remove-user-data/
//
// Bảo mật: header X-ZEvent-Signature = sha256( <value sort theo key A→Z, nối lại> + zalo_app_secret_key ).
// Secret đọc theo storeId trong URL (store_zalo_configs), KHÔNG dùng biến môi trường toàn cục nữa.

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

function expectedSignature(payload: Record<string, unknown>, apiKey: string): string {
  const content = Object.keys(payload)
    .sort()
    .map((k) => {
      const v = payload[k]
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
    })
    .join('')
  return createHash('sha256').update(`${content}${apiKey}`).digest('hex')
}

export async function GET() {
  return new Response('ok', { status: 200 })
}

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params
  try {
    const admin = createAdminClient()

    const { data: config } = await admin
      .from('store_zalo_configs')
      .select('zalo_app_secret_key, is_enabled')
      .eq('store_id', storeId)
      .maybeSingle()

    if (!config?.is_enabled || !config.zalo_app_secret_key) {
      console.error(`[zalo-webhook] quán ${storeId} chưa cấu hình secret — ack nhưng bỏ qua`)
      return new Response('ok', { status: 200 })
    }

    const raw = await request.text()
    const payload = JSON.parse(raw) as Record<string, unknown>

    const sig = request.headers.get('x-zevent-signature') ?? ''
    const valid = sig === expectedSignature(payload, config.zalo_app_secret_key)

    if (!valid) {
      console.error(`[zalo-webhook] chữ ký không khớp cho quán ${storeId} — ack nhưng bỏ qua xử lý`)
      return new Response('ok', { status: 200 })
    }

    if (payload.event === 'user.revoke.consent' && payload.userId) {
      // Chỉ gỡ zalo_user_id (định danh Zalo) trong phạm vi ĐÚNG quán này — KHÔNG null
      // customer_name/phone (ràng buộc chk_customer_info_required), không đụng quán khác.
      const { error } = await admin
        .from('orders')
        .update({ zalo_user_id: null })
        .eq('zalo_user_id', String(payload.userId))
        .eq('store_id', storeId)
      if (error) console.error('[zalo-webhook] gỡ dữ liệu lỗi:', error.message)
      else console.log(`[zalo-webhook] đã gỡ zalo_user_id cho user ${payload.userId} tại quán ${storeId}`)
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error(`[zalo-webhook] lỗi (quán ${storeId}):`, e)
    return new Response('ok', { status: 200 })
  }
}
