'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireSuperadmin } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/server'

type DeliveryStatus = 'sent' | 'failed' | 'action_required'

export type GroupNotificationState = {
  provider: 'none' | 'zca_group' | 'zalo_oa'
  enabled: boolean
  hasDestination: boolean
  lastDeliveryStatus: DeliveryStatus | null
  lastDeliveryAt: string | null
  lastProviderCode: string | null
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
      .select('provider, is_enabled, destination_group_id').eq('store_id', storeId).maybeSingle(),
    admin.from('reservation_notification_deliveries')
      .select('status, created_at, provider_code').eq('store_id', storeId).eq('delivery_provider', 'zca_group')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (channelResult.error) throw new Error(`Không đọc được cấu hình nhóm Zalo: ${channelResult.error.message}`)
  if (deliveryResult.error) throw new Error(`Không đọc được trạng thái gửi nhóm Zalo: ${deliveryResult.error.message}`)
  const delivery = deliveryResult.data
  return {
    ...channelState(channelResult.data),
    lastDeliveryStatus: delivery?.status === 'sent' || delivery?.status === 'failed' || delivery?.status === 'action_required' ? delivery.status : null,
    lastDeliveryAt: delivery?.created_at ?? null,
    lastProviderCode: delivery?.provider_code ?? null,
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

  const { data: delivery, error: deliveryError } = await admin.from('reservation_notification_deliveries').insert({
    store_id: storeId,
    kind: 'owner_test',
    status: 'queued',
    idempotency_key: `zca-test:${storeId}:${randomUUID()}`,
    delivery_provider: 'zca_group',
    destination_group_id: channel.destination_group_id,
  }).select('id, dispatch_token').single()
  if (deliveryError || !delivery) throw new Error(`Không tạo được delivery gửi thử: ${deliveryError?.message ?? 'không rõ lỗi'}`)

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !serviceRole) throw new Error('Thiếu cấu hình Supabase server')
  const response = await fetch(`${baseUrl}/functions/v1/reservation-zca-notify`, {
    method: 'POST',
    headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ delivery_id: delivery.id, dispatch_token: delivery.dispatch_token }),
  })
  const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; status?: string; providerCode?: string; message?: string | null } | null
  if (!response.ok || !result) throw new Error(result?.error || `Gửi thử thất bại (${response.status})`)
  revalidatePath(`/mevo/stores/${storeId}`)
  if (result.ok !== true || result.status !== 'sent') {
    return { ok: false, status: result.status ?? 'action_required', message: result.message ?? `Relay từ chối gửi tin (${result.providerCode ?? 'không rõ mã'})` }
  }
  return { ok: true, status: 'sent', message: null }
}
