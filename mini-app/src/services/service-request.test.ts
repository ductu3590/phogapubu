import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, getOrCreateDeviceId } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getOrCreateDeviceId: vi.fn(),
}));

vi.mock("./supabase", () => ({ supabase: { rpc, from } }));
vi.mock("./device-id", () => ({ getOrCreateDeviceId }));

import { CallStaffCooldownError, pingCallStaff } from "./service-request";

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

  it("server chặn kèm giờ gọi lại → CallStaffCooldownError có retryAt", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Vui lòng chờ trước khi gọi nhân viên lần nữa", details: "2026-10-05T12:28:00Z", code: "P0001" },
    });
    const err = await pingCallStaff("table-1").catch((e) => e);
    expect(err).toBeInstanceOf(CallStaffCooldownError);
    expect((err as CallStaffCooldownError).retryAt?.toISOString()).toBe("2026-10-05T12:28:00.000Z");
  });

  it("server chặn nhưng details hỏng/thiếu → vẫn là lỗi chặn, retryAt null", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Vui lòng chờ trước khi gọi nhân viên lần nữa", details: null } });
    const err = await pingCallStaff("table-1").catch((e) => e);
    expect(err).toBeInstanceOf(CallStaffCooldownError);
    expect((err as CallStaffCooldownError).retryAt).toBeNull();
  });

  it("lỗi khác (bàn không hoạt động) → ném nguyên lỗi server", async () => {
    const error = { message: "Bàn không thuộc quán hoặc không hoạt động", details: null };
    rpc.mockResolvedValue({ data: null, error });
    await expect(pingCallStaff("table-1")).rejects.toBe(error);
  });
});
