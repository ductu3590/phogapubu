import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../supabase", () => ({ supabase: { rpc } }));

import { getPreorders, submitPreorder } from "./preorder.api";

const access = { storeId: "store-1", reservationId: "reservation-1", token: "a".repeat(64) };
const item = { productId: "item-1", quantity: 2, note: null, variantId: null, toppingIds: [] };

describe("preorder API", () => {
  beforeEach(() => rpc.mockReset());

  it("gửi đúng capability và request ID bền vững; giá không bao giờ vào payload", async () => {
    rpc.mockResolvedValue({ data: { order_id: "order-1", revision: 1, can_edit: false, can_cancel: false, total_amount: 240000, items: [] }, error: null });
    await expect(submitPreorder(access, "request-1", [item], "Ít cay")).resolves.toMatchObject({ orderId: "order-1", canEdit: false });
    expect(rpc).toHaveBeenCalledWith("submit_reservation_preorder", {
      p_reservation_id: access.reservationId, p_customer_token: access.token, p_client_request_id: "request-1",
      p_items: [{ menu_item_id: "item-1", quantity: 2, note: null, variant_id: null, topping_ids: [] }], p_note: "Ít cay",
    });
  });

  it("đọc batch chỉ qua RPC token và không che lỗi server", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(getPreorders(access)).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("get_customer_reservation_preorders", { p_reservation_id: access.reservationId, p_customer_token: access.token });
    const error = new Error("Không có quyền"); rpc.mockResolvedValueOnce({ data: null, error });
    await expect(getPreorders(access)).rejects.toBe(error);
  });
});
