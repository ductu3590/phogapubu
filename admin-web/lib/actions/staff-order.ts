'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOperator } from '@/lib/auth/operator'

export type StaffOrderItem = {
  menu_item_id: string
  quantity: number
  topping_ids: string[]
  note: string | null
}

export type CreateStaffOrderInput = {
  tableId: string
  items: StaffOrderItem[]
  paymentMethod: 'cash' | 'bank_transfer'
  clientRequestId: string
  note: string | null
}

export type CreateStaffOrderResult =
  | { ok: true; orderId: string; total: number }
  | { ok: false; error: string }

// Đặt món hộ: gọi RPC staff_create_order (SECURITY DEFINER) BẰNG phiên đăng nhập của nhân viên
// (createClient dùng cookie → JWT → auth.uid()). RPC tự suy store_id từ operator, tính giá từ DB,
// idempotent theo client_request_id → không tin gì từ client. Trả { ok } thay vì throw để UI xử lý mượt.
export async function createStaffOrder(input: CreateStaffOrderInput): Promise<CreateStaffOrderResult> {
  const operator = await requireOperator()
  if (operator.role !== 'store_staff' && operator.role !== 'store_owner') {
    return { ok: false, error: 'Không có quyền đặt món hộ' }
  }
  if (!input.tableId) return { ok: false, error: 'Chưa chọn bàn' }
  if (!input.items.length) return { ok: false, error: 'Giỏ hàng đang trống' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_create_order', {
    p_table_id: input.tableId,
    p_items: input.items,
    p_payment_method: input.paymentMethod,
    p_client_request_id: input.clientRequestId,
    p_note: input.note,
  })
  if (error) return { ok: false, error: error.message }

  const res = data as { order_id: string; total: number }
  return { ok: true, orderId: res.order_id, total: res.total }
}
