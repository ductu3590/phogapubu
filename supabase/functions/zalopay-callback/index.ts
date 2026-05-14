// Supabase Edge Function — Xử lý ZaloPay payment callback
// ZaloPay gọi endpoint này sau khi khách thanh toán thành công/thất bại
// Deploy: supabase functions deploy zalopay-callback
// Secrets: ZALOPAY_KEY2, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function hmacSHA256(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  try {
    const body = await req.json()
    const { data: dataStr, mac: receivedMac } = body

    const key2 = Deno.env.get('ZALOPAY_KEY2')!

    // Xác minh chữ ký MAC từ ZaloPay — bảo vệ endpoint khỏi giả mạo
    const expectedMac = await hmacSHA256(key2, dataStr)
    if (expectedMac !== receivedMac) {
      console.error('[zalopay-callback] MAC không khớp — bỏ qua request')
      return new Response(
        JSON.stringify({ return_code: -1, return_message: 'mac not equal' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const paymentData = JSON.parse(dataStr)
    const embedData = JSON.parse(paymentData.embed_data ?? '{}')
    const orderId = embedData.orderId

    if (!orderId) {
      console.error('[zalopay-callback] Thiếu orderId trong embed_data')
      return new Response(
        JSON.stringify({ return_code: -1, return_message: 'missing orderId' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Cập nhật đơn hàng: confirmed + lưu ZaloPay trans ID
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'confirmed',
        zalopay_trans_id: String(paymentData.zp_trans_id),
      })
      .eq('id', orderId)
      .eq('status', 'pending') // Chỉ update nếu vẫn đang pending (idempotent)

    if (updateError) {
      console.error('[zalopay-callback] Lỗi update đơn hàng:', updateError)
    } else {
      console.log(`[zalopay-callback] Đơn ${orderId} → confirmed, trans_id: ${paymentData.zp_trans_id}`)
    }

    // Trả về thành công cho ZaloPay (bắt buộc phải trả ngay)
    return new Response(
      JSON.stringify({ return_code: 1, return_message: 'success' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[zalopay-callback] Lỗi không xử lý được:', error)
    return new Response(
      JSON.stringify({ return_code: -1, return_message: String(error) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
