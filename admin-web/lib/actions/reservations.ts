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
  planningHoldMinutes: number
  sessionId: string | null
  already: boolean
  reminderSnoozedUntil: string | null
  reminderSnoozedBy: string | null
}

export type ReservationRange = {
  startsAt: string
  endsAt: string
}

export type ReservationQueueRange = {
  recentSince: string
  futureUntil: string
}

export type ManualReservationInput = {
  customerName: string
  customerPhone: string
  partySize: number
  arrivalAt: string
  note: string | null
  reason: string
  zaloUserId: string | null
}

export type ReservationResult =
  | { ok: true; reservation: ReservationRow }
  | { ok: false; error: string }

export type ListReservationsResult =
  | { ok: true; reservations: ReservationRow[] }
  | { ok: false; error: string }

export type SnoozeReservationResult =
  | { ok: true; updatedCount: number; reminderSnoozedUntil: string }
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
  planning_hold_minutes?: number
  session_id?: string | null
  already?: boolean
  reminder_snoozed_until?: string | null
  reminder_snoozed_by?: string | null
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
    planningHoldMinutes: row.planning_hold_minutes ?? 0,
    sessionId: row.session_id ?? null,
    already: row.already ?? false,
    reminderSnoozedUntil: row.reminder_snoozed_until ?? null,
    reminderSnoozedBy: row.reminder_snoozed_by ?? null,
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

export async function listReservationQueue(
  range: ReservationQueueRange,
): Promise<ListReservationsResult> {
  const { supabase, storeId, error } = await ownerClient()
  if (!supabase || !storeId) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('list_reservation_queue', {
    p_store_id: storeId,
    p_recent_since: range.recentSince,
    p_future_until: range.futureUntil,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  if (!Array.isArray(data)) return { ok: false, error: 'Dữ liệu phản hồi đặt bàn không hợp lệ' }
  return { ok: true, reservations: data.map((row) => toReservationRow(row as ReservationRpcRow)) }
}

export async function createManualReservation(
  input: ManualReservationInput,
): Promise<ReservationResult> {
  const { supabase, storeId, error } = await ownerClient()
  if (!supabase || !storeId) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('create_manual_reservation', {
    p_store_id: storeId,
    p_payload: {
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      party_size: input.partySize,
      arrival_at: input.arrivalAt,
      note: input.note,
      reason: input.reason,
      zalo_user_id: input.zaloUserId,
    },
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
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

export async function resolveReservationChange(
  reservationId: string,
  accept: boolean,
  tableIds: string[] | null = null,
  note: string | null = null,
): Promise<ReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('resolve_reservation_change', {
    p_reservation_id: reservationId,
    p_accept: accept,
    p_table_ids: tableIds,
    p_note: note,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
}

export async function rescheduleReservation(
  reservationId: string,
  arrivalAt: string,
  partySize: number,
  tableIds: string[] | null,
  note: string,
): Promise<ReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('reschedule_reservation', {
    p_reservation_id: reservationId,
    p_arrival_at: arrivalAt,
    p_party_size: partySize,
    p_table_ids: tableIds,
    p_note: note,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  return rpcResult(data)
}

export async function snoozeReservationReminders(
  reservationIds: string[],
  minutes: number,
): Promise<SnoozeReservationResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý đặt bàn' }

  const { data, error: rpcError } = await supabase.rpc('snooze_reservation_reminders', {
    p_reservation_ids: reservationIds,
    p_minutes: minutes,
  })
  if (rpcError) return { ok: false, error: rpcError.message }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Dữ liệu phản hồi Snooze không hợp lệ' }
  }

  const row = data as { updated_count?: unknown; reminder_snoozed_until?: unknown }
  if (typeof row.updated_count !== 'number' || typeof row.reminder_snoozed_until !== 'string') {
    return { ok: false, error: 'Dữ liệu phản hồi Snooze không hợp lệ' }
  }
  return {
    ok: true,
    updatedCount: row.updated_count,
    reminderSnoozedUntil: row.reminder_snoozed_until,
  }
}
