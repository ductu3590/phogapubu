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

// Hoàn tất đơn ("Hoàn tất & đã thu"): xác nhận đã nhận tiền (nếu là tiền mặt/chuyển khoản chưa thu)
// RỒI đóng đơn (status='paid') để nó rời khỏi "Đang xử lý" + màn bếp. Chỉ chủ quán.
// Đơn zalopay/đã thu thì bỏ qua bước xác nhận, chỉ đóng. Update qua client authenticated → RLS
// auth_update_orders (owner-only) gác, không dùng service role.
export async function completeOrder(orderId: string) {
  await requireStoreOwnerStoreId()
  const supabase = await createClient()

  const { data: order, error: readErr } = await supabase
    .from('orders')
    .select('payment_method, payment_received_at, status, bank_handoff_at, payment_instrument')
    .eq('id', orderId)
    .single()
  if (readErr || !order) throw new Error(`completeOrder(read): ${readErr?.message ?? 'không tìm thấy đơn'}`)
  if (order.status === 'cancelled') throw new Error('Đơn đã huỷ, không hoàn tất được')

  // Chưa thu tiền + đơn xác nhận tay được → ghi nhận đã nhận tiền (RPC idempotent, chỉ owner).
  // Gồm tiền mặt, CK nhân viên, và KHÁCH chuyển khoản (zalo_checkout đã sang app NH, không phải ví).
  const canConfirmManual =
    order.payment_method === 'cash' ||
    order.payment_method === 'bank_transfer' ||
    (order.payment_method === 'zalo_checkout' && order.payment_instrument !== 'wallet')
  if (canConfirmManual && !order.payment_received_at) {
    const { error: payErr } = await supabase.rpc('confirm_manual_payment', { p_order_id: orderId })
    if (payErr) throw new Error(`completeOrder(pay): ${payErr.message}`)
  }

  const { error: closeErr } = await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId)
  if (closeErr) throw new Error(`completeOrder(close): ${closeErr.message}`)

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
