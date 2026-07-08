// Supabase Edge Function — Notify webhook của Zalo Checkout SDK
// Xử lý 2 loại callback (phân biệt bằng sự hiện diện của resultCode):
//  1) Ví ZaloPay: payload có resultCode/amount/transId; verify `mac` theo template CỐ ĐỊNH.
//  2) Chuyển khoản ngân hàng / method tuỳ chỉnh (method="BANK"): payload chỉ có
//     {appId, method, orderId, extradata}, KHÔNG có amount/resultCode/transId. Verify
//     `overallMac` = HMAC(secret, các field của `data` sort a→z, nối "key=value&...").
//     MAC hợp lệ nghĩa là khách ĐÃ HOÀN TẤT bước chuyển khoản — Zalo không giữ tiền nên
//     không có resultCode; tiền về thẳng TK quán, quán tự đối chiếu (quyết định Option A).
// Secret verify đọc theo QUÁN (store_checkout_configs), map bằng data.appId TRƯỚC khi verify.
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

// Lấy app orderId (id đơn của MEVO) từ extradata đã URL-encode
function parseAppOrderId(extradata: unknown): string | undefined {
  try {
    const ed = JSON.parse(decodeURIComponent(String(extradata ?? '%7B%7D')))
    return ed.orderId
  } catch (_) {
    return undefined
  }
}

serve(async (req) => {
  try {
    const body = await req.json()
    const { data, mac, overallMac } = body

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
    const { data: config, error: configError } = await supabase
      .from('store_checkout_configs')
      .select('store_id, zalo_checkout_secret_key, is_enabled')
      .eq('zalo_mini_app_id', appId)
      .single()

    if (!config || !config.is_enabled) {
      console.error('[checkout-notify] appId không khớp quán nào:', appId, configError?.message)
      return resp(-1, 'unknown app')
    }
    const secret = config.zalo_checkout_secret_key as string

    // 3. Phân loại callback: ví ZaloPay LUÔN có resultCode; chuyển khoản/method tuỳ chỉnh thì KHÔNG.
    const isCustomMethod = data?.resultCode == null

    if (isCustomMethod) {
      // === CHUYỂN KHOẢN NGÂN HÀNG / method tuỳ chỉnh ===
      // overallMac = HMAC(secret, các field của `data` sort a→z, nối "key=value&...")
      const macStr = Object.keys(data)
        .sort()
        .map((k) => `${k}=${data[k]}`)
        .join('&')
      const expected = await hmacSHA256(secret, macStr)
      if (!overallMac || expected !== overallMac) {
        console.error('[checkout-notify] BANK overallMac không khớp')
        return resp(-1, 'invalid mac')
      }

      const appOrderId = parseAppOrderId(data.extradata)
      if (!appOrderId) return resp(-1, 'missing orderId in extradata')

      // MAC hợp lệ = khách đã hoàn tất chuyển khoản → confirm đơn.
      // Payload KHÔNG có amount nên không đối chiếu số tiền; store_id + MAC (theo secret quán) đã bảo vệ.
      // Lưu orderId của Zalo vào zalopay_trans_id để tính doanh thu (đơn có tiền thật).
      const zaloRef = data.orderId ? `BANK:${data.orderId}` : `BANK:${appOrderId}`
      const { error } = await supabase
        .from('orders')
        .update({ status: 'confirmed', zalopay_trans_id: zaloRef })
        .eq('id', appOrderId)
        .eq('store_id', config.store_id)
        .eq('status', 'pending')
      if (error) {
        console.error('[checkout-notify] BANK update lỗi:', error)
        return resp(-1, 'update failed')
      }

      console.log(`[checkout-notify] BANK đơn ${appOrderId} → confirmed, ref ${zaloRef}`)
      return resp(1, 'success')
    }

    // === VÍ ZALOPAY (logic cũ, giữ nguyên) ===
    // Verify MAC theo template CỐ ĐỊNH của Zalo (KHÔNG sort), bằng secret của ĐÚNG quán
    const macStr =
      `appId=${data.appId}&amount=${data.amount}&description=${data.description}` +
      `&orderId=${data.orderId}&message=${data.message}` +
      `&resultCode=${data.resultCode}&transId=${data.transId}`
    const expected = await hmacSHA256(secret, macStr)
    if (expected !== mac) {
      console.error('[checkout-notify] MAC không khớp')
      return resp(-1, 'invalid mac')
    }

    const appOrderId = parseAppOrderId(data.extradata)
    if (!appOrderId) return resp(-1, 'missing orderId in extradata')

    // Check resultCode NGAY sau khi có appOrderId, TRƯỚC khi query order/store/amount —
    // thanh toán thất bại thì ack luôn, tránh biến failed callback thành retry loop.
    if (Number(data.resultCode) !== 1) {
      console.log(`[checkout-notify] payment failed, order=${appOrderId}, appId=${appId}`)
      return resp(1, 'payment failed acknowledged')
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, store_id, total_amount, status')
      .eq('id', appOrderId)
      .single()
    if (!order) {
      console.error('[checkout-notify] order not found:', appOrderId, orderError?.message)
      return resp(-1, 'order not found')
    }

    // Đối chiếu quán suy ra từ appId khớp với quán thật của order
    if (order.store_id !== config.store_id) {
      console.error(
        `[checkout-notify] store mismatch: order.store_id=${order.store_id} config.store_id=${config.store_id}`,
      )
      return resp(-1, 'store mismatch')
    }

    // Đối chiếu số tiền với DB — chống giả mạo amount
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
