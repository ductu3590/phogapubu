import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleReservationOwnerNotify } from './handler.ts'

serve(async (req) => {
  try {
    const body = await req.json()
    if (!body?.delivery_id || !body?.dispatch_token) return Response.json({ ok: false, error: 'Thiếu delivery_id hoặc dispatch_token' }, { status: 400 })
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const result = await handleReservationOwnerNotify(body, {
      db,
      adminOrigin: Deno.env.get('ADMIN_PUBLIC_ORIGIN') || 'https://pubu.soccernow.net',
    })
    return Response.json(result)
  } catch (error) {
    console.error('[reservation-owner-notify] lỗi xử lý delivery', error instanceof Error ? error.message : 'unknown')
    return Response.json({ ok: false, error: 'Không xử lý được thông báo' }, { status: 500 })
  }
})

