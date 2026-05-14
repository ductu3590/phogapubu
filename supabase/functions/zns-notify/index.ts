// Supabase Edge Function — Gửi ZNS thông báo cho khách qua Zalo OA
// Trigger: khi order status chuyển sang 'ready' (bếp xong)
// Deploy: supabase functions deploy zns-notify
// Secrets: ZALO_OA_ACCESS_TOKEN

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotifyRequest {
  orderId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orderId } = (await req.json()) as NotifyRequest

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: 'Thiếu orderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Lấy thông tin đơn + bàn + quán
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, zalo_user_id, total_amount, note, tables(table_number), stores(name, zalo_oa_id)')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return new Response(
        JSON.stringify({ error: 'Không tìm thấy đơn hàng' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const zaloUserId = order.zalo_user_id
    const oaAccessToken = Deno.env.get('ZALO_OA_ACCESS_TOKEN')

    // Nếu không có Zalo user ID hoặc OA token thì skip (không báo lỗi)
    if (!zaloUserId || !oaAccessToken) {
      console.log(`[zns-notify] Bỏ qua — thiếu zalo_user_id hoặc OA token cho đơn ${orderId}`)
      return new Response(
        JSON.stringify({ skipped: true, reason: 'missing zalo_user_id or OA token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const store = order.stores as { name: string; zalo_oa_id: string } | null
    const table = order.tables as { table_number: string } | null
    const orderShortId = orderId.slice(-6).toUpperCase()

    // Gửi tin nhắn Zalo OA (message API — không cần ZNS template đăng ký)
    // Dùng Zalo OA Message API gửi text message đến follower
    const messagePayload = {
      recipient: { user_id: zaloUserId },
      message: {
        text: `🍜 Món của bạn đã xong!\n${store?.name || 'MEVO'} — ${table?.table_number || 'Bàn'}\nĐơn #${orderShortId}\n\nNhân viên đang mang ra cho bạn. Cảm ơn bạn đã chờ!`,
      },
    }

    const zaloResponse = await fetch('https://openapi.zalo.me/v2.0/oa/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: oaAccessToken,
      },
      body: JSON.stringify(messagePayload),
    })

    const zaloResult = await zaloResponse.json()
    console.log(`[zns-notify] Zalo OA response cho đơn ${orderId}:`, JSON.stringify(zaloResult))

    return new Response(
      JSON.stringify({ success: true, zalo: zaloResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[zns-notify] Lỗi:', error)
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
