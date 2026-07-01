// Supabase Edge Function — Notify webhook của Zalo Checkout SDK
// Zalo gọi sau khi thanh toán xong (cả thành công lẫn thất bại).
// Secret ký/verify MAC đọc theo QUÁN (store_checkout_configs), map bằng data.appId TRƯỚC
// khi verify MAC — không tin bất kỳ field nào của callback trước khi xác định đúng quán.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// verify_jwt: FALSE (Zalo không gửi JWT — bảo mật bằng MAC)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function hmacSHA256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function resp(returnCode: number, returnMessage: string) {
  return new Response(JSON.stringify({ returnCode, returnMessage }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  try {
    const body = await req.json()
    const { data, mac } = body

    // 1. Chặn sớm nếu thiếu appId — không đi tiếp, không đụng DB
    const appId = data?.appId ? String(data.appId) : ''
    if (!appId) {
      console.error('[checkout-notify] thiếu appId trong callback')
      return resp(-1, 'unknown app')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2. Map appId → đúng quán TRƯỚC khi verify MAC
    const { data: config } = await supabase
      .from('store_checkout_configs')
      .select('store_id, zalo_checkout_secret_key, is_enabled')
      .eq('zalo_mini_app_id', appId)
      .single()

    if (!config || !config.is_enabled) {
      console.error('[checkout-notify] appId không khớp quán nào:', appId)
      return resp(-1, 'unknown app')
    }
    const secret = config.zalo_checkout_secret_key as string

    // 3. Verify MAC theo template CỐ ĐỊNH của Zalo (KHÔNG sort), bằng secret của ĐÚNG quán
    const macStr =
      `appId=${data.appId}&amount=${data.amount}&description=${data.description}` +
      `&orderId=${data.orderId}&message=${data.message}` +
      `&resultCode=${data.resultCode}&transId=${data.transId}`
    const expected = await hmacSHA256(secret, macStr)
    if (expected !== mac) {
      console.error('[checkout-notify] MAC không khớp')
      return resp(-1, 'invalid mac')
    }

    // 4. Chỉ sau khi MAC hợp lệ mới parse extradata
    let appOrderId: string | undefined
    try {
      const ed = JSON.parse(decodeURIComponent(data.extradata ?? '%7B%7D'))
      appOrderId = ed.orderId
    } catch (_) {
      /* ignore */
    }
    if (!appOrderId) return resp(-1, 'missing orderId in extradata')

    // 5. Check resultCode NGAY sau khi có appOrderId, TRƯỚC khi query order/store/amount —
    //    thanh toán thất bại thì ack luôn, không cần order còn tồn tại hay không, tránh
    //    biến failed callback thành retry loop nếu order đã bị xoá hoặc dữ liệu lệch.
    if (Number(data.resultCode) !== 1) {
      console.log(`[checkout-notify] payment failed, order=${appOrderId}, appId=${appId}`)
      return resp(1, 'payment failed acknowledged')
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, store_id, total_amount, status')
      .eq('id', appOrderId)
      .single()
    if (!order) return resp(-1, 'order not found')

    // 6. Đối chiếu quán suy ra từ appId khớp với quán thật của order
    if (order.store_id !== config.store_id) {
      console.error(
        `[checkout-notify] store mismatch: order.store_id=${order.store_id} config.store_id=${config.store_id}`,
      )
      return resp(-1, 'store mismatch')
    }

    // 7. Đối chiếu số tiền với DB — chống giả mạo amount
    if (Number(data.amount) !== Number(order.total_amount)) {
      console.error('[checkout-notify] amount không khớp', data.amount, order.total_amount)
      return resp(-1, 'amount mismatch')
    }

    // 8. Xác nhận đơn (idempotent: chỉ update nếu vẫn pending)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'confirmed', zalopay_trans_id: String(data.transId) })
      .eq('id', appOrderId)
      .eq('status', 'pending')
    if (error) {
      console.error('[checkout-notify] update lỗi:', error)
      return resp(-1, 'update failed')
    }

    console.log(`[checkout-notify] Đơn ${appOrderId} → confirmed, transId ${data.transId}`)
    return resp(1, 'success')
  } catch (e) {
    console.error('[checkout-notify] lỗi:', e)
    return resp(-1, String(e))
  }
})
