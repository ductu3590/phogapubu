import { createClient } from '@/lib/supabase/server'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import VouchersClient from './vouchers-client'

export default async function VouchersPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()
  const { data: vouchers } = await supabase
    .from('vouchers')
    .select('id, code, kind, label, discount_type, discount_value, max_discount, zalo_user_id, daily_limit, expires_at, is_active, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  // Lịch sử dùng: các đơn đã áp voucher (chưa huỷ), mới nhất trước
  const ids = (vouchers ?? []).map((v) => v.id)
  const { data: usedOrders } = ids.length
    ? await supabase
        .from('orders')
        .select('id, voucher_id, discount_amount, total_amount, status, created_at')
        .in('voucher_id', ids)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">🎟️ Ưu đãi</h1>
        <p className="text-sm text-gray-500">
          Mã shipper (khoá theo Zalo của shipper) và mã vòng quay khách đã trúng.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <VouchersClient
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          vouchers={(vouchers as any[]) ?? []}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          usedOrders={(usedOrders as any[]) ?? []}
        />
      </div>
    </div>
  )
}
