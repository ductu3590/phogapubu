import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderSlip } from '@/app/print/order/print-order'
import { cleanStoreText } from './store-lines'

// Dựng dữ liệu phiếu bếp + phiếu bàn cho MỘT đơn (hoặc một lần in đặt trước).
// KHÔNG gọi requireOperator ở đây: trang /print/agent (Task 6) gọi hàm này mà không có cookie,
// bằng client mang JWT ngắn hạn của người tạo phiếu. Truy vấn đơn lọc theo storeId do CALLER truyền (đã kiểm
// quyền ở caller); nhánh đặt trước đối chiếu store_id RPC trả về với storeId. Không nhận con số nào từ query string.
// Lỗi DB ở bất kỳ truy vấn nào → {ok:false}: phần mềm in không có người nhìn, nên KHÔNG được biến lỗi mạng
// thành "Đơn không còn món" hay tạm tính 0đ. Riêng bảng `stores` giữ fallback (tên quán 'Quán').
// transient=true: lỗi đọc tạm thời (DB/mạng) — phiếu có thể in được nếu thử lại; không có cờ = lỗi vĩnh viễn.
type SlipResult = { ok: true; slip: OrderSlip } | { ok: false; error: string; transient?: true }

export async function loadOrderSlip(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  storeId: string,
  source: { orderId: string } | { preorderJobId: string },
): Promise<SlipResult> {
  // Phiếu preorder luôn lấy snapshot ở print job, không bao giờ query món hiện hành: khách có
  // thể đã sửa revision khác ngay sau lúc chủ quán bấm in.
  if ('preorderJobId' in source) {
    const { data, error } = await supabase.rpc('get_reservation_preorder_print_job', { p_print_job_id: source.preorderJobId })
    if (error) return { ok: false, error: error.message, transient: true }
    if (!data || typeof data !== 'object') return { ok: false, error: 'Không tìm thấy phiếu in của quán này.' }
    const printJob = data as { store_id?: string; kind: string; revision: number; snapshot: unknown; requested_at: string }
    // RPC chỉ kiểm quyền theo người gọi; đối chiếu quán để phiếu của quán khác không bao giờ ra máy in này
    if (printJob.store_id !== storeId) return { ok: false, error: 'Không tìm thấy phiếu in của quán này.' }
    const { data: store } = await supabase.from('stores').select('name, phone, address').eq('id', storeId).single()
    const snapshot = printJob.snapshot as {
      total_amount?: number
      note?: string | null
      items?: Array<{
        name?: string; item_name?: string; quantity: number; price?: number; item_price?: number
        note?: string | null; menu_item_id?: string | null
        toppings?: Array<{ name: string; price: number }>; selected_toppings?: Array<{ name: string; price: number }>
      }>
      table_numbers?: string[]
    }
    return {
      ok: true,
      slip: {
        storeName: store?.name ?? 'Quán', storePhone: cleanStoreText(store?.phone), storeAddress: cleanStoreText(store?.address),
        tableLabel: snapshot.table_numbers?.join(', ') || 'Chưa nhận khách', createdAt: printJob.requested_at as string,
        orderNote: snapshot.note ?? null, orderTotal: snapshot.total_amount ?? 0, sessionTotal: snapshot.total_amount ?? 0,
        orderSource: 'reservation_preorder', preorderPrintKind: printJob.kind as 'original' | 'adjustment' | 'reprint',
        preorderRevision: printJob.revision as number,
        // Snapshot không đổi nên chỉ số trong mảng là khoá ổn định của món.
        items: (snapshot.items ?? []).map((item, i) => ({
          key: String(i),
          menuItemId: item.menu_item_id ?? null,
          name: item.name ?? item.item_name ?? 'Món', quantity: item.quantity, price: item.price ?? item.item_price ?? 0,
          note: item.note ?? null, toppings: item.toppings ?? item.selected_toppings ?? [], isGift: false,
        })),
      },
    }
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, created_at, note, total_amount, session_id, table_id, order_source, status')
    .eq('id', source.orderId)
    .eq('store_id', storeId)
    .maybeSingle()
  if (orderErr) return { ok: false, error: orderErr.message, transient: true }

  if (!order) return { ok: false, error: 'Không tìm thấy đơn của quán này.' }
  // Đơn đã huỷ (vd. thu ngân bỏ bàn lúc phần mềm in mất mạng) thì không in phiếu bếp/bàn
  if (order.status === 'cancelled') return { ok: false, error: 'Đơn đã huỷ' }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, menu_item_id, item_name, quantity, item_price, note, selected_toppings, void_type')
    .eq('order_id', order.id)
  if (itemsErr) return { ok: false, error: itemsErr.message, transient: true }

  const { data: store } = await supabase
    .from('stores')
    .select('name, phone, address')
    .eq('id', storeId)
    .single()

  // Tên bàn: mâm chiếm nhiều bàn nên lấy qua session_tables, không chỉ mỗi table_id.
  let tableLabel = ''
  if (order.session_id) {
    const { data: rows, error: rowsErr } = await supabase
      .from('session_tables')
      .select('is_open, tables(table_number)')
      .eq('session_id', order.session_id)
    if (rowsErr) return { ok: false, error: rowsErr.message, transient: true }
    tableLabel = (rows ?? [])
      .filter((r: { is_open: boolean }) => r.is_open)
      .map((r: { tables: unknown }) => (r.tables as unknown as { table_number: string } | null)?.table_number ?? '')
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, 'vi', { numeric: true }))
      .join(', ')
  }
  if (!tableLabel && order.table_id) {
    const { data: t, error: tErr } = await supabase
      .from('tables')
      .select('table_number')
      .eq('id', order.table_id)
      .maybeSingle()
    if (tErr) return { ok: false, error: tErr.message, transient: true }
    tableLabel = t?.table_number ?? ''
  }

  // Tạm tính cả phiên để phiếu bàn nói được "từ đầu bữa tới giờ hết bao nhiêu".
  let sessionTotal = order.total_amount as number
  if (order.session_id) {
    const { data: sessionOrders, error: sessErr } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('session_id', order.session_id)
    if (sessErr) return { ok: false, error: sessErr.message, transient: true }
    sessionTotal = (sessionOrders ?? [])
      .filter((o: { status: string }) => o.status !== 'cancelled')
      .reduce((n: number, o: { total_amount: number }) => n + o.total_amount, 0)
  }

  return {
    ok: true,
    slip: {
      storeName: store?.name ?? 'Quán',
      storePhone: cleanStoreText(store?.phone),
      storeAddress: cleanStoreText(store?.address),
      tableLabel: tableLabel || '—',
      createdAt: order.created_at as string,
      orderNote: (order.note as string | null) ?? null,
      orderTotal: order.total_amount as number,
      sessionTotal,
      orderSource: (order.order_source as string) ?? 'customer_zalo',
      // Món "Khách bỏ" không được in lại; món tặng vẫn hiện để đối chiếu nhưng giá bằng 0đ.
      items: (items ?? [])
        .filter((it: { void_type: string | null }) => it.void_type !== 'cancelled')
        .map((it: {
          id: string; menu_item_id: string | null; item_name: string; quantity: number; item_price: number
          note: string | null; void_type: string | null; selected_toppings: unknown
        }) => ({
          key: it.id,
          menuItemId: it.menu_item_id ?? null,
          name: it.item_name,
          quantity: it.quantity,
          price: it.item_price,
          note: it.note ?? null,
          isGift: it.void_type === 'gift',
          toppings: Array.isArray(it.selected_toppings) ? (it.selected_toppings as { name: string; price: number }[]) : [],
        })),
    },
  }
}
