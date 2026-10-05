import { describe, expect, it } from "vitest";
import { CallStaffCooldownError } from "@/services/service-request";
import { callStaffMessage } from "./call-staff-message";

describe("callStaffMessage", () => {
  it("thành công", () => {
    expect(callStaffMessage({ ok: true })).toEqual({ text: "Đã gọi nhân viên, vui lòng chờ trong giây lát", type: "success" });
  });
  it("đang chặn có giờ → hiện giờ đã gọi và giờ gọi lại (giờ VN)", () => {
    // retryAt 12:28 UTC = 19:28 VN → đã gọi lúc 19:25
    const msg = callStaffMessage({ ok: false, error: new CallStaffCooldownError(new Date("2026-10-05T12:28:00Z")) });
    expect(msg).toEqual({ text: "Bạn vừa gọi lúc 19:25, có thể gọi lại sau 19:28", type: "warning" });
  });
  it("giờ gọi lại có giây lẻ → làm tròn LÊN phút sau, không báo giờ đã qua", () => {
    // retryAt 12:28:20 UTC = 19:28:20 VN → báo "gọi lại sau 19:29" (19:28 thì lúc 19:28:10 vẫn bị chặn)
    const msg = callStaffMessage({ ok: false, error: new CallStaffCooldownError(new Date("2026-10-05T12:28:20Z")) });
    expect(msg.text).toBe("Bạn vừa gọi lúc 19:25, có thể gọi lại sau 19:29");
  });
  it("đang chặn không rõ giờ", () => {
    expect(callStaffMessage({ ok: false, error: new CallStaffCooldownError(null) }))
      .toEqual({ text: "Bạn vừa gọi nhân viên, vui lòng chờ ít phút", type: "warning" });
  });
  it("lỗi mạng/khác", () => {
    expect(callStaffMessage({ ok: false, error: new Error("fetch failed") }))
      .toEqual({ text: "Chưa gọi được, kiểm tra mạng rồi thử lại", type: "error" });
  });
});
