import { createAdminClient } from '@/lib/supabase/server'
import { formatVND } from '@/lib/utils'
import Link from 'next/link'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'

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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Doanh thu hôm nay"
          value={formatVND(Number(s.total_revenue))}
          icon="💰"
          color="bg-green-50 text-green-700"
        />
        <StatCard
          label="Tổng đơn hôm nay"
          value={String(s.total_orders)}
          icon="📋"
          color="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="Đang xử lý"
          value={String(activeOrders.length)}
          icon="🍳"
          color="bg-orange-50 text-orange-700"
        />
        <StatCard
          label="Tiền mặt chờ thu"
          value={String(s.cash_pending)}
          icon="💵"
          color="bg-yellow-50 text-yellow-700"
        />
      </div>

      {/* Shortcut buttons */}
      <h2 className="mb-3 text-base font-semibold text-gray-700">Truy cập nhanh</h2>
      <div className="grid grid-cols-3 gap-3">
        <ShortcutCard href="/admin/menu" icon="🍽️" label="Quản lý menu" desc="Thêm/sửa món, bật tắt hết hàng" />
        <ShortcutCard href="/admin/tables" icon="🪑" label="Bàn & QR" desc="Tạo bàn, tải QR in dán" />
        <ShortcutCard href="/admin/orders" icon="📋" label="Đơn hàng" desc="Xem đơn, xác nhận tiền mặt" />
      </div>

      {/* Đơn đang active */}
      {activeOrders.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-700">Đơn đang xử lý ({activeOrders.length})</h2>
            <Link href="/admin/orders" className="text-sm text-orange-500 hover:underline">Xem tất cả →</Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {activeOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">
                    #{(order.id as string).slice(-6).toUpperCase()}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(order.created_at as string).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">{formatVND(Number(order.total_amount))}</span>
                  <StatusBadge status={order.status as string} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const [bg, text] = color.split(' ')
  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className="mb-2 text-2xl">{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className={`mt-1 text-xs font-medium ${text}`}>{label}</p>
    </div>
  )
}

function ShortcutCard({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-orange-200 hover:shadow-sm"
    >
      <span className="text-2xl">{icon}</span>
      <p className="font-semibold text-gray-800">{label}</p>
      <p className="text-xs text-gray-400">{desc}</p>
    </Link>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    cooking: 'bg-orange-100 text-orange-700',
    ready: 'bg-green-100 text-green-700',
    paid: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }
  const labelMap: Record<string, string> = {
    pending: 'Chờ', confirmed: 'Xác nhận', cooking: 'Đang làm',
    ready: 'Xong', paid: 'Đã TT', cancelled: 'Huỷ',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}
