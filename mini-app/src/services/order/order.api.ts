import { supabase } from "../supabase";
import { CreateOrderRequest, Order } from "@/types/order.types";

export const orderService = {
  createOrder: async (req: CreateOrderRequest): Promise<Order> => {
    const totalAmount = req.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // 1. Tạo đơn hàng trong Supabase
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        store_id: req.storeId,
        table_id: req.tableId,
        total_amount: totalAmount,
        zalo_user_id: req.zaloUserId ?? null,
        note: req.note ?? null,
        payment_method: req.paymentMethod,
        status: "pending",
      })
      .select()
      .single();

    if (orderError || !order) throw orderError ?? new Error("Tạo đơn thất bại");

    // 2. Snapshot tên + giá vào order_items (bảo vệ khi menu thay đổi)
    const { error: itemsError } = await supabase.from("order_items").insert(
      req.items.map((item) => ({
        order_id: order.id,
        menu_item_id: item.menuItemId,
        item_name: item.name,
        item_price: item.price,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
    );

    if (itemsError) throw itemsError;

    return mapOrder(order);
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
