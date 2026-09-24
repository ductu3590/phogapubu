import { requireOperatorOrRedirect } from '@/lib/auth/operator'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrintOrder, { type OrderSlip } from './print-order'

// Hai liên cho MỘT đơn khách vừa gọi: phiếu bếp (không giá) + phiếu bàn (có giá, có ô tick).
// Số liệu đọc thẳng từ DB qua phiên đăng nhập của chủ quán — RLS auth_read_orders (mig 019)
// đã khoá theo đúng quán, và KHÔNG nhận bất kỳ con số nào từ query string.
export default async function PrintOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; job?: string }>
}) {
  const operator = await requireOperatorOrRedirect()
  if (operator.role !== 'store_owner') redirect('/mevo')

  const { id, job } = await searchParams
  if (!id && !job) return <p className="p-6 text-sm text-red-600">Thiếu mã đơn.</p>

  const supabase = await createClient()

  // Phiếu preorder luôn lấy snapshot ở print job, không bao giờ query món hiện hành: khách có
  // thể đã sửa revision khác ngay sau lúc chủ quán bấm in.
  if (job) {
    const { data, error } = await supabase.rpc('get_reservation_preorder_print_job', { p_print_job_id: job })
    if (error || !data || typeof data !== 'object') return <p className="p-6 text-sm text-red-600">{error?.message ?? 'Không tìm thấy phiếu in của quán này.'}</p>
    const printJob = data as { kind: string; revision: number; snapshot: unknown; requested_at: string }
    const { data: store } = await supabase.from('stores').select('name, phone').eq('id', operator.storeId).single()
    const snapshot = printJob.snapshot as {
      total_amount?: number; note?: string | null; items?: Array<{ name?: string; item_name?: string; quantity: number; price?: number; item_price?: number; note?: string | null; toppings?: Array<{ name: string; price: number }>; selected_toppings?: Array<{ name: string; price: number }>}>
      table_numbers?: string[]
    }
    const slip: OrderSlip = {
      storeName: store?.name ?? 'Quán', storePhone: store?.phone ?? null,
      tableLabel: snapshot.table_numbers?.join(', ') || 'Chưa nhận khách', createdAt: printJob.requested_at as string,
      orderNote: snapshot.note ?? null, orderTotal: snapshot.total_amount ?? 0, sessionTotal: snapshot.total_amount ?? 0,
      orderSource: 'reservation_preorder', preorderPrintKind: printJob.kind as 'original' | 'adjustment' | 'reprint', preorderRevision: printJob.revision as number,
      items: (snapshot.items ?? []).map((item) => ({ name: item.name ?? item.item_name ?? 'Món', quantity: item.quantity, price: item.price ?? item.item_price ?? 0, note: item.note ?? null, toppings: item.toppings ?? item.selected_toppings ?? [], isGift: false })),
    }
    return <PrintOrder slip={slip} />
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, created_at, note, total_amount, session_id, table_id, order_source, status')
    .eq('id', id)
    .eq('store_id', operator.storeId)
    .maybeSingle()

  if (!order) return <p className="p-6 text-sm text-red-600">Không tìm thấy đơn của quán này.</p>

  const { data: items } = await supabase
    .from('order_items')
    .select('id, item_name, quantity, item_price, note, selected_toppings, void_type')
    .eq('order_id', order.id)

  const { data: store } = await supabase
    .from('stores')
    .select('name, phone')
    .eq('id', operator.storeId)
    .single()

  // Tên bàn: mâm chiếm nhiều bàn nên lấy qua session_tables, không chỉ mỗi table_id.
  let tableLabel = ''
  if (order.session_id) {
    const { data: rows } = await supabase
      .from('session_tables')
      .select('is_open, tables(table_number)')
      .eq('session_id', order.session_id)
    tableLabel = (rows ?? [])
      .filter((r) => r.is_open)
      .map((r) => (r.tables as unknown as { table_number: string } | null)?.table_number ?? '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
      .join(', ')
  }
  if (!tableLabel && order.table_id) {
    const { data: t } = await supabase
      .from('tables')
      .select('table_number')
      .eq('id', order.table_id)
      .maybeSingle()
    tableLabel = t?.table_number ?? ''
  }

  // Tạm tính cả phiên để phiếu bàn nói được "từ đầu bữa tới giờ hết bao nhiêu".
  let sessionTotal = order.total_amount as number
  if (order.session_id) {
    const { data: sessionOrders } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('session_id', order.session_id)
    sessionTotal = (sessionOrders ?? [])
      .filter((o) => o.status !== 'cancelled')
      .reduce((n, o) => n + (o.total_amount as number), 0)
  }

  const slip: OrderSlip = {
    storeName: store?.name ?? 'Quán',
    storePhone: store?.phone ?? null,
    tableLabel: tableLabel || '—',
    createdAt: order.created_at as string,
    orderNote: (order.note as string | null) ?? null,
    orderTotal: order.total_amount as number,
    sessionTotal,
    orderSource: (order.order_source as string) ?? 'customer_zalo',
    // Món "Khách bỏ" không được in lại; món tặng vẫn hiện để đối chiếu nhưng giá bằng 0đ.
    items: (items ?? []).filter((it) => it.void_type !== 'cancelled').map((it) => ({
      name: it.item_name as string,
      quantity: it.quantity as number,
      price: it.item_price as number,
      note: (it.note as string | null) ?? null,
      isGift: it.void_type === 'gift',
      toppings: Array.isArray(it.selected_toppings)
        ? (it.selected_toppings as { name: string; price: number }[])
        : [],
    })),
  }

  return <PrintOrder slip={slip} />
}
