import { createAdminClient } from '@/lib/supabase/server'
import { formatVND } from '@/lib/utils'
import Link from 'next/link'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import { completeOrder } from '@/lib/actions/orders'
import { Banknote, ChefHat, Check, ClipboardList, QrCode, UtensilsCrossed, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getButtonClasses } from '@/components/ui/button-classes'
import { Card, PageHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { orderStatusTone } from '@/components/ui/status'
import { cn } from '@/lib/utils'

export default async function DashboardPage() {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // Dùng DB function để tính stats — 1 query thay vì filter trên app
  const { data: stats } = await admin.rpc('get_daily_revenue', {
    p_store_id: storeId,
    p_date: today,
  })
  const s = stats?.[0] ?? { total_revenue: 0, total_orders: 0, paid_orders: 0, cash_pending: 0 }

  // Lấy đơn đang xử lý (để hiện danh sách)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data: activeOrdersRaw } = await admin
    .from('orders')
    .select('id, status, total_amount, payment_method, created_at')
    .eq('store_id', storeId)
    .in('status', ['pending', 'confirmed', 'cooking', 'ready'])
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  const activeOrders = activeOrdersRaw ?? []

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
        <PageHeader
          title="Dashboard"
          description={new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        />

        {/* Số liệu trong ngày — thẻ trắng, icon trung tính; màu chỉ dùng khi có việc cần làm */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Doanh thu hôm nay" value={formatVND(Number(s.total_revenue))} icon={<Wallet />} />
          <StatCard label="Tổng đơn hôm nay" value={String(s.total_orders)} icon={<ClipboardList />} />
          <StatCard label="Đang xử lý" value={String(activeOrders.length)} icon={<ChefHat />} attention={activeOrders.length > 0} />
          <StatCard label="Tiền mặt chờ thu" value={String(s.cash_pending)} icon={<Banknote />} attention={Number(s.cash_pending) > 0} />
        </div>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Truy cập nhanh</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ShortcutCard href="/admin/menu" icon={<UtensilsCrossed />} label="Quản lý menu" desc="Thêm/sửa món, bật tắt hết hàng" />
            <ShortcutCard href="/admin/tables" icon={<QrCode />} label="Bàn & QR" desc="Tạo bàn, tải QR in dán" />
            <ShortcutCard href="/admin/orders" icon={<ClipboardList />} label="Đơn hàng" desc="Xem đơn, xác nhận tiền mặt" />
          </div>
        </section>

        <Card
          title={`Đơn đang xử lý (${activeOrders.length})`}
          action={<Link href="/admin/orders" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">Xem tất cả</Link>}
          flush
        >
          {activeOrders.length === 0 ? (
            <EmptyState>Chưa có đơn nào đang xử lý hôm nay.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {activeOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-medium text-foreground">
                      #{(order.id as string).slice(-6).toUpperCase()}
                    </span>
                    <span className="ml-2 text-[13px] text-muted tabular">
                      {new Date(order.created_at as string).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground tabular">{formatVND(Number(order.total_amount))}</span>
                    <Badge tone={orderStatusTone(order.status as string)}>{STATUS_LABEL[order.status as string] ?? (order.status as string)}</Badge>
                    {/* Hoàn tất & đã thu: đóng đơn treo (xác nhận tiền nếu chưa thu) */}
                    <form action={completeOrder.bind(null, order.id as string)}>
                      <button type="submit" className={getButtonClasses('outline')}>
                        <Check className="size-4" aria-hidden />
                        Hoàn tất
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ', confirmed: 'Xác nhận', cooking: 'Đang làm',
  ready: 'Xong', paid: 'Đã TT', cancelled: 'Huỷ',
}

function StatCard({ label, value, icon, attention = false }: { label: string; value: string; icon: React.ReactNode; attention?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4', attention ? 'border-warning-border' : 'border-border')}>
      <span className={cn('grid size-9 place-items-center rounded-lg [&>svg]:size-[18px]', attention ? 'bg-warning-bg text-warning' : 'bg-secondary text-muted')} aria-hidden>
        {icon}
      </span>
      <p className="mt-3 text-2xl font-semibold text-foreground tabular">{value}</p>
      <p className="mt-0.5 text-[13px] text-muted">{label}</p>
    </div>
  )
}

function ShortcutCard({ href, icon, label, desc }: { href: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted [&>svg]:size-[18px]" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
      </span>
    </Link>
  )
}
