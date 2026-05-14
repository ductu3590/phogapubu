'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Đánh dấu đơn tiền mặt đã thanh toán
export async function markOrderPaid(orderId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('orders')
    .update({ status: 'paid' })
    .eq('id', orderId)
  if (error) throw new Error(`markOrderPaid: ${error.message}`)
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
