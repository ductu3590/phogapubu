// Supabase Edge Function — Notify webhook của Zalo Checkout SDK
// Zalo gọi sau khi thanh toán xong (cả thành công lẫn thất bại).
// Secrets: ZALO_CHECKOUT_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
    const secret = Deno.env.get('ZALO_CHECKOUT_SECRET_KEY')!

    // Verify MAC theo template CỐ ĐỊNH của Zalo (KHÔNG sort)
    const macStr =
      `appId=${data.appId}&amount=${data.amount}&description=${data.description}` +
      `&orderId=${data.orderId}&message=${data.message}` +
      `&resultCode=${data.resultCode}&transId=${data.transId}`
    const expected = await hmacSHA256(secret, macStr)
    if (expected !== mac) {
      console.error('[checkout-notify] MAC không khớp')
      return resp(-1, 'invalid mac')
    }

    // Lấy orderId CỦA MÌNH từ extradata (đã encodeURIComponent), KHÔNG dùng data.orderId (id của Zalo)
    let appOrderId: string | undefined
    try {
      const ed = JSON.parse(decodeURIComponent(data.extradata ?? '%7B%7D'))
      appOrderId = ed.orderId
    } catch (_) {
      /* ignore */
    }
    if (!appOrderId) return resp(-1, 'missing orderId in extradata')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Thanh toán thất bại → KHÔNG đụng đơn (để nguyên pending).
    // Client sẽ hỏi khách: chuyển tiền mặt (abandon_zalopay_to_cash) hay thử lại.
    if (Number(data.resultCode) !== 1) {
      return resp(1, 'payment failed acknowledged')
    }

    // Đối chiếu số tiền với DB — chống giả mạo amount
    const { data: order } = await supabase
      .from('orders')
      .select('id, total_amount, status')
      .eq('id', appOrderId)
      .single()
    if (!order) return resp(-1, 'order not found')
    if (Number(data.amount) !== Number(order.total_amount)) {
      console.error('[checkout-notify] amount không khớp', data.amount, order.total_amount)
      return resp(-1, 'amount mismatch')
    }

    // Xác nhận đơn (idempotent: chỉ update nếu vẫn pending)
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
