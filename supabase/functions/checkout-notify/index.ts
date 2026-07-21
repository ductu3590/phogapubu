// Supabase Edge Function — Notify webhook của Zalo Checkout SDK
// Xử lý 2 loại callback (phân biệt bằng sự hiện diện của resultCode):
//  1) Ví ZaloPay: payload có resultCode/amount/transId; verify `mac` theo template CỐ ĐỊNH.
//  2) Chuyển khoản ngân hàng (method="BANK"): payload chỉ có {appId, method, orderId, extradata},
//     KHÔNG có amount/resultCode/transId. Verify `overallMac` = HMAC(secret, các field của
//     `data` sort a→z, nối "key=value&...").
// ⚠️ PM-1 (spec §1): Notify BANK KHÔNG phải bằng chứng trả tiền — chỉ là "khách vừa CHỌN / sang
//     app ngân hàng". Nên nhánh BANK CHỈ set bank_handoff_at (không confirm, không doanh thu);
//     xác nhận tiền đến từ bếp/SePay sau. Quyết định mutation nằm ở ./decide.ts (thuần, có test).
// Secret verify đọc theo QUÁN (store_checkout_configs), map bằng data.appId TRƯỚC khi verify.
// verify_jwt: FALSE (Zalo không gửi JWT — bảo mật bằng MAC)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decideNotify } from './decide.ts'

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

    // 3. Verify MAC theo loại payload (ví: template cố định; BANK/custom: overallMac sort a→z)
    const isCustomMethod = data?.resultCode == null
    if (isCustomMethod) {
      const macStr = Object.keys(data)
        .sort()
        .map((k) => `${k}=${data[k]}`)
        .join('&')
      const expected = await hmacSHA256(secret, macStr)
      if (!overallMac || expected !== overallMac) {
        console.error('[checkout-notify] BANK overallMac không khớp')
        return resp(-1, 'invalid mac')
      }
    } else {
      const macStr =
        `appId=${data.appId}&amount=${data.amount}&description=${data.description}` +
        `&orderId=${data.orderId}&message=${data.message}` +
        `&resultCode=${data.resultCode}&transId=${data.transId}`
      const expected = await hmacSHA256(secret, macStr)
      if (expected !== mac) {
        console.error('[checkout-notify] MAC không khớp')
        return resp(-1, 'invalid mac')
      }
    }

    // 4. Xác định đơn
    const appOrderId = parseAppOrderId(data.extradata)
    if (!appOrderId) return resp(-1, 'missing orderId in extradata')

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, store_id, total_amount, status, payment_received_at, bank_handoff_at')
      .eq('id', appOrderId)
      .single()
    if (!order) {
      // Notify BANK có thể tới trước khi đơn tồn tại (race) → ack, không tạo đơn ma (§10)
      console.error('[checkout-notify] order not found:', appOrderId, orderError?.message)
      return resp(1, 'order not found acknowledged')
    }

    // Đối chiếu quán suy ra từ appId khớp với quán thật của order
    if (order.store_id !== config.store_id) {
      console.error(
        `[checkout-notify] store mismatch: order.store_id=${order.store_id} config.store_id=${config.store_id}`,
      )
      return resp(-1, 'store mismatch')
    }

    // 5. Quyết định mutation (logic thuần, có test — ./decide.ts)
    const decision = decideNotify(data, order, new Date().toISOString())
    if (decision.action === 'ignore') {
      console.log(`[checkout-notify] ignore order=${appOrderId}: ${decision.reason}`)
      return resp(1, decision.reason)
    }
    if (decision.action === 'reject') {
      console.error(`[checkout-notify] reject order=${appOrderId}: ${decision.reason}`)
      return resp(-1, decision.reason)
    }

    // Guard trạng thái ngay trong UPDATE (idempotent + chống ghi đè): chỉ đơn còn pending, chưa nhận tiền
    const { data: updated, error } = await supabase
      .from('orders')
      .update(decision.patch)
      .eq('id', appOrderId)
      .eq('store_id', config.store_id)
      .eq('status', 'pending')
      .is('payment_received_at', null)
      .select('id')
    if (error) {
      console.error('[checkout-notify] update lỗi:', error)
      return resp(-1, 'update failed')
    }
    if (!updated || updated.length === 0) {
      // Đơn đã đổi trạng thái giữa lúc đọc và ghi (đua) → coi như đã xử lý, không lỗi
      console.log(`[checkout-notify] no-op (đơn đã đổi trạng thái) order=${appOrderId}`)
      return resp(1, 'already processed')
    }

    console.log(`[checkout-notify] ${decision.action} order=${appOrderId}`)
    return resp(1, 'success')
  } catch (e) {
    console.error('[checkout-notify] lỗi:', e)
    return resp(-1, String(e))
  }
})
