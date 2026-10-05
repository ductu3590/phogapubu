import { describe, expect, it } from "vitest";
import { afterOrderRoute } from "./after-order-route";

describe("afterOrderRoute — gọi món xong đi đâu", () => {
  it("trả sau tại bàn, thu ngân duyệt (Bảo Lương) → sang Đơn gọi, thay lịch sử, báo chờ xác nhận", () => {
    expect(afterOrderRoute({ isPostpayDineIn: true, kitchenPolicy: "pos_confirmation", orderId: "o1" }))
      .toEqual({ path: "/session-orders", replace: true, toast: "Đã gửi món, chờ thu ngân xác nhận" });
  });
  it("trả sau tại bàn, bếp tự nhận → sang Đơn gọi, báo đã gửi bếp", () => {
    expect(afterOrderRoute({ isPostpayDineIn: true, kitchenPolicy: "automatic", orderId: "o1" }))
      .toEqual({ path: "/session-orders", replace: true, toast: "Đã gửi món cho bếp" });
  });
  it("trả trước / mang về (Pubu) → vẫn vào Trạng thái đơn như cũ", () => {
    expect(afterOrderRoute({ isPostpayDineIn: false, kitchenPolicy: "automatic", orderId: "o9" }))
      .toEqual({ path: "/order-status/o9", replace: false, toast: null });
  });
});
