import { describe, expect, it } from "vitest";
import { errorMessage, normalizeVnPhone } from "./booking-validation";

describe("normalizeVnPhone — số điện thoại đặt bàn", () => {
  it("10 số bắt đầu bằng 0 → hợp lệ, bỏ dấu cách/chấm/gạch", () => {
    expect(normalizeVnPhone("0962 345 678")).toEqual({ ok: true, value: "0962345678" });
    expect(normalizeVnPhone("0962.345.678")).toEqual({ ok: true, value: "0962345678" });
  });
  it("+84 / 84 đầu số → đổi về 0", () => {
    expect(normalizeVnPhone("+84 962 345 678")).toEqual({ ok: true, value: "0962345678" });
    expect(normalizeVnPhone("84962345678")).toEqual({ ok: true, value: "0962345678" });
  });
  it("thiếu số (vd 0962) → báo rõ cần 10 số", () => {
    expect(normalizeVnPhone("0962")).toEqual({ ok: false, error: "Số điện thoại cần đủ 10 số, bắt đầu bằng 0 (ví dụ 0962 345 678)." });
  });
  it("có chữ / không bắt đầu bằng 0 → không hợp lệ", () => {
    expect(normalizeVnPhone("09a2345678").ok).toBe(false);
    expect(normalizeVnPhone("1962345678").ok).toBe(false);
  });
  it("rỗng → nhắc nhập", () => {
    expect(normalizeVnPhone("  ")).toEqual({ ok: false, error: "Vui lòng nhập số điện thoại để quán liên hệ." });
  });
});

describe("errorMessage — lấy đúng câu lỗi server", () => {
  it("lỗi Supabase là object thường có message → dùng message (không che bằng câu chung)", () => {
    expect(errorMessage({ message: "Số điện thoại phải từ 6 đến 20 ký tự", code: "P0001" }, "fallback")).toBe("Số điện thoại phải từ 6 đến 20 ký tự");
  });
  it("Error thường", () => expect(errorMessage(new Error("boom"), "fallback")).toBe("boom"));
  it("không có message → câu dự phòng", () => {
    expect(errorMessage(null, "fallback")).toBe("fallback");
    expect(errorMessage({ message: "  " }, "fallback")).toBe("fallback");
  });
});
