export type OrderState =
  | "pending"
  | "confirmed"
  | "cooking"
  | "ready"
  | "paid"
  | "cancelled";

export type OrderType = "dine_in" | "pickup" | "delivery";

export interface OrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  price: number;
  note?: string | null;
  selectedToppings: { id: string; name: string; price: number }[];
}

export interface Order {
  id: string;
  storeId: string;
  tableId: string | null;
  status: OrderState;
  totalAmount: number;
  discountAmount: number;
  paymentMethod: "zalo_checkout" | "cash";
  zalopayTransId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  // Token năng lực (Plan 2): cấp khi tạo đơn, cần để huỷ / đổi sang tiền mặt
  capabilityToken: string | null;
  orderType: OrderType;
  customerName: string | null;
  customerPhone: string | null;
  pickupTime: string | null;
  deliveryAddress: string | null;
  // Đơn mang về: mốc bếp báo xong + mốc khách đã nhận / tự hoàn thành
  readyAt: string | null;
  completedAt: string | null;
  items?: OrderItem[];
}

// ─── Phiên bàn (quán trả sau, mig 039) ──────────────────────────────────────
// Trạng thái phiên do RPC get_table_session_state trả về.
//   free   — bàn trống, phiên sẽ mở khi đơn đầu tiên được tạo
//   owner  — máy này là chủ phiên (hoặc phiên chưa có chủ) → gọi món bình thường
//   locked — bàn đang có khách KHÁC gọi món → chặn đặt, mời gọi nhân viên
// ⚠️ Chỉ là LỚP HIỂN THỊ. Chốt chặn thật nằm trong create_order (client luôn có thể là bản cũ).
export type TableSessionState =
  | { mode: "prepay" }
  | { mode: "postpay"; state: "free" }
  | { mode: "postpay"; state: "locked"; opened_at: string }
  | {
      mode: "postpay";
      state: "owner";
      session_id: string;
      opened_at: string;
      order_count: number;
      total: number;
      // mig 040 — mâm đoàn: phiên chiếm nhiều bàn và KHÔNG khoá chủ phiên
      is_open_ordering?: boolean;
      table_names?: string;
    };

export interface TableSessionBillItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  toppings: { id: string; name: string; price: number }[] | null;
}

export interface TableSessionBillOrder {
  id: string;
  status: OrderState;
  created_at: string;
  total_amount: number;
  order_source: string;
  payment_received_at: string | null;
  items: TableSessionBillItem[];
}

export type TableSessionBill =
  | { found: false }
  | {
      found: true;
      session_id: string;
      opened_at: string;
      total: number;
      orders: TableSessionBillOrder[];
    };

export interface CreateOrderRequest {
  storeId: string;
  tableId: string | null;
  items: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    note?: string;
    toppingIds?: string[];
  }[];
  note?: string;
  paymentMethod: "zalo_checkout" | "cash";
  zaloUserId?: string;
  orderType?: OrderType;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  voucherCode?: string;
  // Chân định danh thứ hai cho phiên bàn trả sau (PB5) — xem services/device-id.ts
  deviceId?: string;
}

export interface SessionOrder {
  id: string;
  storeId: string;
  tableId: string;
  status: OrderState;
  totalAmount: number;
  paymentMethod: "zalo_checkout" | "cash";
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// Đơn mang về hiển thị ở tab "Đơn hàng" (chế độ takeaway) — lịch sử 30 ngày
export interface TakeawayOrder {
  id: string;
  storeId: string;
  status: OrderState;
  totalAmount: number;
  paymentMethod: "zalo_checkout" | "cash";
  note: string | null;
  orderType: OrderType;
  customerName: string | null;
  deliveryAddress: string | null;
  readyAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequest {
  storeId: string;
  tableId: string;
  tableNumber: string;
  type: "payment" | "help";
}
