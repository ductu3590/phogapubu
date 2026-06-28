// Webhook Zalo App (developers.zalo.me) — bắt buộc URL trên domain đã duyệt (pubu.soccernow.net).
// Nhận event "user.revoke.consent": khách rút đồng ý & yêu cầu xoá dữ liệu.
// Tài liệu: https://miniapp.zaloplatforms.com/documents/open-apis/open/revoke-and-remove-user-data/
//
// Bảo mật: header X-ZEvent-Signature = sha256( <value sort theo key A→Z, nối lại> + ZALO_APP_SECRET_KEY ).
// Env (Vercel): ZALO_APP_SECRET_KEY (= Khóa bí mật của app Zalo), SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'

// Chữ ký Zalo: nối value các field theo thứ tự key A→Z, rồi + API Key, hash sha256 hex.
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

// Zalo ping bằng GET khi "Kiểm tra" — trả 200.
export async function GET() {
  return new Response('ok', { status: 200 })
}

export async function POST(request: Request) {
  try {
    const raw = await request.text()
    const payload = JSON.parse(raw) as Record<string, unknown>

    // Verify chữ ký — chỉ XỬ LÝ khi hợp lệ; luôn ack 200 để Zalo không báo lỗi setup/retry.
    const apiKey = process.env.ZALO_APP_SECRET_KEY ?? ''
    const sig = request.headers.get('x-zevent-signature') ?? ''
    const valid = !!apiKey && sig === expectedSignature(payload, apiKey)

    if (!valid) {
      console.error('[zalo-webhook] chữ ký không khớp — ack nhưng bỏ qua xử lý')
      return new Response('ok', { status: 200 })
    }

    if (payload.event === 'user.revoke.consent' && payload.userId) {
      const admin = createAdminClient()
      // Chỉ gỡ zalo_user_id (định danh Zalo) — KHÔNG null customer_name/phone vì ràng buộc
      // chk_customer_info_required của đơn mang về. Đơn vẫn giữ cho hồ sơ tài chính của quán.
      const { error } = await admin
        .from('orders')
        .update({ zalo_user_id: null })
        .eq('zalo_user_id', String(payload.userId))
      if (error) console.error('[zalo-webhook] gỡ dữ liệu lỗi:', error.message)
      else console.log(`[zalo-webhook] đã gỡ zalo_user_id cho user ${payload.userId}`)
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('[zalo-webhook] lỗi:', e)
    return new Response('ok', { status: 200 })
  }
}
