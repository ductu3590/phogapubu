export type OrderState =
  | "pending"
  | "confirmed"
  | "cooking"
  | "ready"
  | "paid"
  | "cancelled";

export interface OrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  price: number;
  note?: string | null;
}

export interface Order {
  id: string;
  storeId: string;
  tableId: string;
  status: OrderState;
  totalAmount: number;
  paymentMethod: "zalopay" | "cash";
  zalopayTransId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  // Token năng lực (Plan 2): cấp khi tạo đơn, cần để huỷ / đổi sang tiền mặt
  capabilityToken: string | null;
  items?: OrderItem[];
}

export interface CreateOrderRequest {
  storeId: string;
  tableId: string;
  items: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    note?: string;
  }[];
  note?: string;
  paymentMethod: "zalopay" | "cash";
  zaloUserId?: string;
}
