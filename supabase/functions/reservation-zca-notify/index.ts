import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleReservationZcaNotify } from './handler.ts'

serve(async (req) => {
  try {
    const body = await req.json()
    if (!body?.delivery_id || !body?.dispatch_token) {
      return Response.json({ ok: false, error: 'Thiếu delivery_id hoặc dispatch_token' }, { status: 400 })
    }
    const adminOrigin = Deno.env.get('ADMIN_PUBLIC_ORIGIN')?.trim()
    const relayUrl = Deno.env.get('MEVO_ZCA_RELAY_URL')?.trim()
    const hmacSecret = Deno.env.get('MEVO_HMAC_SECRET')?.trim()
    if (!adminOrigin || !relayUrl || !hmacSecret) {
      return Response.json({ ok: false, error: 'Thiếu cấu hình relay Zalo' }, { status: 503 })
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const result = await handleReservationZcaNotify(body, { db, adminOrigin })
    return Response.json(result)
  } catch (error) {
    console.error('[reservation-zca-notify] lỗi xử lý delivery', error instanceof Error ? error.message : 'unknown')
    return Response.json({ ok: false, error: 'Không xử lý được cảnh báo nhóm Zalo' }, { status: 500 })
  }
})
