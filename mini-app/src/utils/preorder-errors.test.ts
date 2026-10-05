import { describe, expect, it } from "vitest";
import { preorderSubmitError } from "./preorder-errors";

describe("preorderSubmitError — gửi món đặt trước lỗi thì làm gì", () => {
  it("cùng mã yêu cầu nhưng nội dung khác (lần trước đã tới server, khách sửa giỏ) → có thể ĐÃ GỬI, kiểm lại", () => {
    expect(preorderSubmitError({ message: "preorder_request_payload_mismatch" })).toEqual({ maybeSent: true, text: "Món đặt trước có thể đã được gửi ở lần trước. Đang kiểm tra lại…" });
  });
  it("server báo đã gửi / đã khoá → có thể đã gửi", () => {
    expect(preorderSubmitError({ message: "Món đặt trước đã gửi. Vui lòng gọi thêm tại quán." }).maybeSent).toBe(true);
    expect(preorderSubmitError({ message: "Món đặt trước đã khóa ngay sau khi gửi. Vui lòng gọi thêm tại quán." }).maybeSent).toBe(true);
  });
  it("hai lệnh gửi cùng lúc đụng chỉ mục duy nhất → có thể đã gửi, không hiện chữ kỹ thuật", () => {
    const r = preorderSubmitError({ message: 'duplicate key value violates unique constraint "orders_one_active_reservation_preorder"', code: "23505" });
    expect(r.maybeSent).toBe(true);
    expect(r.text).not.toMatch(/duplicate|constraint/);
  });
  it("lỗi tiếng Việt khác (quá giờ) → hiện nguyên câu, không phải đã gửi", () => {
    expect(preorderSubmitError({ message: "Chỉ đặt món trước sau khi quán xác nhận và trước giờ đến" }))
      .toEqual({ maybeSent: false, text: "Chỉ đặt món trước sau khi quán xác nhận và trước giờ đến" });
  });
  it("mã kỹ thuật lạ (snake_case) / mất mạng → câu dự phòng tiếng Việt", () => {
    expect(preorderSubmitError({ message: "some_internal_code" }).text).toBe("Không thể gửi món, vui lòng thử lại.");
    expect(preorderSubmitError(new TypeError("Failed to fetch")).text).toBe("Không thể gửi món, vui lòng thử lại.");
  });
});
