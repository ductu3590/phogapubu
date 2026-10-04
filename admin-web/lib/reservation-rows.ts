// Đổi hàng RPC đặt bàn (snake_case) → ReservationRow. Tách khỏi 'use server' để trình duyệt (POS đọc
// định kỳ bằng client Supabase) và server action dùng CHUNG một bản đổi.
import type { ReservationRow, ReservationStatus } from '@/lib/actions/reservations'
import type { PreorderSnapshot, ReservationPreorderRow } from '@/lib/actions/reservation-preorders'
import type { ReservationCustomerCallTask } from '@/lib/actions/reservation-customer-calls'

export type ReservationRpcRow = {
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

export function toReservationRow(row: ReservationRpcRow): ReservationRow {
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

export type PreorderRpcRow = {
  order_id: string; reservation_id: string; customer_name: string; customer_phone: string
  party_size: number; arrival_at: string; reservation_status: string; order_status: string
  revision: number; released_revision: number; needs_print: boolean; needs_review: boolean
  waste_review_required: boolean; total_amount: number; current_snapshot: PreorderSnapshot
  released_snapshot: PreorderSnapshot | null; table_numbers: string[]; created_at: string
}

export function toPreorderRow(r: PreorderRpcRow): ReservationPreorderRow {
  return {
    orderId: r.order_id, reservationId: r.reservation_id, customerName: r.customer_name, customerPhone: r.customer_phone,
    partySize: r.party_size, arrivalAt: r.arrival_at, reservationStatus: r.reservation_status, orderStatus: r.order_status,
    revision: r.revision, releasedRevision: r.released_revision, needsPrint: r.needs_print, needsReview: r.needs_review,
    wasteReviewRequired: r.waste_review_required, totalAmount: r.total_amount, currentSnapshot: r.current_snapshot,
    releasedSnapshot: r.released_snapshot, tableNumbers: r.table_numbers ?? [], createdAt: r.created_at,
  }
}

export function toCustomerCallTask(row: Record<string, unknown>): ReservationCustomerCallTask {
  return {
    taskId: String(row.task_id), reservationId: String(row.reservation_id), customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone), partySize: Number(row.party_size), arrivalAt: String(row.arrival_at),
    dueAt: String(row.due_at), createdAt: String(row.created_at),
  }
}
