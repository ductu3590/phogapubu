import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import {
  UnsupportedOaEventError,
  verifyAndNormalizeOaWebhook,
} from '@/lib/zalo/oa-contract'

export async function GET() {
  return Response.json({ ok: true })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const { storeId } = await params
  // Zalo gửi POST kiểm tra URL trước khi phát event có chữ ký. Không xử lý body này.
  if (!request.headers.get('x-zevent-signature')?.trim()) {
    return Response.json({ ok: true })
  }
  const admin = createAdminClient()

  const [storeResult, configResult] = await Promise.all([
    admin.from('stores').select('zalo_oa_id').eq('id', storeId).maybeSingle(),
    admin
      .from('store_zalo_configs')
      .select('zalo_oa_app_id, zalo_app_secret_key, is_enabled')
      .eq('store_id', storeId)
      .maybeSingle(),
  ])

  if (storeResult.error || configResult.error) {
    return Response.json({ ok: false }, { status: 503 })
  }

  const store = storeResult.data
  const config = configResult.data
  if (!config?.is_enabled || !config.zalo_app_secret_key) {
    return Response.json({ ok: false }, { status: 503 })
  }

  const rawBody = await request.text()
  let message
  try {
    message = verifyAndNormalizeOaWebhook(
      rawBody,
      request.headers.get('x-zevent-signature') ?? '',
      config.zalo_app_secret_key,
    )
  } catch (error) {
    if (error instanceof UnsupportedOaEventError) {
      return Response.json({ ok: true }, { status: 202 })
    }
    return Response.json({ ok: false }, { status: 401 })
  }

  const appIdMatches = message.appId === config.zalo_oa_app_id?.trim()
  const oaIdMatches = message.oaId === store?.zalo_oa_id?.trim()
  if (!appIdMatches || !oaIdMatches) {
    console.warn('[zalo-oa-webhook] tenant mismatch', {
      storeId,
      appIdMatches,
      oaIdMatches,
      receivedAppId: message.appId,
      receivedOaId: message.oaId,
    })
    return Response.json({ ok: false }, { status: 403 })
  }

  const match = /^MEVO\s+([A-F0-9]{24})$/i.exec(message.text.trim())
  if (!match) return Response.json({ ok: true })

  const codeHash = createHash('sha256').update(match[1].toUpperCase()).digest('hex')
  const { error } = await admin.rpc('claim_zalo_oa_onboarding_challenge', {
    p_store_id: storeId,
    p_app_id: message.appId,
    p_oa_id: message.oaId,
    p_oa_user_id: message.senderOaUserId,
    p_message_id: message.messageId,
    p_code_hash: codeHash,
  })

  if (error) return Response.json({ ok: false }, { status: 503 })
  // Không trả status claim, UID hoặc nguyên nhân code sai để endpoint không thành oracle dò mã.
  return Response.json({ ok: true })
}
