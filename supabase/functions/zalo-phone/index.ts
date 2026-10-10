// Supabase Edge Function — đổi token getPhoneNumber() của Mini App ra số điện thoại (spec 2026-10-09).
// verify_jwt: true (mini app gửi anon JWT, giống checkout-create-mac).
// Secret: store_zalo_configs.zalo_app_secret_key theo quán. KHÔNG ghi DB.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleZaloPhone, type ZaloPhoneBody } from './handler.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'bad_request' }, 405)

  let body: ZaloPhoneBody = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const proxyUrl = Deno.env.get('MEVO_PHONE_PROXY_URL')?.trim()
  const proxySecret = Deno.env.get('MEVO_HMAC_SECRET')?.trim()
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const result = await handleZaloPhone(body, {
    loadConfig: async (storeId) => {
      const { data, error } = await db
        .from('store_zalo_configs')
        .select('zalo_app_secret_key, is_enabled')
        .eq('store_id', storeId)
        .maybeSingle()
      if (error || !data) return null
      return { secret: data.zalo_app_secret_key as string | null, enabled: data.is_enabled as boolean }
    },
    // Timeout 12s: Zalo/proxy treo thì trả lỗi thay vì để khách nhìn "Đang lấy…" mãi.
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12_000) }),
    proxy: proxyUrl && proxySecret ? { url: proxyUrl, hmacSecret: proxySecret } : undefined,
    log: (message) => console.warn(message),
  })
  return json(result.body, result.status)
})
