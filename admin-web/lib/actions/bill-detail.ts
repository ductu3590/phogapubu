'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePosOperatorStoreId } from '@/lib/auth/operator'
import { parseBillDetail, type BillDetailOrder } from '@/lib/bill-detail'
import { cancelOrder, completeOrder, confirmManualPayment } from '@/lib/actions/orders'
import { redeemSpin } from '@/lib/actions/spin'
import { closeTableSession, closeTableSessionsBulk } from '@/lib/actions/table-session'

// Ngăn kéo "Xem bill" (A04-2) của trang Hoá đơn & Báo cáo.
// Gọi MỘT lần khi mở ngăn kéo / sau mỗi thao tác — KHÔNG poll bằng server action (bài học ST-3).
// Lỗi người dùng TRẢ {ok,error}, không ném: Next prod giấu nội dung lỗi ném (CLAUDE.md PA-4).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ORDERS = 200

export async function loadBillDetail(orderIds: string[]): Promise<{ ok: true; orders: BillDetailOrder[] } | { ok: false; error: string }> {
  let storeId: string
  try {
    storeId = await requirePosOperatorStoreId()
  } catch {
    return { ok: false, error: 'Chỉ chủ quán hoặc thu ngân mới xem được hoá đơn' }
  }
  const ids = Array.isArray(orderIds) ? orderIds.filter((x) => typeof x === 'string' && UUID.test(x)).slice(0, MAX_ORDERS) : []
  if (ids.length === 0) return { ok: true, orders: [] }

  // Client đăng nhập (RLS) + lọc store_id — không dùng service key cho việc đọc.
  const supabase = await createClient()
  const [orders, spins] = await Promise.all([
    supabase
      .from('orders')
      .select(`id, status, total_amount, discount_amount, payment_method, payment_instrument, payment_received_at,
        zalopay_trans_id, bank_handoff_at, session_id, order_source, order_type, created_at, note, customer_name,
        customer_phone, delivery_address, rejected_at, rejection_reason_code, rejection_reason_note,
        tables(table_number), vouchers(code),
        order_items(id, item_name, item_price, quantity, selected_toppings, void_type, void_reason, note)`)
      .in('id', ids)
      .eq('store_id', storeId)
      .order('created_at', { ascending: true }),
    supabase.from('spin_results').select('id, order_id, reward_label, reward_type, status').in('order_id', ids).eq('store_id', storeId),
  ])
  if (orders.error) return { ok: false, error: orders.error.message }
  return { ok: true, orders: parseBillDetail(orders.data, spins.data) }
}

export type BillOrderAction = 'confirm' | 'complete' | 'cancel'

// Bọc 3 thao tác của trang Đơn hàng cũ. Quyền (chỉ chủ quán, đúng quán) do chính các hàm đó kiểm — giữ nguyên.
export async function runBillOrderAction(orderId: string, action: BillOrderAction): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof orderId !== 'string' || !UUID.test(orderId)) return { ok: false, error: 'Mã đơn không hợp lệ' }
  try {
    if (action === 'confirm') await confirmManualPayment(orderId)
    else if (action === 'complete') await completeOrder(orderId)
    else if (action === 'cancel') await cancelOrder(orderId)
    else return { ok: false, error: 'Thao tác không hợp lệ' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không thực hiện được, thử lại sau' }
  }
  revalidatePath('/admin/bills')
  return { ok: true }
}

export async function redeemBillSpin(resultId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof resultId !== 'string' || !UUID.test(resultId)) return { ok: false, error: 'Mã quà không hợp lệ' }
  try {
    await redeemSpin(resultId)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không đánh dấu được, thử lại sau' }
  }
  revalidatePath('/admin/bills')
  return { ok: true }
}

// Bàn trả sau: "Đã nhận tiền" = thu CẢ BÀN một lần rồi đóng bill (anh Tú 2026-10-13: quán chỉ thanh toán một lần
// trước khi khách về). Dùng lại NGUYÊN action thu tiền của POS → close_table_session(paid): ghi tiền mọi lượt chưa thu,
// chuyển đơn sang Hoàn tất (mig 085), đóng phiên. Chủ quán + thu ngân (như POS). Phiên hết hạn còn nợ cũng thu được.
export async function collectSessionBill(sessionIds: string[], instrument: 'cash' | 'bank'): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = Array.isArray(sessionIds) ? sessionIds.filter((x) => typeof x === 'string' && UUID.test(x)) : []
  if (ids.length === 0) return { ok: false, error: 'Không có bàn nào để thu' }
  if (instrument !== 'cash' && instrument !== 'bank') return { ok: false, error: 'Phương thức thanh toán không hợp lệ' }
  try {
    const res = ids.length === 1 ? await closeTableSession(ids[0], 'paid', instrument) : await closeTableSessionsBulk(ids, 'paid', instrument)
    if (!res.ok) return { ok: false, error: res.error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Không thu được, thử lại sau' }
  }
  revalidatePath('/admin/bills')
  return { ok: true }
}
