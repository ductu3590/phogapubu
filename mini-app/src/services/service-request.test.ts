import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, getOrCreateDeviceId } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
}));

vi.mock("./supabase", () => ({ supabase: { rpc, from } }));
vi.mock("./device-id", () => ({ getOrCreateDeviceId }));

import { pingCallStaff } from "./service-request";

describe("pingCallStaff", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    getOrCreateDeviceId.mockReset();
    getOrCreateDeviceId.mockReturnValue("device-1");
    rpc.mockResolvedValue({ data: { id: "request-1" }, error: null });
  });

  it("gửi table/device vào RPC thay vì insert trực tiếp", async () => {
    await expect(pingCallStaff("table-1")).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("ping_service_request", {
      p_table_id: "table-1",
      p_type: "call_staff",
      p_device_id: "device-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("trả lỗi server để UI hiển thị đúng trạng thái gọi thất bại", async () => {
    const error = new Error("Vui lòng chờ trước khi gọi nhân viên lần nữa");
    rpc.mockResolvedValue({ data: null, error });

    await expect(pingCallStaff("table-1")).rejects.toBe(error);
  });
});
