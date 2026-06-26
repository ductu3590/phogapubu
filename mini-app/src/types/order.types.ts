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
}

export interface Order {
  id: string;
  storeId: string;
  tableId: string | null;
  status: OrderState;
  totalAmount: number;
  paymentMethod: "zalopay" | "cash";
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
  items?: OrderItem[];
}

export interface CreateOrderRequest {
  storeId: string;
  tableId: string | null;
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
  orderType?: OrderType;
  customerName?: string;
  customerPhone?: string;
  pickupTime?: string;
  deliveryAddress?: string;
}

export interface SessionOrder {
  id: string;
  storeId: string;
  tableId: string;
  status: OrderState;
  totalAmount: number;
  paymentMethod: "zalopay" | "cash";
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRequest {
  storeId: string;
  tableId: string;
  tableNumber: string;
  type: "payment" | "help";
}
