'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireSuperadmin } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

type OwnerOaSetup = {
  oaId: string | null
  miniAppId: string | null
  hasAccessToken: boolean
  hasAppSecret: boolean
  configEnabled: boolean
  recipientStatus: 'pending' | 'verified' | 'disabled' | null
  verifiedAt: string | null
  lastTestedAt: string | null
  lastTestStatus: 'sent' | 'failed' | null
}

async function loadOwnerOaSetup(admin: AdminClient, storeId: string): Promise<OwnerOaSetup> {
  const [storeResult, appResult, configResult, recipientResult] = await Promise.all([
    admin.from('stores').select('zalo_oa_id').eq('id', storeId).maybeSingle(),
    admin.from('store_app_configs').select('zalo_mini_app_id').eq('store_id', storeId).maybeSingle(),
    admin
      .from('store_zalo_configs')
      .select('zalo_oa_access_token, zalo_app_secret_key, is_enabled')
      .eq('store_id', storeId)
      .maybeSingle(),
    admin
      .from('store_zalo_notification_recipients')
      .select('status, verified_at, last_tested_at, last_test_status')
      .eq('store_id', storeId)
      .eq('purpose', 'reservation_owner_alert')
      .maybeSingle(),
  ])

  for (const result of [storeResult, appResult, configResult, recipientResult]) {
    if (result.error) throw new Error(`Không đọc được cấu hình Zalo OA: ${result.error.message}`)
  }

  const store = storeResult.data
  const app = appResult.data
  const config = configResult.data
  const recipient = recipientResult.data

  return {
    oaId: store?.zalo_oa_id?.trim() || null,
    miniAppId: app?.zalo_mini_app_id?.trim() || null,
    hasAccessToken: Boolean(config?.zalo_oa_access_token?.trim()),
    hasAppSecret: Boolean(config?.zalo_app_secret_key?.trim()),
    configEnabled: config?.is_enabled === true,
    recipientStatus: recipient?.status ?? null,
    verifiedAt: recipient?.verified_at ?? null,
    lastTestedAt: recipient?.last_tested_at ?? null,
    lastTestStatus: recipient?.last_test_status ?? null,
  }
}

export async function getOwnerOaNotificationState(storeId: string) {
  await requireSuperadmin()
  const setup = await loadOwnerOaSetup(createAdminClient(), storeId)

  return {
    hasOaId: Boolean(setup.oaId),
    hasMiniAppId: Boolean(setup.miniAppId),
    hasAccessToken: setup.hasAccessToken,
    hasAppSecret: setup.hasAppSecret,
    configEnabled: setup.configEnabled,
    recipientStatus: setup.recipientStatus,
    verifiedAt: setup.verifiedAt,
    lastTestedAt: setup.lastTestedAt,
    lastTestStatus: setup.lastTestStatus,
    webhookPath: `/api/zalo-oa-webhook/${storeId}`,
  }
}

export async function createOwnerOaChallenge(storeId: string) {
  const operator = await requireSuperadmin()
  const admin = createAdminClient()
  const setup = await loadOwnerOaSetup(admin, storeId)

  if (!setup.oaId) throw new Error('Thiếu Zalo OA ID của quán')
  if (!setup.miniAppId) throw new Error('Thiếu Zalo Mini App ID của quán')
  if (!setup.configEnabled || !setup.hasAppSecret) {
    throw new Error('Thiếu App Secret hoặc cấu hình Zalo OA chưa được bật')
  }

  // 12 byte = 96 bit entropy; chỉ trả raw code trong response này, DB chỉ nhận SHA-256.
  const code = randomBytes(12).toString('hex').toUpperCase()
  const codeHash = createHash('sha256').update(code).digest('hex')
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  const { error } = await admin.rpc('create_zalo_oa_onboarding_challenge', {
    p_store_id: storeId,
    p_code_hash: codeHash,
    p_created_by: operator.userId,
    p_expires_at: expiresAt,
  })
  if (error) throw new Error(`Không tạo được mã kết nối OA: ${error.message}`)

  revalidatePath(`/mevo/stores/${storeId}`)
  return { message: `MEVO ${code}`, expiresAt }
}

export async function disableOwnerOaRecipient(storeId: string) {
  await requireSuperadmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from('store_zalo_notification_recipients')
    .update({ status: 'disabled', disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .eq('purpose', 'reservation_owner_alert')
  if (error) throw new Error(`Không tắt được người nhận OA: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}
