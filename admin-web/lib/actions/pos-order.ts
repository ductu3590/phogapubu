'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePosOperatorStoreId } from '@/lib/auth/operator'

export type ConfirmOrderResult =
  | { ok: true; already: boolean; status: string }
  | { ok: false; error: string }

export type OrderRejectReason =
  | 'out_of_stock'
  | 'kitchen_overloaded'
  | 'duplicate'
  | 'customer_requested'
  | 'other'

export type PosBillResult =
  | { ok: true; orderId: string; totalAmount: number; alreadyApplied: boolean }
  | { ok: false; error: string }

export type PosManualItem = {
  menu_item_id: string
  quantity: number
  variant_id?: string | null
  topping_ids?: string[]
  note?: string | null
}

/**
 * Thu ngân xác nhận đơn khách vừa gọi → đơn chuyển 'pending' sang 'confirmed', rồi client mở
 * trang in 2 liên (phiếu bếp + phiếu bàn).
 *
 * Dùng createClient() — phiên đăng nhập thật — vì RPC cần auth.uid() để ghi confirmed_by;
 * createAdminClient() là mất sạch dấu vết "ai cho đơn này vào bếp".
 * requirePosOperatorStoreId() chỉ để chặn sớm cho đẹp UI; chốt chặn thật nằm trong RPC
 * (is_store_pos_operator — chủ quán hoặc thu ngân), client không lách được.
 */
export async function confirmOrder(orderId: string): Promise<ConfirmOrderResult> {
  try {
    await requirePosOperatorStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pos_confirm_order', { p_order_id: orderId })
  if (error) return { ok: false, error: error.message }

  const row = data as { already?: boolean; status?: string } | null
  return { ok: true, already: !!row?.already, status: row?.status ?? 'confirmed' }
}

export async function rejectOrder(
  orderId: string,
  reasonCode: OrderRejectReason,
  reasonNote: string | null,
): Promise<ConfirmOrderResult> {
  if (reasonCode === 'other' && !reasonNote?.trim()) {
    return { ok: false, error: 'Vui lòng nhập lý do khác' }
  }
  try {
    await requirePosOperatorStoreId()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không có quyền' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pos_reject_order', {
    p_order_id: orderId,
    p_reason_code: reasonCode,
    p_reason_note: reasonCode === 'other' ? reasonNote?.trim() || null : null,
  })
  if (error) return { ok: false, error: error.message }

  const row = data as { already?: boolean; status?: string } | null
  return { ok: true, already: !!row?.already, status: row?.status ?? 'cancelled' }
}

// Mọi thao tác sửa bill đều đi qua RPC SECURITY DEFINER. Server action chỉ giữ vai trò
// bridge của phiên đăng nhập thật, không được phép tự tính lại giá/tổng tiền ở Next.js.
async function ownerClient() {
  try {
    await requirePosOperatorStoreId()
  } catch (e) {
    return { supabase: null, error: e instanceof Error ? e.message : 'Không có quyền' }
  }
  return { supabase: await createClient(), error: null }
}

export async function voidOrderItem(
  orderItemId: string,
  voidType: 'cancelled' | 'gift',
  reason?: string,
): Promise<PosBillResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { data, error: rpcError } = await supabase.rpc('pos_void_order_item', {
    p_order_item_id: orderItemId,
    p_void_type: voidType,
    p_reason: reason?.trim() || null,
  })
  if (rpcError) return { ok: false, error: rpcError.message }

  const row = data as { order_id?: string; total_amount?: number; already_applied?: boolean } | null
  if (!row?.order_id || typeof row.total_amount !== 'number') {
    return { ok: false, error: 'Dữ liệu phản hồi không hợp lệ' }
  }
  return {
    ok: true,
    orderId: row.order_id,
    totalAmount: row.total_amount,
    alreadyApplied: !!row.already_applied,
  }
}

