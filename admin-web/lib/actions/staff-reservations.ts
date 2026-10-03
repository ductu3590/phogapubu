'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'

// Bàn đã có khách đặt trước sắp đến — cho màn nhân viên (mig 084). Chỉ đọc; nhân viên và chủ quán
// đều gọi được, RPC tự khoá theo quán của người gọi.
export type StaffReservedTable = {
  tableId: string
  reservationId: string
  customerName: string
  partySize: number
  arrivalAt: string
  holdEndsAt: string
}

export async function listStaffUpcomingReservedTables(): Promise<
  { ok: true; rows: StaffReservedTable[] } | { ok: false; error: string }
> {
  const operator = await requireOperator()
  if (operator.role !== 'store_owner' && operator.role !== 'store_staff') return { ok: false, error: 'Không có quyền' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_staff_upcoming_reserved_tables', { p_store_id: operator.storeId })
  if (error) return { ok: false, error: error.message }
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
  return {
    ok: true,
    rows: rows.map((r) => ({
      tableId: String(r.table_id),
      reservationId: String(r.reservation_id),
      customerName: String(r.customer_name ?? ''),
      partySize: Number(r.party_size ?? 0),
      arrivalAt: String(r.arrival_at),
      holdEndsAt: String(r.hold_ends_at),
    })),
  }
}
