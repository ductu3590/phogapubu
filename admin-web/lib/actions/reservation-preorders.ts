'use server'

import { randomUUID } from 'crypto'
import { requireOperator } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { toPreorderRow, type PreorderRpcRow } from '@/lib/reservation-rows'
import { isPosRole } from '@/lib/auth/roles'

export type PreorderPrintKind = 'original' | 'adjustment' | 'reprint'
export type PreorderSnapshot = {
  revision: number
  total_amount: number
  note: string | null
  items: Array<{ name: string; quantity: number; price: number; note?: string | null; toppings?: Array<{ name: string; price: number }> }>
  kind?: PreorderPrintKind
  previous_snapshot?: PreorderSnapshot | null
  reservation?: { customer_name: string; arrival_at: string; party_size: number }
  table_numbers?: string[]
}

export type ReservationPreorderRow = {
  orderId: string; reservationId: string; customerName: string; customerPhone: string
  partySize: number; arrivalAt: string; reservationStatus: string; orderStatus: string
  revision: number; releasedRevision: number; needsPrint: boolean; needsReview: boolean
  wasteReviewRequired: boolean; totalAmount: number; currentSnapshot: PreorderSnapshot
  releasedSnapshot: PreorderSnapshot | null; tableNumbers: string[]; createdAt: string
}


export type PreorderActionResult =
  | { ok: true; already: boolean; releasedRevision?: number; printJobId?: string; snapshot?: PreorderSnapshot }
  | { ok: false; error: string }

async function ownerClient() {
  try {
    const operator = await requireOperator()
    if (!isPosRole(operator.role)) return { operator: null, supabase: null, error: 'Chỉ chủ quán hoặc thu ngân được xử lý món đặt trước' }
    return { operator, supabase: await createClient(), error: null }
  } catch (error) {
    return { operator: null, supabase: null, error: error instanceof Error ? error.message : 'Không có quyền xử lý món đặt trước' }
  }
}

export async function listReservationPreorderQueue(): Promise<{ ok: true; rows: ReservationPreorderRow[] } | { ok: false; error: string }> {
  const { operator, supabase, error } = await ownerClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền xử lý món đặt trước' }
  const { data, error: rpcError } = await supabase.rpc('list_reservation_preorder_queue', { p_store_id: operator.storeId })
  if (rpcError || !Array.isArray(data)) return { ok: false, error: rpcError?.message ?? 'Dữ liệu món đặt trước không hợp lệ' }
  return { ok: true, rows: data.map((row) => toPreorderRow(row as PreorderRpcRow)) }
}

export async function releaseReservationPreorder(orderId: string, revision: number, requestId = randomUUID()): Promise<PreorderActionResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý món đặt trước' }
  const { data, error: rpcError } = await supabase.rpc('release_reservation_preorder', { p_order_id: orderId, p_expected_revision: revision, p_request_id: requestId })
  if (rpcError || !data || typeof data !== 'object') return { ok: false, error: rpcError?.message ?? 'Không duyệt được món đặt trước' }
  const value = data as { already?: boolean; released_revision?: number; snapshot?: PreorderSnapshot }
  return { ok: true, already: value.already === true, releasedRevision: value.released_revision, snapshot: value.snapshot }
}

export async function requestReservationPreorderPrint(orderId: string, revision: number, kind: PreorderPrintKind, requestId = randomUUID(), reason?: string): Promise<PreorderActionResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý món đặt trước' }
  const { data, error: rpcError } = await supabase.rpc('request_reservation_preorder_print', { p_order_id: orderId, p_revision: revision, p_kind: kind, p_request_id: requestId, p_reason: reason ?? null })
  if (rpcError || !data || typeof data !== 'object') return { ok: false, error: rpcError?.message ?? 'Không tạo được phiếu in' }
  const value = data as { already?: boolean; print_job_id?: string; snapshot?: PreorderSnapshot }
  if (!value.print_job_id) return { ok: false, error: 'Phiếu in không hợp lệ' }
  return { ok: true, already: value.already === true, printJobId: value.print_job_id, snapshot: value.snapshot }
}

export async function resolvePreorderWaste(orderId: string, reason: string, requestId = randomUUID()): Promise<PreorderActionResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền xử lý món đặt trước' }
  const { data, error: rpcError } = await supabase.rpc('resolve_preorder_waste', { p_order_id: orderId, p_reason: reason, p_request_id: requestId })
  if (rpcError || !data || typeof data !== 'object') return { ok: false, error: rpcError?.message ?? 'Không ghi nhận được đối soát' }
  return { ok: true, already: (data as { already?: boolean }).already === true }
}
