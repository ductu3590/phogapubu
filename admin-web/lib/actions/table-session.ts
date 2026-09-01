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

export type SessionTable = { id: string; table_number: string }

export type OpenTableSession = {
  session_id: string
  table_id: string
  // Nhãn gộp sẵn của mọi bàn trong phiên: bàn lẻ = "Bàn 5", mâm = "Bàn 5, Bàn 6, Bàn 7"
  table_number: string
  tables: SessionTable[]
  // true = mâm đoàn: ai trong mâm quét QR bàn nào cũng gọi thêm được, không khoá chủ phiên
  is_open_ordering: boolean
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

// ─── Lớp Mâm (mig 040) ───────────────────────────────────────────────────────
// Mâm = một phiên chiếm N bàn = một bill con. Đoàn = N mâm, gộp một lần lúc thanh toán.

export type SimpleResult = { ok: true } | { ok: false; error: string }

// Ghép N bàn TRỐNG thành một mâm. Mâm mở nên cả đoàn cùng gọi vào một bill.
export async function createTraySession(tableIds: string[]): Promise<SimpleResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (tableIds.length === 0) return { ok: false, error: 'Chưa chọn bàn nào' }

  const { error: rpcErr } = await supabase.rpc('create_tray_session', {
    p_store_id: operator.storeId,
    p_table_ids: tableIds,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true }
}

// Thêm một bàn trống vào mâm đang mở (đoàn đông thêm người)
export async function addTableToSession(sessionId: string, tableId: string): Promise<SimpleResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { error: rpcErr } = await supabase.rpc('add_table_to_session', {
    p_session_id: sessionId,
    p_table_id: tableId,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true }
}

// Khách quét QR trước khi nhân viên kịp ghép bàn → phiên lẻ lạc. Gom nó vào mâm:
// chuyển cả đơn lẫn bàn sang mâm rồi đóng phiên lẻ với close_reason='merged'.
export async function mergeSessionIntoTray(
  sessionId: string,
  targetSessionId: string,
): Promise<SimpleResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }

  const { error: rpcErr } = await supabase.rpc('merge_session_into_tray', {
    p_session_id: sessionId,
    p_target_session_id: targetSessionId,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true }
}

// Gộp bill: chốt N mâm trong MỘT giao dịch, cùng một phương tiện. Hoặc thu hết, hoặc không
// mâm nào bị đánh dấu đã thu — không có cảnh thu được 2/3 mâm rồi đứt.
export async function closeTableSessionsBulk(
  sessionIds: string[],
  reason: 'paid' | 'staff_reset',
  instrument: 'cash' | 'bank' | null,
): Promise<CloseSessionResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (sessionIds.length === 0) return { ok: false, error: 'Chưa chọn mâm nào' }

  const { data, error: rpcErr } = await supabase.rpc('close_table_sessions_bulk', {
    p_session_ids: sessionIds,
    p_reason: reason,
    p_instrument: instrument,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }

  const r = data as {
    orders_settled: number
    orders_cancelled: number
    orders_left_in_kitchen: number
    total: number
  }
  return {
    ok: true,
    already: false,
    ordersSettled: r.orders_settled,
    ordersCancelled: r.orders_cancelled,
    ordersLeftInKitchen: r.orders_left_in_kitchen,
    total: r.total,
  }
}

// ─── Dữ liệu in hoá đơn 80mm ────────────────────────────────────────────────
export type BillLine = { name: string; quantity: number; price: number; line_total: number }
export type BillSession = {
  session_id: string
  opened_at: string
  is_open_ordering: boolean
  tables: string
  subtotal: number
  items: BillLine[]
}
export type SessionsBill = {
  store: { name: string; address: string | null; phone: string | null }
  printed_at: string
  sessions: BillSession[]
  grand_total: number
}

export async function getSessionsBill(
  sessionIds: string[],
): Promise<{ ok: true; bill: SessionsBill } | { ok: false; error: string }> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (sessionIds.length === 0) return { ok: false, error: 'Chưa chọn mâm nào' }

  const { data, error: rpcErr } = await supabase.rpc('get_sessions_bill', {
    p_session_ids: sessionIds,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true, bill: data as unknown as SessionsBill }
}
