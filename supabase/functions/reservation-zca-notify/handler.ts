import { sendZcaGroupMessage, type RelayResult } from '../_shared/zca-relay.ts'

type Delivery = {
  delivery_id: string
  store_id: string
  reservation_id: string
  kind: 'owner_new_reservation' | 'owner_test'
  destination_group_id: string
  customer_name: string | null
  party_size: number | null
  arrival_at: string | null
}

type Db = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

type HandlerDeps = {
  db: Db
  send?: (input: { notificationId: string; storeId: string; groupId: string; text: string }) => Promise<RelayResult>
  adminOrigin: string
}

function formatArrival(value: string | null): string {
  if (!value) return 'chưa xác định'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value))
}

function messageFor(delivery: Delivery, origin: string): string {
  if (delivery.kind === 'owner_test') return `✅ MEVO gửi thử thành công\n\nMở để quản lý đặt bàn: ${origin}/admin/reservations`
  return [
    '📅 Có đặt bàn mới',
    `Khách: ${delivery.customer_name || 'Chưa nhập'} · ${delivery.party_size ?? '?'} khách`,
    `Đến: ${formatArrival(delivery.arrival_at)}`,
    `Mở để xử lý: ${origin}/admin/reservations`,
  ].join('\n')
}

function statusFor(result: RelayResult): { status: 'sent' | 'failed' | 'action_required'; code: string; detail: string } {
  if (result.ok) return { status: 'sent', code: 'OK', detail: result.providerMessageId ?? '' }
  if (result.code === 'PROVIDER_REJECTED' || result.code === 'INVALID_REQUEST' || result.code === 'GROUP_NOT_FOUND') {
    return { status: 'action_required', code: result.code, detail: result.message }
  }
  return { status: result.retryable ? 'failed' : 'action_required', code: result.code, detail: result.message }
}

export async function handleReservationZcaNotify(input: { delivery_id: string; dispatch_token: string }, deps: HandlerDeps) {
  const claimed = await deps.db.rpc('claim_reservation_zca_notification', {
    p_delivery_id: input.delivery_id, p_dispatch_token: input.dispatch_token,
  })
  if (claimed.error) throw new Error(claimed.error.message)
  if (!claimed.data) return { ok: true, skipped: true }
  const delivery = claimed.data as Delivery
  const result = await (deps.send ?? ((message) => sendZcaGroupMessage(message, {
    relayUrl: Deno.env.get('MEVO_ZCA_RELAY_URL')!, hmacSecret: Deno.env.get('MEVO_HMAC_SECRET')!,
  })))({
    notificationId: delivery.delivery_id,
    storeId: delivery.store_id,
    groupId: delivery.destination_group_id,
    text: messageFor(delivery, deps.adminOrigin),
  })
  const finish = statusFor(result)
  const saved = await deps.db.rpc('finish_reservation_zca_notification', {
    p_delivery_id: input.delivery_id,
    p_dispatch_token: input.dispatch_token,
    p_status: finish.status,
    p_provider_code: finish.code,
    p_provider_detail: finish.detail,
  })
  if (saved.error) throw new Error(saved.error.message)
  return { ok: result.ok, status: finish.status, providerCode: finish.code, message: result.ok ? null : result.message }
}
