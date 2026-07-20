// Kiểu + map dùng chung giữa loader (server) và client realtime của /staff/orders.

export type StaffOrder = {
  id: string
  tableNumber: string
  status: string
  paymentMethod: string
  paymentReceivedAt: string | null
  zalopayTransId: string | null
  totalAmount: number
  createdAt: string
  orderSource: string
  items: { id: string; name: string; quantity: number }[]
}

// Cột cần select cho một đơn (dùng cả ở loader lẫn khi fetch lại 1 đơn trong client).
export const STAFF_ORDER_SELECT =
  'id, status, payment_method, payment_received_at, zalopay_trans_id, total_amount, created_at, order_source, tables(table_number), order_items(id, item_name, quantity)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapStaffOrderRow(row: any): StaffOrder {
  return {
    id: row.id,
    tableNumber: (row.tables as { table_number: string } | null)?.table_number ?? 'Bàn ?',
    status: row.status,
    paymentMethod: row.payment_method,
    paymentReceivedAt: row.payment_received_at ?? null,
    zalopayTransId: row.zalopay_trans_id ?? null,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
    orderSource: row.order_source ?? 'customer_zalo',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (row.order_items ?? []).map((it: any) => ({ id: it.id, name: it.item_name, quantity: it.quantity })),
  }
}

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'cooking', 'ready']
