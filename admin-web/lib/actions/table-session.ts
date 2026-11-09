'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/auth/operator'
import { isPosRole } from '@/lib/auth/roles'
import type { BillDiscount } from '@/lib/bill-discount'
import { parsePaymentLines, type PaymentLine } from '@/lib/collect-payment'
import { debtChoiceError, type DebtCustomerChoice, type NewDebtCustomer } from '@/lib/debts'

// Bọc 3 RPC phiên bàn (mig 039). Luôn dùng createClient() — phiên đăng nhập của nhân viên —
// chứ KHÔNG createAdminClient(): RPC cần auth.uid() để ghi payment_received_by, đó là dấu vết
// duy nhất trả lời được "ai chốt bill này". Dùng service role là mất sạch audit.
// Trả { ok } thay vì throw để UI xử lý mượt (theo nếp lib/actions/staff-order.ts).

export type SessionOrderItem = {
  id: string
  name: string
  quantity: number
  price: number
  toppings: { id: string; name: string; price: number }[]
  void_type: 'cancelled' | 'gift' | null
  void_reason: string | null
  voided_at: string | null
  is_gift: boolean
  /** Mig 098: lịch sử thu ngân sửa số lượng (cũ → mới, lý do). */
  qty_changes?: { old_quantity: number; new_quantity: number; reason: string; changed_at: string }[]
}

