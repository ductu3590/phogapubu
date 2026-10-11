import { createClient } from '@/lib/supabase/server'
import { requireAdminPageOrRedirect } from '@/lib/auth/operator'
import VouchersClient from './vouchers-client'
import SpinClient from './spin-client'

// Trang gộp Ưu đãi + Vòng quay (2026-10-11): mã giảm giá bên trái, cấu hình vòng quay bên phải.
export default async function VouchersPage() {
  const operator = await requireAdminPageOrRedirect('owner')
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

  const { data: store } = await supabase
    .from('stores')
    .select('spin_enabled')
    .eq('id', storeId)
    .single()
  const { data: rewards } = await supabase
    .from('spin_rewards')
    .select('id, label, type, weight, is_active, sort_order, discount_type, discount_value, max_discount, voucher_days')
    .eq('store_id', storeId)
    .order('sort_order')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-bold text-foreground">Ưu đãi &amp; Vòng quay</h1>
        <p className="text-sm text-muted">
          Mã shipper (khoá theo Zalo của shipper) và mã vòng quay khách đã trúng. Vòng quay cho khách quay 1 lần/đơn sau khi thanh toán.
        </p>
      </div>
      <div className="@container flex-1 overflow-y-auto bg-background p-4 md:p-6">
        <div className="mx-auto grid max-w-[1400px] items-start gap-5 @6xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label="Mã giảm giá">
            <VouchersClient
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              vouchers={(vouchers as any[]) ?? []}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              usedOrders={(usedOrders as any[]) ?? []}
            />
          </section>
          <section aria-label="Vòng quay may mắn">
            <SpinClient
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              enabled={(store as any)?.spin_enabled ?? false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              initialRewards={(rewards as any[]) ?? []}
            />
          </section>
        </div>
      </div>
    </div>
  )
}
