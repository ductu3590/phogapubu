// Supabase Edge Function — Tạo ZaloPay order
// Deploy: supabase functions deploy zalopay-create-order
// Secrets: ZALOPAY_APP_ID, ZALOPAY_KEY1, ZALOPAY_SANDBOX

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HMAC-SHA256 dùng Web Crypto API (Deno native)
async function hmacSHA256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId, amount } = await req.json()

    if (!orderId || !amount) {
      return new Response(
        JSON.stringify({ error: 'Thiếu orderId hoặc amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const appId = Deno.env.get('ZALOPAY_APP_ID')!
    const key1 = Deno.env.get('ZALOPAY_KEY1')!
    const isSandbox = Deno.env.get('ZALOPAY_SANDBOX') === 'true'

    const zalopayEndpoint = isSandbox
      ? 'https://sb-openapi.zalopay.vn/v2/create'
      : 'https://openapi.zalopay.vn/v2/create'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const callbackUrl = `${supabaseUrl}/functions/v1/zalopay-callback`

    // appTransId: YYMMDD_orderId (max 40 chars)
    const today = new Date().toISOString().slice(2, 10).replace(/-/g, '')
    const appTransId = `${today}_${orderId.replace(/-/g, '').slice(0, 22)}`
    const appTime = Date.now()

    const orderData: Record<string, unknown> = {
      app_id: Number(appId),
      app_trans_id: appTransId,
      app_user: 'mevo_customer',
      app_time: appTime,
      amount: amount,
      description: 'MEVO - Thanh toán đơn hàng',
      embed_data: JSON.stringify({ orderId }),
      item: '[]',
      callback_url: callbackUrl,
    }

    // MAC = HMAC-SHA256(key1, "app_id|app_trans_id|app_user|amount|app_time|embed_data|item")
    const macData = `${appId}|${appTransId}|${orderData.app_user}|${amount}|${appTime}|${orderData.embed_data}|${orderData.item}`
    orderData.mac = await hmacSHA256(key1, macData)

    const response = await fetch(zalopayEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    })

    const result = await response.json()

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
