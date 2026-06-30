import { supabase } from "../supabase";
import { CreateOrderRequest, Order, OrderState, OrderType, SessionOrder, TakeawayOrder, ServiceRequest } from "@/types/order.types";

export const orderService = {
  createOrder: async (req: CreateOrderRequest): Promise<Order> => {
    // Giá + tên tính phía server trong RPC create_order (không tin client gửi giá)
    const { data, error } = await supabase.rpc("create_order", {
      p_store_id: req.storeId,
      p_table_id: req.tableId ?? null,
      p_items: req.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
      p_payment_method: req.paymentMethod,
      p_zalo_user_id: req.zaloUserId ?? null,
      p_note: req.note ?? null,
      p_order_type: req.orderType ?? "dine_in",
      p_customer_name: req.customerName ?? null,
      p_customer_phone: req.customerPhone ?? null,
      p_delivery_address: req.deliveryAddress ?? null,
    });

    if (error || !data) throw error ?? new Error("Tạo đơn thất bại");

    return mapOrder(data as Record<string, unknown>);
  },

  abandonToCash: async (orderId: string, token: string): Promise<Order | null> => {
    // capability_token bắt buộc — chỉ chủ đơn mới chuyển được sang tiền mặt
    const { data, error } = await supabase.rpc("abandon_zalopay_to_cash", {
      p_order_id: orderId,
      p_token: token,
    });
    if (error) throw error;
    return data ? mapOrder(data as Record<string, unknown>) : null;
  },

  cancelOrder: async (orderId: string, token: string): Promise<void> => {
    // Huỷ qua RPC (anon UPDATE orders đã bị khoá) — chỉ huỷ đơn pending đúng token
    const { error } = await supabase.rpc("cancel_order", {
      p_order_id: orderId,
      p_token: token,
    });
    if (error) throw error;
  },

  confirmReceived: async (orderId: string, zaloUserId: string): Promise<void> => {
    // Khách bấm "Đã nhận" — guard bằng zalo_user_id trong RPC
    const { error } = await supabase.rpc("confirm_order_received", {
      p_order_id: orderId,
      p_zalo_user_id: zaloUserId,
    });
    if (error) throw error;
  },

  getOrderWithItems: async (orderId: string): Promise<Order> => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .single();

    if (error || !data) throw error ?? new Error("Không tìm thấy đơn hàng");

    return {
      ...mapOrder(data),
      items: (data.order_items ?? []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        menuItemId: item.menu_item_id as string | null,
        name: item.item_name as string,
        quantity: item.quantity as number,
        price: item.item_price as number,
        note: item.note as string | null,
        selectedToppings:
          (item.selected_toppings as {
            id: string;
            name: string;
            price: number;
          }[]) ?? [],
      })),
    };
  },
};

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    tableId: (row.table_id as string | null) ?? null,
    status: row.status as Order["status"],
    totalAmount: row.total_amount as number,
    paymentMethod: row.payment_method as Order["paymentMethod"],
    zalopayTransId: (row.zalopay_trans_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    capabilityToken: (row.capability_token as string | null) ?? null,
    orderType: (row.order_type as Order["orderType"]) ?? "dine_in",
    customerName: (row.customer_name as string | null) ?? null,
    customerPhone: (row.customer_phone as string | null) ?? null,
    pickupTime: (row.pickup_time as string | null) ?? null,
    deliveryAddress: (row.delivery_address as string | null) ?? null,
    readyAt: (row.ready_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

export const sessionOrderService = {
  getSessionOrders: async (
    zaloUserId: string,
    tableId: string,
  ): Promise<SessionOrder[]> => {
    const { data, error } = await supabase.rpc("get_session_orders", {
      p_zalo_user_id: zaloUserId,
      p_table_id: tableId,
    });
    if (error) throw error;
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      storeId: row.store_id as string,
      tableId: row.table_id as string,
      status: row.status as OrderState,
      totalAmount: row.total_amount as number,
      paymentMethod: row.payment_method as "zalopay" | "cash",
      note: (row.note as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  },

  getTakeawayOrders: async (
    zaloUserId: string,
    storeId: string,
  ): Promise<TakeawayOrder[]> => {
    const { data, error } = await supabase.rpc("get_takeaway_orders", {
      p_zalo_user_id: zaloUserId,
      p_store_id: storeId,
    });
    if (error) throw error;
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      storeId: row.store_id as string,
      status: row.status as OrderState,
      totalAmount: row.total_amount as number,
      paymentMethod: row.payment_method as "zalopay" | "cash",
      note: (row.note as string | null) ?? null,
      orderType: row.order_type as OrderType,
      customerName: (row.customer_name as string | null) ?? null,
      deliveryAddress: (row.delivery_address as string | null) ?? null,
      readyAt: (row.ready_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  },

  callStaff: async (req: ServiceRequest): Promise<void> => {
    const { error } = await supabase.from("service_requests").insert({
      store_id: req.storeId,
      table_id: req.tableId,
      table_number: req.tableNumber,
      type: req.type,
    });
    if (error) throw error;
  },
};
