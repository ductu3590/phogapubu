'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireStoreOwnerStoreId } from '@/lib/auth/operator'
import { revalidatePath } from 'next/cache'

// Chủ quán xác nhận ĐÃ NHẬN TIỀN (tiền mặt / chuyển khoản) — gọi RPC confirm_manual_payment
// (SECURITY DEFINER): chỉ owner đúng quán, ghi payment_received_at + payment_received_by (audit),
// KHÔNG đổi orders.status (tiến độ bếp tách khỏi thanh toán — §4.3). Idempotent.
// Dùng client AUTHENTICATED để auth.uid() vào RPC — KHÔNG dùng service role như markOrderPaid cũ
// (bản cũ set status='paid' bằng service role, không kiểm quyền).
export async function confirmManualPayment(orderId: string) {
  await requireStoreOwnerStoreId() // fail-closed: chỉ chủ quán mới gọi được
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_manual_payment', { p_order_id: orderId })
  if (error) throw new Error(`confirmManualPayment: ${error.message}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin/dashboard')
}

// Huỷ đơn
export async function cancelOrder(orderId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)
  if (error) throw new Error(`cancelOrder: ${error.message}`)
  revalidatePath('/admin/orders')
  revalidatePath('/admin/dashboard')
}
