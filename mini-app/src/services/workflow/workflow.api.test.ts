import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../supabase", () => ({ supabase: { rpc } }));

import { getPublicWorkflow } from "./workflow.api";

describe("getPublicWorkflow", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("đọc đúng workflow public của quán và chuẩn hoá về capability UI", async () => {
    rpc.mockResolvedValue({
      data: {
        table_ordering_enabled: true,
        takeaway_enabled: false,
        shipping_enabled: false,
        reservations_enabled: true,
      },
      error: null,
    });

    await expect(getPublicWorkflow("store-1")).resolves.toEqual({
      tableOrderingEnabled: true,
      takeawayEnabled: false,
      shippingEnabled: false,
      reservationsEnabled: true,
      kitchenReleasePolicy: "automatic",
    });
    expect(rpc).toHaveBeenCalledWith("get_public_store_workflow", { p_store_id: "store-1" });
  });

  it("đọc cài đặt bếp: thu ngân duyệt + in phiếu (mô hình Bảo Lương)", async () => {
    rpc.mockResolvedValue({
      data: { table_ordering_enabled: true, takeaway_enabled: false, shipping_enabled: false, reservations_enabled: true, kitchen_release_policy: "pos_confirmation" },
      error: null,
    });
    await expect(getPublicWorkflow("store-1")).resolves.toMatchObject({ kitchenReleasePolicy: "pos_confirmation" });
  });

  it("không trả fallback khi RPC lỗi", async () => {
    const error = new Error("Không tải được cấu hình quán");
    rpc.mockResolvedValue({ data: null, error });

    await expect(getPublicWorkflow("store-1")).rejects.toBe(error);
  });
});