export type SessionOrderRow = {
  id: string
  status: string
  created_at: string
  total_amount: number
  order_source: string
  confirmed_at: string | null
  payment_received_at: string | null
  // Chỉ có ở rejected_orders (mig 089)
  rejected_at?: string | null
  rejection_reason_code?: string | null
  rejection_reason_note?: string | null
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
  // true = phiên đã tự hết hạn theo cấu hình nhưng CÒN đơn chưa thu tiền.
  // Vẫn phải hiện ở màn Bàn, nếu không bill quá hạn biến mất và thành công nợ rời rạc.
  needs_review: boolean
  order_count: number
  total: number
  unpaid_total: number
  cooking_count: number
  // mig 108: ý định giảm giá cả bill của phiên ĐANG MỞ; null = không giảm (phiên hết hạn luôn null —
  // close_table_session bỏ qua giảm giá của nó). Số tiền thật tính bằng lib/bill-discount.ts trên unpaid_total.
  // Optional: server trước 108 không trả.
  bill_discount_type?: 'amount' | 'percent' | null
  bill_discount_value?: number | null
  // Nguồn từ store_workflow_settings; null chỉ khi server cũ chưa trả cấu hình hợp lệ.
  idle_timeout_minutes: number | null
  orders: SessionOrderRow[]
  // mig 089: lượt thu ngân TỪ CHỐI — chỉ tab Lịch sử đọc; không có trong orders/total/order_count.
  // Optional: server trước 089 không trả.
  rejected_orders?: SessionOrderRow[]
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

export type CollectBillInput = {
  sessionIds: string[]
  /** p_lines của collect_table_bill, dựng bằng buildPaymentLines (lib/collect-payment.ts). */
  lines: PaymentLine[]
  /** Tiền khách đưa, so với PHẦN TIỀN MẶT; null = không ghi. */
  cashGiven: number | null
  /** Sinh một lần khi mở màn Thanh toán; bấm lại sau khi mất mạng phải gửi LẠI đúng mã này. */
  clientRequestId: string
  /** Mig 123: khách nợ đã có (khi lines có dòng 'debt'). Dựng bằng buildCollectPayload (lib/collect-payment.ts). */
  debtCustomerId?: string | null
  /** Mig 123: khách nợ tạo mới trong cùng lần thu (khi lines có dòng 'debt'). */
  newDebtCustomer?: NewDebtCustomer | null
}

export type CollectBillResult =
  | {
      ok: true
      already: boolean
      paymentId: string | null
      total: number
      ordersSettled: number
      /** Chỉ khi already: các khoản ĐÃ GHI (có thể khác khoản vừa gửi). Thu mới → []. */
      lines: PaymentLine[]
      cashGiven: number | null
      changeAmount: number | null
    }
  | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function staffClient() {
  const operator = await requireOperator()
  // Vai trò quầy lấy từ MỘT chỗ (isPosRole) để vai mới ở quầy (vd. quản lý) tự vào được; phục vụ thì thêm riêng.
  if (!isPosRole(operator.role) && operator.role !== 'store_staff') {
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

  const { data: workflow, error: workflowErr } = await supabase.rpc('get_public_store_workflow', {
    p_store_id: operator.storeId,
  })
  const rawTimeout = (workflowErr ? null : workflow as { table_session_idle_timeout_minutes?: unknown } | null)
    ?.table_session_idle_timeout_minutes
  const idleTimeoutMinutes =
    typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : null
  const sessions = ((data ?? []) as unknown as Omit<OpenTableSession, 'idle_timeout_minutes'>[])
    .map((session) => ({ ...session, idle_timeout_minutes: idleTimeoutMinutes }))

  return { ok: true, sessions }
}

// Bỏ bàn ('staff_reset'): đóng phiên KHÔNG thu tiền — huỷ đơn chưa nấu, GIỮ đơn đã vào bếp.
// Thu tiền KHÔNG đi đường này nữa (mig 112b: close_table_session từ chối 'paid') → dùng collectTableBill.
export async function closeTableSession(
  sessionId: string,
  reason: 'staff_reset',
): Promise<CloseSessionResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!isPosRole(operator.role)) {
    return { ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được thu tiền hoặc bỏ bàn' }
  }

  const { data, error: rpcErr } = await supabase.rpc('close_table_session', {
    p_session_id: sessionId,
    p_reason: reason,
    p_instrument: null,
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

// Thu tiền một bàn hoặc gộp bill N mâm (mig 112a). Server tự tính số phải thu, so với tổng `lines` ở cấp cả
// nhóm; lệch một đồng thì từ chối và không ghi gì. Gọi lại cùng clientRequestId (mạng đứt sau khi server đã thu)
// trả kết quả cũ với already=true, không tạo khoản thứ hai.
export async function collectTableBill(input: CollectBillInput): Promise<CollectBillResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!isPosRole(operator.role)) {
    return { ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được thu tiền hoặc bỏ bàn' }
  }
  if (!Array.isArray(input.sessionIds) || input.sessionIds.length === 0) {
    return { ok: false, error: 'Chưa chọn mâm nào' }
  }
  if (typeof input.clientRequestId !== 'string' || !UUID.test(input.clientRequestId)) {
    return { ok: false, error: 'Mã thu tiền không hợp lệ' }
  }
  if (!input.sessionIds.every((id) => typeof id === 'string' && UUID.test(id))) {
    return { ok: false, error: 'Mã phiên không hợp lệ' }
  }

  // Mig 123: CHỈ khi có dòng ghi nợ mới gửi thêm khách; không có thì giữ đúng 4 tham số như trước (khách chọn
  // nhầm rồi đổi sang Tiền mặt không bị server từ chối 'Không có phần ghi nợ để gắn khách').
  const hasDebt = Array.isArray(input.lines) && input.lines.some((l) => l?.instrument === 'debt')
  const debtCustomerId = input.debtCustomerId ?? null
  const newDebtCustomer = input.newDebtCustomer ?? null
  if (hasDebt) {
    if (debtCustomerId && (typeof debtCustomerId !== 'string' || !UUID.test(debtCustomerId))) {
      return { ok: false, error: 'Mã khách không hợp lệ' }
    }
    // Cùng kiểm của màn Thanh toán (thiếu khách, tên trống, SĐT sai) → câu báo thân thiện trước khi gọi server.
    if (newDebtCustomer !== null && (typeof newDebtCustomer !== 'object' || Array.isArray(newDebtCustomer))) {
      return { ok: false, error: 'Thông tin khách nợ không hợp lệ' }
    }
    const choice: DebtCustomerChoice | null = newDebtCustomer
      ? { kind: 'new', customer: newDebtCustomer }
      : debtCustomerId ? { kind: 'existing', id: debtCustomerId, name: '' } : null
    const choiceError = debtChoiceError(choice)
    if (choiceError) return { ok: false, error: choiceError }
  }

  const { data, error: rpcErr } = await supabase.rpc('collect_table_bill', {
    p_session_ids: input.sessionIds,
    p_lines: input.lines,
    p_cash_given: input.cashGiven,
    p_client_request_id: input.clientRequestId,
    ...(hasDebt ? { p_debt_customer_id: debtCustomerId, p_new_debt_customer: newDebtCustomer } : {}),
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  // Không lỗi mà cũng không có kết quả: không biết đã thu hay chưa → bảo tải lại để xem bill thật, đừng đoán.
  if (!data) return { ok: false, error: 'Không nhận được kết quả thu tiền, tải lại trang để kiểm tra' }

  const r = data as {
    already: boolean
    payment_id: string | null
    total: number | string
    orders_settled: number | string
    lines?: unknown
    cash_given?: number | null
    change_amount?: number | null
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    ok: true,
    already: r.already === true,
    paymentId: r.payment_id ?? null,
    total: Number(r.total),
    ordersSettled: Number(r.orders_settled),
    lines: parsePaymentLines(r.lines),
    cashGiven: num(r.cash_given),
    changeAmount: num(r.change_amount),
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

// Chuyển MỘT bàn của phiên sang bàn trống (mig 104). Chỉ chủ quán / thu ngân. Mọi luật (bàn đích
// trống, không nằm trong khung giữ đặt trước, phiên còn mở...) do RPC kiểm; lỗi trả nguyên văn tiếng Việt.
export async function moveSessionTable(
  sessionId: string,
  fromTableId: string,
  toTableId: string,
): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string }> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!isPosRole(operator.role)) {
    return { ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được chuyển bàn' }
  }

  const { data, error: rpcErr } = await supabase.rpc('pos_move_session_table', {
    p_session_id: sessionId,
    p_from_table_id: fromTableId,
    p_to_table_id: toTableId,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }

  const r = data as { from_table_number?: string; to_table_number?: string } | null
  return { ok: true, from: r?.from_table_number ?? '', to: r?.to_table_number ?? '' }
}

// Chuyển CẢ mâm (mọi bàn của phiên) sang MỘT bàn trống (mig 106). Cùng luật và quyền như moveSessionTable;
// lỗi RPC trả nguyên văn tiếng Việt. `from` có thể là nhiều bàn: "Bàn 6, Bàn 7".
export async function moveSessionToTable(
  sessionId: string,
  toTableId: string,
): Promise<{ ok: true; from: string; to: string } | { ok: false; error: string }> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!isPosRole(operator.role)) {
    return { ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được chuyển bàn' }
  }

  const { data, error: rpcErr } = await supabase.rpc('pos_move_session_to_table', {
    p_session_id: sessionId,
    p_to_table_id: toTableId,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }

  const r = data as { from_table_numbers?: string[] | string; to_table_number?: string } | null
  const from = Array.isArray(r?.from_table_numbers) ? r.from_table_numbers.join(', ') : (r?.from_table_numbers ?? '')
  return { ok: true, from, to: r?.to_table_number ?? '' }
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

// ─── Giảm giá cả bill (mig 107) ──────────────────────────────────────────────
// Chỉ lưu "ý định" trên phiên; tiền thật sự trừ vào đơn lúc thu (collect_table_bill, mig 112a). null = bỏ giảm giá.
// Mọi luật (số nguyên không âm, % ≤ 100, VNĐ ≤ tiền hàng, phiên còn mở) do RPC kiểm; lỗi trả nguyên văn tiếng Việt.

// Một phiên.
export async function setSessionDiscount(sessionId: string, d: BillDiscount): Promise<SimpleResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!isPosRole(operator.role)) {
    return { ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được giảm giá hoá đơn' }
  }

  const { error: rpcErr } = await supabase.rpc('pos_set_session_discount', {
    p_session_id: sessionId,
    p_type: d ? d.type : null,
    p_value: d ? d.value : 0,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true }
}

// Gộp bill: MỘT dòng giảm giá cho N mâm trong một giao dịch (VNĐ chia theo tiền hàng từng mâm, % áp từng mâm).
export async function setSessionsDiscount(sessionIds: string[], d: BillDiscount): Promise<SimpleResult> {
  const { operator, supabase, error } = await staffClient()
  if (!operator || !supabase) return { ok: false, error: error ?? 'Không có quyền' }
  if (!isPosRole(operator.role)) {
    return { ok: false, error: 'Chỉ chủ quán, quản lý hoặc thu ngân được giảm giá hoá đơn' }
  }
  if (sessionIds.length === 0) return { ok: false, error: 'Chưa chọn mâm nào' }

  const { error: rpcErr } = await supabase.rpc('pos_set_sessions_discount', {
    p_session_ids: sessionIds,
    p_type: d ? d.type : null,
    p_value: d ? d.value : 0,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  return { ok: true }
}

// ─── Dữ liệu in hoá đơn 80mm ────────────────────────────────────────────────
export type BillLine = {
  name: string
  quantity: number
  price: number
  line_total: number
  is_gift?: boolean | null
  /** Mig 098: dòng Bỏ/Tặng vẫn in (0đ) kèm lý do để khách biết vì sao tổng thấp hơn. */
  void_type?: 'cancelled' | 'gift' | null
  void_reason?: string | null
}
export type BillQtyChange = {
  name: string
  old_quantity: number
  new_quantity: number
  reason: string
  changed_at: string
}
export type BillSession = {
  session_id: string
  opened_at: string
  is_open_ordering: boolean
  tables: string
  subtotal: number
  items: BillLine[]
  /** Mig 098: lịch sử thu ngân sửa số lượng — in ra cho khách đối chiếu. */
  qty_changes?: BillQtyChange[]
  /** Mig 108: giảm giá cả bill của mâm này (đã tính sẵn ở server); thiếu = 0. subtotal vẫn là tiền hàng TRƯỚC giảm. */
  discount?: number
  /** Mig 108: "10%" khi giảm theo phần trăm; null khi giảm VNĐ hoặc không giảm. */
  discount_label?: string | null
}
export type SessionsBill = {
  store: { name: string; address: string | null; phone: string | null }
  printed_at: string
  sessions: BillSession[]
  /** Mig 108: tiền khách cần trả SAU giảm giá. */
  grand_total: number
  /** Mig 108: tổng giảm giá các mâm; server cũ không trả (coi như 0). */
  grand_discount?: number
  /** Mig 112a: các khoản đã thu của nhóm phiên (cộng theo phương tiện); chưa thu → []. Server cũ không trả. */
  payments?: PaymentLine[]
  /** Mig 112a: chỉ có khi nhóm phiên đúng MỘT khoản thu, không thì null. */
  cash_given?: number | null
  change_amount?: number | null
  /** Mig 123: khách ghi nợ của lần thu (dòng 'Ghi nợ — <tên>' trên hoá đơn); không có nợ → null. */
  debt_customer_name?: string | null
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
