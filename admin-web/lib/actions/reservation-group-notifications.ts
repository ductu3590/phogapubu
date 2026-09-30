'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireSuperadmin } from '@/lib/auth/operator'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { deliveryIsStale, type DeliveryStatus, type DeliverySummary } from '@/lib/reservation-delivery-status'

export type GroupNotificationState = {
  provider: 'none' | 'zca_group' | 'zalo_oa'
  enabled: boolean
  hasDestination: boolean
  lastDeliveryStatus: DeliveryStatus | null
  lastDeliveryAt: string | null
  lastProviderCode: string | null
  retryContractVerified: boolean
}

function channelState(row: { provider?: string | null; is_enabled?: boolean | null; destination_group_id?: string | null } | null): Pick<GroupNotificationState, 'provider' | 'enabled' | 'hasDestination'> {
  const provider = row?.provider === 'zca_group' || row?.provider === 'zalo_oa' ? row.provider : 'none'
  return {
    provider,
    enabled: provider === 'zca_group' && row?.is_enabled === true,
    hasDestination: provider === 'zca_group' && Boolean(row?.destination_group_id?.trim()),
  }
}

export async function getGroupNotificationState(storeId: string): Promise<GroupNotificationState> {
  await requireSuperadmin()
  const admin = createAdminClient()
  const [channelResult, deliveryResult] = await Promise.all([
    admin.from('store_reservation_notification_channels')
      .select('provider, is_enabled, destination_group_id, retry_contract_verified_at, retry_contract_evidence, retry_contract_version').eq('store_id', storeId).maybeSingle(),
    admin.from('reservation_notification_deliveries')
      .select('status, created_at, provider_code').eq('store_id', storeId).eq('delivery_provider', 'zca_group')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (channelResult.error) throw new Error(`Không đọc được cấu hình nhóm Zalo: ${channelResult.error.message}`)
  if (deliveryResult.error) throw new Error(`Không đọc được trạng thái gửi nhóm Zalo: ${deliveryResult.error.message}`)
  const delivery = deliveryResult.data
  return {
    ...channelState(channelResult.data),
    lastDeliveryStatus: delivery && ['queued', 'processing', 'sent', 'failed', 'action_required'].includes(delivery.status ?? '') ? delivery.status as DeliveryStatus : null,
    lastDeliveryAt: delivery?.created_at ?? null,
    lastProviderCode: delivery?.provider_code ?? null,
    retryContractVerified: channelResult.data?.retry_contract_verified_at != null
      && Boolean(channelResult.data?.retry_contract_evidence?.trim())
      && channelResult.data?.retry_contract_version === 1,
  }
}

export async function saveGroupNotificationChannel(storeId: string, input: { enabled: boolean; groupId: string }): Promise<void> {
  const operator = await requireSuperadmin()
  const groupId = input.groupId.trim()
  if (!groupId) throw new Error('Cần nhập Zalo Group ID để lưu cảnh báo')
  const { error } = await createAdminClient().from('store_reservation_notification_channels').upsert({
    store_id: storeId,
    provider: 'zca_group',
    is_enabled: input.enabled,
    destination_group_id: groupId,
    updated_by: operator.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id' })
  if (error) throw new Error(`Không lưu được cấu hình nhóm Zalo: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

export async function disableGroupNotificationChannel(storeId: string): Promise<void> {
  const operator = await requireSuperadmin()
  const { error } = await createAdminClient().from('store_reservation_notification_channels').upsert({
    store_id: storeId,
    provider: 'none',
    is_enabled: false,
    destination_group_id: null,
    updated_by: operator.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id' })
  if (error) throw new Error(`Không tắt được cảnh báo nhóm Zalo: ${error.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
}

export async function sendGroupNotificationTest(storeId: string): Promise<{ ok: boolean; status: string; message: string | null }> {
  await requireSuperadmin()
  const admin = createAdminClient()
  const { data: channel, error: channelError } = await admin.from('store_reservation_notification_channels')
    .select('provider, is_enabled, destination_group_id').eq('store_id', storeId).maybeSingle()
  const state = channelState(channel)
  if (channelError) throw new Error(`Không đọc được cấu hình nhóm Zalo: ${channelError.message}`)
  if (!state.enabled || !channel?.destination_group_id?.trim()) throw new Error('Hãy lưu và bật cảnh báo nhóm Zalo trước khi gửi thử')

  const { error: deliveryError } = await admin.from('reservation_notification_deliveries').insert({
    store_id: storeId,
    kind: 'owner_test',
    status: 'queued',
    idempotency_key: `zca-test:${storeId}:${randomUUID()}`,
    delivery_provider: 'zca_group',
    destination_group_id: channel.destination_group_id,
    queued_at: new Date().toISOString(),
    recovery_version: 1,
    message_snapshot: { version: 1, kind: 'owner_test' },
  })
  if (deliveryError) throw new Error(`Không tạo được delivery gửi thử: ${deliveryError.message}`)
  revalidatePath(`/mevo/stores/${storeId}`)
  return { ok: true, status: 'queued', message: null }
}

export async function listGroupNotificationDeliveries(storeId: string, retryContractVerified: boolean): Promise<{ rows: DeliverySummary[] }> {
  await requireSuperadmin()
  const { data, error } = await createAdminClient().from('reservation_notification_deliveries')
    .select('id,status,updated_at,created_at,queued_at,processing_started_at,attempt_count,requeue_count,provider_code')
    .eq('store_id', storeId).eq('delivery_provider', 'zca_group')
    .order('created_at', { ascending: false }).limit(20)
  if (error) throw new Error(`Không đọc được delivery thông báo nội bộ: ${error.message}`)
  return { rows: (data ?? []).map((row: Record<string, unknown>) => {
    const status = row.status as DeliveryStatus
    const stale = deliveryIsStale(status, (row.processing_started_at ?? row.queued_at ?? row.updated_at) as string | null)
    const recoveryCandidate = ['failed', 'action_required'].includes(status) || stale
    const canRetry = recoveryCandidate && retryContractVerified
    return { id: String(row.id), status, updatedAt: String(row.updated_at), createdAt: String(row.created_at),
      queuedAt: row.queued_at as string | null, processingStartedAt: row.processing_started_at as string | null,
      attemptCount: Number(row.attempt_count ?? 0), requeueCount: Number(row.requeue_count ?? 0),
      providerCode: row.provider_code as string | null, stale, canRetry,
      retryBlockedReason: !recoveryCandidate ? 'Delivery chưa ở trạng thái có thể gửi lại'
        : 'Relay chưa được MEVO xác minh khử trùng tin nhắn, nên chưa thể gửi lại' }
  }) }
}

export async function retryGroupNotificationDelivery(storeId: string, input: {
  deliveryId: string; expectedUpdatedAt: string; requestId: string; reason: string
}): Promise<{ ok: boolean; error?: string; already?: boolean }> {
  await requireSuperadmin()
  const client = await createClient()
  const { data, error } = await client.rpc('requeue_reservation_zca_notification', {
    p_store_id: storeId, p_delivery_id: input.deliveryId, p_expected_updated_at: input.expectedUpdatedAt,
    p_request_id: input.requestId, p_reason: input.reason,
  })
  if (error) return { ok: false, error: 'Không thể gửi lại delivery này. Vui lòng tải lại trạng thái.' }
  revalidatePath(`/mevo/stores/${storeId}`)
  return { ok: data?.ok === true, already: data?.already === true }
}
