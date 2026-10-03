import { Check, Gift } from 'lucide-react'
import { ORDER_STATUS_TONE, STATUS_TONE_CLASSES } from '@/components/ui/status'
import { getButtonClasses } from '@/components/ui/button-classes'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatVND } from '@/lib/utils'
import { confirmManualPayment, completeOrder, cancelOrder } from '@/lib/actions/orders'
import { redeemSpin } from '@/lib/actions/spin'
import { DatePicker } from './date-picker'
import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { redirect } from 'next/navigation'
import { hasRealMoney, isAwaitingPayment } from '@/lib/revenue'
import { paymentBadge } from '@/lib/order-payment-badge'
import { orderTags } from '@/lib/order-tags'
import OrdersRealtime from './orders-realtime'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ', confirmed: 'Xác nhận', cooking: 'Đang làm',
  ready: 'Xong', paid: 'Đã TT', cancelled: 'Huỷ',
}
// Màu trạng thái đơn lấy từ bảng chung (components/ui/status.ts) — không màn nào tự chọn màu.
const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(ORDER_STATUS_TONE).map(([status, tone]) => [status, STATUS_TONE_CLASSES[tone].badge]),
)

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; unpaid?: string }>
}) {
  const { date, unpaid } = await searchParams
  const showUnpaidOnly = unpaid === '1'
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')
  const storeId = operator.storeId

  const supabase = await createClient()

  // Lazy-quét huỷ đơn khách online 'pending' bỏ dở > 30' (item 1) — không chặn trang nếu lỗi.
  await supabase.rpc('sweep_abandoned_orders', { p_store_id: storeId }).then(
    () => {},
    () => {},
  )

  // Lọc theo ngày (mặc định hôm nay)
  const selectedDate = date ?? new Date().toISOString().slice(0, 10)
  const dayStart = new Date(selectedDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(selectedDate)
  dayEnd.setHours(23, 59, 59, 999)

  const { data: orders } = await supabase
    .from('orders')
    .select('*, order_items(*), tables(table_number), vouchers(code)')
    .eq('store_id', storeId)
    .gte('created_at', dayStart.toISOString())
    .lte('created_at', dayEnd.toISOString())
    .order('created_at', { ascending: false })

  const fullList = orders ?? []
  const unpaidCount = fullList.filter(isAwaitingPayment).length
  // Filter "chưa thu": chỉ đơn tiền mặt/chuyển khoản chưa xác nhận nhận tiền.
  const list = showUnpaidOnly ? fullList.filter(isAwaitingPayment) : fullList

  // Kết quả vòng quay cho các đơn hiển thị (badge + nút "Đã đổi thưởng")
  const orderIds = list.map((o) => o.id)
  const { data: spinResults } = orderIds.length
    ? await supabase
        .from('spin_results')
        .select('order_id, id, reward_label, reward_type, status')
        .in('order_id', orderIds)
    : { data: [] }
  const spinByOrder = new Map(
    (spinResults ?? []).map((s) => [s.order_id, s]),
  )
  // Doanh thu = tiền THẬT đã nhận — luật gộp về lib/revenue.ts, khớp SQL
  // get_daily_revenue (028 mục 9). Tính trên TOÀN BỘ đơn trong ngày (không phụ thuộc filter hiển thị).
  const totalRevenue = fullList.filter(hasRealMoney).reduce((s, o) => s + o.total_amount, 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tự làm mới khi có đơn/thanh toán thay đổi — không bắt F5 */}
      <OrdersRealtime storeId={storeId} />
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-surface px-4 py-4 md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Đơn hàng</h1>
            <p className="text-sm text-muted">
              {fullList.length} đơn • Doanh thu: {formatVND(totalRevenue)}
              {unpaidCount > 0 && <span className="text-warning"> • Chưa thu: {unpaidCount}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter "chưa thu" — chỉ đơn tiền mặt/chuyển khoản chưa xác nhận nhận tiền */}
            <Link
              href={showUnpaidOnly ? `/admin/orders?date=${selectedDate}` : `/admin/orders?date=${selectedDate}&unpaid=1`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                showUnpaidOnly
                  ? 'border-warning-border bg-warning-bg text-warning'
                  : 'border-border text-muted hover:bg-item-hover'
              }`}
            >
              {showUnpaidOnly ? '✓ Chưa thu' : 'Chưa thu'}
            </Link>
            {/* Date picker — phải là Client Component vì dùng onChange */}
            <DatePicker defaultValue={selectedDate} />
          </div>
        </div>
      </div>

      {/* Danh sách đơn */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {list.length === 0 && (
          <div className="flex h-40 items-center justify-center text-muted">
            Không có đơn nào ngày {selectedDate}
          </div>
        )}
        {list.map((order) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items = (order.order_items ?? []) as any[]
          const tableNumber = (order.tables as { table_number: string } | null)?.table_number ?? 'Bàn ?'
          const shortId = order.id.slice(-6).toUpperCase()
          const isCashUnpaid = isAwaitingPayment(order)
          const isActive = order.status !== 'paid' && order.status !== 'cancelled'

          return (
            <div key={order.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{tableNumber}</span>
                    <span className="text-sm text-muted">#{shortId}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-secondary'}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    {(() => {
                      const pay = paymentBadge(order.payment_method, hasRealMoney(order), !!order.session_id)
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pay.tone === 'received' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
                          {pay.label}
                        </span>
                      )
                    })()}
                  </div>
                  {/* Nhãn nguồn đơn (khách tự đặt / nhân viên đặt hộ) + loại đơn (tại bàn / mang về / ship) */}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {orderTags(order.order_source, order.order_type).map((tag) => (
                      <span
                        key={tag.label}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tag.tone === 'source'
                            ? 'bg-info-bg text-info'
                            : 'bg-background text-muted'
                        }`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className="flex-shrink-0 font-bold text-foreground">{formatVND(order.total_amount)}</p>
              </div>

              {/* Items */}
              <div className="mb-3 space-y-0.5">
                {items.map((item: {id: string; item_name: string; quantity: number; item_price: number}) => (
                  <p key={item.id} className="text-sm text-muted">
                    <span className="font-medium">×{item.quantity}</span> {item.item_name}
                    <span className="ml-1 text-muted">{formatVND(item.item_price * item.quantity)}</span>
                  </p>
                ))}
              </div>

              {order.discount_amount > 0 && (
                <p className="mb-3 text-sm text-success">
                  Giảm giá −{formatVND(order.discount_amount)}
                  {(order.vouchers as { code: string } | null)?.code &&
                    ` (mã ${(order.vouchers as { code: string }).code})`}
                </p>
              )}

              {order.note && (
                <p className="mb-3 text-[13px] text-muted italic">Ghi chú: {order.note}</p>
              )}

              {/* Kết quả vòng quay */}
              {(() => {
                const spin = spinByOrder.get(order.id)
                if (!spin) return null
                return (
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <Gift className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="flex-1 text-sm text-foreground/80">{spin.reward_label}</span>
                    {spin.reward_type === 'gift' && spin.status === 'won' && (
                      <form action={redeemSpin.bind(null, spin.id)}>
                        <button
                          type="submit"
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover"
                        >
                          Đã đổi thưởng
                        </button>
                      </form>
                    )}
                    {spin.status === 'redeemed' && (
                      <span className="text-xs font-medium text-success">✓ Đã đổi</span>
                    )}
                  </div>
                )
              })()}

              {/* Actions — đơn còn đang xử lý (chưa đóng/huỷ) */}
              {isActive && (
                <div className="flex flex-wrap gap-2">
                  {isCashUnpaid && (
                    <form action={confirmManualPayment.bind(null, order.id)}>
                      <button
                        type="submit"
                        className={getButtonClasses('outline')}
                      >
                        <Check className="size-4" aria-hidden />
                        Đã nhận tiền
                      </button>
                    </form>
                  )}
                  <form action={completeOrder.bind(null, order.id)}>
                    <button
                      type="submit"
                      className={getButtonClasses('primary')}
                    >
                      Hoàn tất
                    </button>
                  </form>
                  {/* Huỷ đơn: mọi đơn đang xử lý mà CHƯA nhận tiền thật — gồm cả đơn khách tự đặt
                      online bỏ dở ("Chờ thanh toán"), khỏi chờ tự huỷ 30'. Đơn đã có tiền KHÔNG
                      hiện nút này (huỷ đơn đã thu là lỗ đối soát — xử lý riêng nếu cần). */}
                  {!hasRealMoney(order) && (
                    <form action={cancelOrder.bind(null, order.id)}>
                      <button
                        type="submit"
                        className={getButtonClasses('danger')}
                      >
                        Huỷ đơn
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
