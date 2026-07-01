// Supabase Edge Function — Ký MAC cho Zalo Checkout SDK Payment.createOrder
// Mini app gọi với { orderId }. Server TỰ đọc số tiền từ DB (không tin client),
// build body + ký MAC bằng secret CỦA ĐÚNG QUÁN (store_checkout_configs), trả về cho mini app.
// Secrets: ZALO_PAYMENT_METHOD (tuỳ chọn, mặc định ZALOPAY_SANDBOX) — secret ký MAC đọc từ DB.
// verify_jwt: true (mini app gửi anon JWT)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { orderId } = await req.json()
    if (!orderId) return json({ error: 'Thiếu orderId' }, 400)

    const methodId = Deno.env.get('ZALO_PAYMENT_METHOD') ?? 'ZALOPAY_SANDBOX'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Đọc đơn + món từ DB bằng service role — số tiền KHÔNG tin client gửi lên
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, store_id, total_amount, status, order_items(item_name, item_price, quantity)')
      .eq('id', orderId)
      .single()

    if (error || !order) return json({ error: 'Không tìm thấy đơn hàng' }, 404)
    if (order.status !== 'pending')
      return json({ error: 'Đơn không ở trạng thái chờ thanh toán' }, 409)

    // Secret ký MAC đọc theo QUÁN của đơn, không dùng biến môi trường toàn cục nữa
    const { data: config } = await supabase
      .from('store_checkout_configs')
      .select('zalo_checkout_secret_key, is_enabled')
      .eq('store_id', order.store_id)
      .single()

    if (!config || !config.is_enabled) {
      return json({ error: 'Quán chưa bật ZaloPay' }, 400)
    }
    const secret = config.zalo_checkout_secret_key as string

    const amount = order.total_amount as number
    const item = ((order.order_items ?? []) as Array<Record<string, unknown>>).map((it) => ({
      name: it.item_name,
      quantity: it.quantity,
      price: it.item_price,
    }))
    const desc = `MEVO - Don ${String(orderId).slice(-6).toUpperCase()}`
    const extradata = JSON.stringify({ orderId })
    const method = JSON.stringify({ id: methodId, isCustom: false })

    // MAC = HMAC-SHA256(secret, "key=value&..." với key sort a→z, object→JSON.stringify)
    const body: Record<string, unknown> = { amount, desc, extradata, item, method }
    const dataMac = Object.keys(body)
      .sort()
      .map((k) => `${k}=${typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]}`)
      .join('&')
    const mac = await hmacSHA256(secret, dataMac)

    // Trả đúng body để mini app truyền nguyên vào Payment.createOrder
    return json({ amount, desc, item, extradata, method, mac })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
