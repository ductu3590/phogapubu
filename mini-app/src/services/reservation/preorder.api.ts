import { supabase } from "@/services/supabase";
import type { ReservationAccess, ReservationPreorderBatch } from "@/types/reservation.types";

type Item = { productId: string; quantity: number; note?: string | null; variantId?: string | null; toppingIds?: string[] };
type Row = Record<string, unknown>;
const map = (row: Row): ReservationPreorderBatch => ({
  orderId: String(row.order_id), revision: Number(row.revision), releasedRevision: Number(row.released_revision ?? 0), status: String(row.status), totalAmount: Number(row.total_amount), note: typeof row.note === "string" ? row.note : null, editDeadline: String(row.edit_deadline ?? ""), canEdit: Boolean(row.can_edit), canCancel: Boolean(row.can_cancel), customerMessage: typeof row.customer_message === "string" ? row.customer_message : "", needsPosReview: Boolean(row.needs_pos_review), items: Array.isArray(row.items) ? row.items.map((item) => ({ menuItemId: String((item as Row).menu_item_id), name: String((item as Row).name), price: Number((item as Row).price), quantity: Number((item as Row).quantity), note: typeof (item as Row).note === "string" ? String((item as Row).note) : null, variantId: typeof (item as Row).variant_id === "string" ? String((item as Row).variant_id) : null, variantName: typeof (item as Row).variant_name === "string" ? String((item as Row).variant_name) : null, toppings: Array.isArray((item as Row).toppings) ? (item as Row).toppings as unknown[] : [] })) : [],
});

export async function getPreorders(access: ReservationAccess): Promise<ReservationPreorderBatch[]> {
  // database.types.ts là snapshot client cũ; RPC preorder đã được migration production tạo.
  const { data, error } = await supabase.rpc("get_customer_reservation_preorders" as never, { p_reservation_id: access.reservationId, p_customer_token: access.token } as never);
  if (error) throw error; return Array.isArray(data) ? (data as Row[]).map(map) : [];
}
export async function submitPreorder(access: ReservationAccess, requestId: string, items: Item[], note: string | null): Promise<ReservationPreorderBatch> {
  const { data, error } = await supabase.rpc("submit_reservation_preorder" as never, { p_reservation_id: access.reservationId, p_customer_token: access.token, p_client_request_id: requestId, p_items: items.map((item) => ({ menu_item_id: item.productId, quantity: item.quantity, note: item.note ?? null, variant_id: item.variantId ?? null, topping_ids: item.toppingIds ?? [] })), p_note: note } as never);
  if (error) throw error; if (!data) throw new Error("Không thể gửi món đặt trước"); return map(data as Row);
}
