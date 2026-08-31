'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/auth/operator'

// Bọc 3 RPC phiên bàn (mig 039). Luôn dùng createClient() — phiên đăng nhập của nhân viên —
// chứ KHÔNG createAdminClient(): RPC cần auth.uid() để ghi payment_received_by, đó là dấu vết
// duy nhất trả lời được "ai chốt bill này". Dùng service role là mất sạch audit.
// Trả { ok } thay vì throw để UI xử lý mượt (theo nếp lib/actions/staff-order.ts).

export type SessionOrderItem = { name: string; quantity: number }

export type SessionOrderRow = {
  id: string
  status: string
  created_at: string
  total_amount: number
  order_source: string
  payment_received_at: string | null
  items: SessionOrderItem[]
}

export type OpenTableSession = {
  session_id: string
  table_id: string
  table_number: string
  status: 'open' | 'closed'
  close_reason: string | null
  opened_at: string
  opened_by: 'customer' | 'staff'
  last_activity_at: string
  has_host: boolean
  // true = phiên đã tự hết hạn (6h không hoạt động) nhưng CÒN đơn chưa thu tiền.
  // Vẫn phải hiện ở màn Bàn, nếu không bill quá hạn biến mất và thành công nợ rời rạc.
  needs_review: boolean
  order_count: number
  total: number
  unpaid_total: number
  cooking_count: number
  orders: SessionOrderRow[]
}

export type ListSessionsResult =
  | { ok: true; sessions: OpenTableSession[] }
  | { ok: false; error: string }

export type CloseSessionResult =
  | {
      ok: true
      already: boolean
      ordersSettled: number
      ordersCancelled: number
      ordersLeftInKitchen: number
      total: number
    }
  | { ok: false; error: string }

async function staffClient() {
  const operator = await requireOperator()
  if (operator.role !== 'store_staff' && operator.role !== 'store_owner') {
    return { operator: null, supabase: null, error: 'Không có quyền' as const }
  }
  return { operator, supabase: await createClient(), error: null }
}

export async function listOpenTableSessions(): Promise<ListSessionsResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { data, error: rpcErr } = await supabase.rpc('list_open_table_sessions', {
    p_store_id: operator.storeId,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true, sessions: (data ?? []) as unknown as OpenTableSession[] }
}

// reason='paid'        → ghi tiền cho MỌI đơn chưa thu của phiên (trừ đơn đã huỷ) rồi đóng bàn.
// reason='staff_reset' → bỏ bàn không thu tiền: huỷ đơn chưa nấu, GIỮ đơn đã vào bếp.
export async function closeTableSession(
  sessionId: string,
  reason: 'paid' | 'staff_reset',
  instrument: 'cash' | 'bank' | null,
): Promise<CloseSessionResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { data, error: rpcErr } = await supabase.rpc('close_table_session', {
    p_session_id: sessionId,
    p_reason: reason,
    p_instrument: instrument,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }

  const r = data as {
    already: boolean
    orders_settled: number
    orders_cancelled: number
    orders_left_in_kitchen: number
    total: number
  }
  return {
    ok: true,
    already: r.already,
    ordersSettled: r.orders_settled,
    ordersCancelled: r.orders_cancelled,
    ordersLeftInKitchen: r.orders_left_in_kitchen,
    total: r.total,
  }
}

// Nhả chủ phiên: máy nào gọi món tiếp theo thành chủ. Dùng khi khách A hết pin / đưa máy cho
// người khác — đường thoát rẻ tiền thay vì phải đóng cả bàn.
export async function releaseTableSessionHost(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { error: rpcErr } = await supabase.rpc('release_table_session_host', {
    p_session_id: sessionId,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true }
}