/** Mig 098: thu ngân sửa số lượng (tăng/giảm, ≥1), lý do BẮT BUỘC — server ghi lịch sử + tính lại tổng. */
export async function setOrderItemQuantity(
  orderItemId: string,
  quantity: number,
  reason: string,
): Promise<PosBillResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: 'Số lượng phải từ 1 trở lên' }
  if (!reason.trim()) return { ok: false, error: 'Cần ghi lý do sửa số lượng' }

  const { data, error: rpcError } = await supabase.rpc('pos_set_order_item_quantity', {
    p_order_item_id: orderItemId,
    p_quantity: quantity,
    p_reason: reason.trim(),
  })
  if (rpcError) return { ok: false, error: rpcError.message }

  const row = data as { order_id?: string; total_amount?: number; already_applied?: boolean } | null
  if (!row?.order_id || typeof row.total_amount !== 'number') {
    return { ok: false, error: 'Dữ liệu phản hồi không hợp lệ' }
  }
  return {
    ok: true,
    orderId: row.order_id,
    totalAmount: row.total_amount,
    alreadyApplied: !!row.already_applied,
  }
}

export async function restoreOrderItem(orderItemId: string): Promise<PosBillResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { data, error: rpcError } = await supabase.rpc('pos_restore_order_item', {
    p_order_item_id: orderItemId,
  })
  if (rpcError) return { ok: false, error: rpcError.message }

  const row = data as { order_id?: string; total_amount?: number; already_applied?: boolean } | null
  if (!row?.order_id || typeof row.total_amount !== 'number') {
    return { ok: false, error: 'Dữ liệu phản hồi không hợp lệ' }
  }
  return {
    ok: true,
    orderId: row.order_id,
    totalAmount: row.total_amount,
    alreadyApplied: !!row.already_applied,
  }
}

/** Mig 099 — "Khách lẻ": mở phiên ở một bàn TRỐNG + ghi món tay trong MỘT giao dịch (không để phiên rỗng).
 *  Idempotent theo clientRequestId. Món không vào bếp, như "Thêm món tay". */
export async function walkInOrder(
  tableId: string,
  items: PosManualItem[],
  clientRequestId: string,
): Promise<{ ok: true; sessionId: string; orderId: string; totalAmount: number } | { ok: false; error: string }> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (items.length === 0) return { ok: false, error: 'Chưa chọn món' }

  const { data, error: rpcError } = await supabase.rpc('pos_walk_in_order', {
    p_table_id: tableId,
    p_items: items,
    p_client_request_id: clientRequestId,
  })
  if (rpcError) return { ok: false, error: rpcError.message }

  const row = data as { order_id?: string; session_id?: string; total_amount?: number } | null
  if (!row?.order_id || !row.session_id || typeof row.total_amount !== 'number') {
    return { ok: false, error: 'Dữ liệu phản hồi không hợp lệ' }
  }
  return { ok: true, sessionId: row.session_id, orderId: row.order_id, totalAmount: row.total_amount }
}

export async function addManualItems(
  sessionId: string,
  items: PosManualItem[],
  clientRequestId: string,
): Promise<PosBillResult> {
  const { supabase, error } = await ownerClient()
  if (!supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (items.length === 0) return { ok: false, error: 'Chưa chọn món để thêm' }

  const { data, error: rpcError } = await supabase.rpc('pos_add_manual_items', {
    p_session_id: sessionId,
    p_items: items,
    p_client_request_id: clientRequestId,
  })
  if (rpcError) return { ok: false, error: rpcError.message }

  const row = data as { order_id?: string; total_amount?: number; already_created?: boolean } | null
  if (!row?.order_id || typeof row.total_amount !== 'number') {
    return { ok: false, error: 'Dữ liệu phản hồi không hợp lệ' }
  }
  return {
    ok: true,
    orderId: row.order_id,
    totalAmount: row.total_amount,
    alreadyApplied: !!row.already_created,
  }
}
