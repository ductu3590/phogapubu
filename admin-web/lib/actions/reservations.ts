'use server'

import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'change_requested'
  | 'cancelled_by_customer'
  | 'cancelled_by_store'
  | 'arrived'
  | 'completed'
  | 'no_show'

export type ReservationRow = {
  reservationId: string
  storeId: string
  status: ReservationStatus
  customerName: string
  customerPhone: string
  partySize: number
  arrivalAt: string
  note: string | null
  requestedArrivalAt: string | null
  requestedPartySize: number | null
  changeNote: string | null
  createdAt: string
  updatedAt: string
  tableIds: string[]
  tableNumbers: string[]
  suggestedTableCount: number
  sessionId: string | null
  already: boolean
}

export type ReservationRange = {
  startsAt: string
  endsAt: string
}

export type ReservationResult =
  | { ok: true; reservation: ReservationRow }
  | { ok: false; error: string }

export type ListReservationsResult =
  | { ok: true; reservations: ReservationRow[] }
  | { ok: false; error: string }

type ReservationRpcRow = {
  reservation_id: string
  store_id: string
  status: ReservationStatus
  customer_name: string
  customer_phone: string
  party_size: number
  arrival_at: string
  note: string | null
  requested_arrival_at: string | null
  requested_party_size: number | null
  change_note: string | null
  created_at: string
  updated_at: string
  table_ids?: string[]
  table_numbers?: string[]
  suggested_table_count?: number
  session_id?: string | null
  already?: boolean
}

function toReservationRow(row: ReservationRpcRow): ReservationRow {
  return {
    reservationId: row.reservation_id,
    storeId: row.store_id,
    status: row.status,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    partySize: row.party_size,
    arrivalAt: row.arrival_at,
    note: row.note,
    requestedArrivalAt: row.requested_arrival_at,
    requestedPartySize: row.requested_party_size,
    changeNote: row.change_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tableIds: row.table_ids ?? [],
    tableNumbers: row.table_numbers ?? [],
    suggestedTableCount: row.suggested_table_count ?? 0,
    sessionId: row.session_id ?? null,
    already: row.already ?? false,
  }
}

async function ownerClient() {
  try {
    const operator = await requireOperator()
    if (operator.role !== 'store_owner') {
      return { supabase: null, storeId: null, error: 'Chỉ chủ quán được xử lý đặt bàn' }
    }
    return { supabase: await createClient(), storeId: operator.storeId, error: null }
  } catch (error) {
    return {
      supabase: null,
      storeId: null,
      error: error instanceof Error ? error.message : 'Không có quyền xử lý đặt bàn',
    }
  }
}

function rpcResult(data: unknown): ReservationResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Dữ liệu phản hồi đặt bàn không hợp lệ' }
  }
  return { ok: true, reservation: toReservationRow(data as ReservationRpcRow) }
}

export async function listReservations(range: ReservationRange): Promise<ListReservationsResult> {
  const { supabase, storeId, error } = await ownerClient()
  if (!supabase || !storeId) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('list_store_reservations', {
    p_store_id: storeId,
    p_starts_at: range.startsAt,
    p_ends_at: range.endsAt,
  })
  if (rpcError) return { ok: false, error: rpcError.message }

  if (!Array.isArray(data)) return { ok: false, error: 'Dữ liệu phản hồi đặt bàn không hợp lệ' }
  return { ok: true, reservations: data.map((row) => toReservationRow(row as ReservationRpcRow)) }
}

export async function confirmReservation(
  reservationId: string,
  tableIds: string[],
  note: string | null = null,
): Promise<ReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('confirm_reservation', {
    p_reservation_id: reservationId,
    p_table_ids: tableIds,
    p_note: note,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
}

export async function rejectReservation(
  reservationId: string,
  reason: string | null = null,
): Promise<ReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('reject_reservation', {
    p_reservation_id: reservationId,
    p_reason: reason,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
}

export async function arriveReservation(reservationId: string): Promise<ReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('arrive_reservation', {
    p_reservation_id: reservationId,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
}

export async function markReservationNoShow(
  reservationId: string,
  note: string | null = null,
): Promise<ReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('mark_reservation_no_show', {
    p_reservation_id: reservationId,
    p_note: note,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
}
