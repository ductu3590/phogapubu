'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'

export type ServiceRequestRow = {
  id: string
  store_id: string
  table_id: string
  table_number: string
  type: 'call_staff'
  session_id: string | null
  created_at: string
  last_ping_at: string
  ping_count: number
  resolved_at: string | null
  resolved_by: string | null
}

export async function listOpenServiceRequests(): Promise<
  | { ok: true; requests: ServiceRequestRow[] }
  | { ok: false; error: string }
> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner' && operator.role !== 'store_staff') {
    return { ok: false, error: 'Không có quyền' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_open_service_requests', {
    p_store_id: operator.storeId,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true, requests: (data ?? []) as unknown as ServiceRequestRow[] }
}

export async function resolveServiceRequest(
  requestId: string,
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner' && operator.role !== 'store_staff') {
    return { ok: false, error: 'Không có quyền' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('resolve_service_request', {
    p_request_id: requestId,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true, already: Boolean((data as { already?: boolean } | null)?.already) }
}
