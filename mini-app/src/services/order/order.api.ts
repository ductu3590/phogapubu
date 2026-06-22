import { supabase } from "../supabase";
import { CreateOrderRequest, Order } from "@/types/order.types";

export const orderService = {
  createOrder: async (req: CreateOrderRequest): Promise<Order> => {
    // Giá + tên tính phía server trong RPC create_order (không tin client gửi giá)
    const { data, error } = await supabase.rpc("create_order", {
      p_store_id: req.storeId,
      p_table_id: req.tableId,
      p_items: req.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
      p_payment_method: req.paymentMethod,
      p_zalo_user_id: req.zaloUserId ?? null,
      p_note: req.note ?? null,
    });

    if (error || !data) throw error ?? new Error("Tạo đơn thất bại");

    return mapOrder(data as Record<string, unknown>);
  },

  cancelOrder: async (orderId: string): Promise<void> => {
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending"); // Chỉ cancel nếu chưa được confirm
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
      })),
    };
  },
};

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    tableId: row.table_id as string,
    status: row.status as Order["status"],
    totalAmount: row.total_amount as number,
    paymentMethod: row.payment_method as Order["paymentMethod"],
    zalopayTransId: (row.zalopay_trans_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
