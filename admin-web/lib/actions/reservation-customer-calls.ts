'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { toCustomerCallTask } from '@/lib/reservation-rows'
import { isPosRole } from '@/lib/auth/roles'

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
    if (!isPosRole(operator.role)) return { ok: false, error: 'Chỉ chủ quán hoặc thu ngân được xử lý việc gọi nhắc khách' }
    return { ok: true, value: { storeId: operator.storeId as string, supabase: await createClient() } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Không có quyền xử lý việc gọi nhắc khách' }
  }
}

export async function listReservationCustomerCalls(): Promise<Result<ReservationCustomerCallTask[]>> {
  const client = await ownerClient()
  if (!client.ok) return client
  const { data, error } = await client.value.supabase.rpc('list_reservation_customer_calls', { p_store_id: client.value.storeId })
  if (error || !Array.isArray(data)) return { ok: false, error: error?.message ?? 'Dữ liệu việc gọi nhắc khách không hợp lệ' }
  return { ok: true, value: data.map((item) => toCustomerCallTask(item as Record<string, unknown>)) }
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
