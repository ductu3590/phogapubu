'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'

export type ReservationCustomerCallTask = {
  taskId: string
  reservationId: string
  customerName: string
  customerPhone: string
  partySize: number
  arrivalAt: string
  dueAt: string
  createdAt: string
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

async function ownerClient(): Promise<Result<{ storeId: string; supabase: Awaited<ReturnType<typeof createClient>> }>> {
  try {
    const operator = await requireOperator()
    if (operator.role !== 'store_owner') return { ok: false, error: 'Chỉ chủ quán được xử lý việc gọi nhắc khách' }
    return { ok: true, value: { storeId: operator.storeId, supabase: await createClient() } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Không có quyền xử lý việc gọi nhắc khách' }
  }
}

export async function listReservationCustomerCalls(): Promise<Result<ReservationCustomerCallTask[]>> {
  const client = await ownerClient()
  if (!client.ok) return client
  const { data, error } = await client.value.supabase.rpc('list_reservation_customer_calls', { p_store_id: client.value.storeId })
  if (error || !Array.isArray(data)) return { ok: false, error: error?.message ?? 'Dữ liệu việc gọi nhắc khách không hợp lệ' }
  return {
    ok: true,
    value: data.map((item) => {
      const row = item as Record<string, unknown>
      return {
        taskId: String(row.task_id), reservationId: String(row.reservation_id), customerName: String(row.customer_name),
        customerPhone: String(row.customer_phone), partySize: Number(row.party_size), arrivalAt: String(row.arrival_at),
        dueAt: String(row.due_at), createdAt: String(row.created_at),
      }
    }),
  }
}

export async function resolveReservationCustomerCall(
  taskId: string,
  outcome: 'called' | 'unreachable',
): Promise<Result<{ already: boolean }>> {
  const client = await ownerClient()
  if (!client.ok) return client
  const { data, error } = await client.value.supabase.rpc('resolve_reservation_customer_call', {
    p_task_id: taskId, p_outcome: outcome,
  })
  if (error || !data || typeof data !== 'object') return { ok: false, error: error?.message ?? 'Không thể lưu kết quả gọi nhắc' }
  return { ok: true, value: { already: (data as { already?: boolean }).already === true } }
}
