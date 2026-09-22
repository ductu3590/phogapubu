import { sendOaText, type OaSendResult } from '../_shared/zalo-oa.ts'

type Delivery = {
  delivery_id: string
  store_id: string
  kind: 'owner_new_reservation' | 'owner_test'
  oa_user_id: string
  oa_access_token: string
  customer_name: string | null
  customer_phone: string | null
  party_size: number | null
  arrival_at: string | null
}

type Db = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>
}

type HandlerDeps = { db: Db; send?: (token: string, userId: string, text: string) => Promise<OaSendResult>; adminOrigin: string }

function formatArrival(value: string | null): string {
  if (!value) return 'chưa xác định'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function messageFor(delivery: Delivery, origin: string): string {
  if (delivery.kind === 'owner_test') return `✅ MEVO gửi thử thành công\n\nMở để quản lý đặt bàn: ${origin}/admin/reservations`
  return [
    '📅 Có đặt bàn mới',
    `Khách: ${delivery.customer_name || 'Chưa nhập'} · ${delivery.party_size ?? '?'} khách`,
    `Đến: ${formatArrival(delivery.arrival_at)}`,
    `SĐT: ${delivery.customer_phone || 'Chưa nhập'}`,
    `Mở để xử lý: ${origin}/admin/reservations`,
  ].join('\n')
}

export async function handleReservationOwnerNotify(input: { delivery_id: string; dispatch_token: string }, deps: HandlerDeps) {
  const claimed = await deps.db.rpc('claim_reservation_owner_notification', {
    p_delivery_id: input.delivery_id,
    p_dispatch_token: input.dispatch_token,
  })
  if (claimed.error) throw new Error(claimed.error.message)
  if (!claimed.data) return { ok: true, skipped: true }
  const delivery = claimed.data as Delivery
  const result = await (deps.send ?? ((token, userId, text) => sendOaText(token, userId, text)))(
    delivery.oa_access_token, delivery.oa_user_id, messageFor(delivery, deps.adminOrigin),
  )
  const finish = result.ok
    ? { status: 'sent', code: '0', detail: result.providerMessageId ?? '' }
    : { status: result.retryable ? 'failed' : 'action_required', code: result.providerCode, detail: result.message }
  const saved = await deps.db.rpc('finish_reservation_owner_notification', {
    p_delivery_id: input.delivery_id, p_dispatch_token: input.dispatch_token,
    p_status: finish.status, p_provider_code: finish.code, p_provider_detail: finish.detail,
  })
  if (saved.error) throw new Error(saved.error.message)
  return { ok: result.ok, status: finish.status, providerCode: result.ok ? '0' : result.providerCode }
}

