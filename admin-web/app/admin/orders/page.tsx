import { createClient } from '@/lib/supabase/server'
import { formatVND } from '@/lib/utils'
import { markOrderPaid, cancelOrder } from '@/lib/actions/orders'
import { DatePicker } from './date-picker'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ', confirmed: 'Xác nhận', cooking: 'Đang làm',
  ready: 'Xong', paid: 'Đã TT', cancelled: 'Huỷ',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  cooking: 'bg-orange-100 text-orange-700',
  ready: 'bg-green-100 text-green-700',
  paid: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-500',
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const storeIdMeta: string | undefined = user.user_metadata?.store_id
  let storeId = storeIdMeta
  if (!storeId) {
    const { data } = await supabase.from('stores').select('id').eq('is_active', true).limit(1).single()
    storeId = data?.id
  }
  if (!storeId) return <p className="p-6 text-gray-400">Chưa có quán nào.</p>

  // Lọc theo ngày (mặc định hôm nay)
  const selectedDate = date ?? new Date().toISOString().slice(0, 10)
  const dayStart = new Date(selectedDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(selectedDate)
  dayEnd.setHours(23, 59, 59, 999)

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*), tables(table_number)')
    .eq('store_id', storeId)
    .gte('created_at', dayStart.toISOString())
    .lte('created_at', dayEnd.toISOString())
    .order('created_at', { ascending: false })

  const list = orders ?? []
  // Doanh thu = tiền THẬT đã nhận: ZaloPay đã có trans_id (chưa huỷ) HOẶC tiền mặt đã thu
  const isReceived = (o: { payment_method: string; zalopay_trans_id: string | null; status: string }) =>
    (o.payment_method === 'zalopay' && !!o.zalopay_trans_id && o.status !== 'cancelled') ||
    (o.payment_method === 'cash' && o.status === 'paid')
  const totalRevenue = list.filter(isReceived).reduce((s, o) => s + o.total_amount, 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">📋 Đơn hàng</h1>
            <p className="text-sm text-gray-500">{list.length} đơn • Doanh thu: {formatVND(totalRevenue)}</p>
          </div>
          {/* Date picker — phải là Client Component vì dùng onChange */}
          <DatePicker defaultValue={selectedDate} />
        </div>
      </div>

      {/* Danh sách đơn */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {list.length === 0 && (
          <div className="flex h-40 items-center justify-center text-gray-400">
            Không có đơn nào ngày {selectedDate}
          </div>
        )}
        {list.map((order) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items = (order.order_items ?? []) as any[]
          const tableNumber = (order.tables as { table_number: string } | null)?.table_number ?? 'Bàn ?'
          const shortId = order.id.slice(-6).toUpperCase()
          const isCashUnpaid = order.payment_method === 'cash' && !['paid', 'cancelled'].includes(order.status)

          return (
            <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{tableNumber}</span>
                    <span className="text-sm text-gray-400">#{shortId}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100'}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    {order.payment_method === 'cash' && (
                      <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-xs text-yellow-600">💵 Tiền mặt</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className="flex-shrink-0 font-bold text-gray-900">{formatVND(order.total_amount)}</p>
              </div>

              {/* Items */}
              <div className="mb-3 space-y-0.5">
                {items.map((item: {id: string; item_name: string; quantity: number; item_price: number}) => (
                  <p key={item.id} className="text-sm text-gray-600">
                    <span className="font-medium">×{item.quantity}</span> {item.item_name}
                    <span className="ml-1 text-gray-400">{formatVND(item.item_price * item.quantity)}</span>
                  </p>
                ))}
              </div>

              {order.note && (
                <p className="mb-3 text-xs text-gray-500 italic">📝 {order.note}</p>
              )}

              {/* Actions */}
              {isCashUnpaid && (
                <div className="flex gap-2">
                  <form action={markOrderPaid.bind(null, order.id)}>
                    <button
                      type="submit"
                      className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
                    >
                      ✓ Đã thanh toán
                    </button>
                  </form>
                  <form action={cancelOrder.bind(null, order.id)}>
                    <button
                      type="submit"
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
                    >
                      Huỷ đơn
                    </button>
                  </form>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
