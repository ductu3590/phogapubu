import { describe, expect, it } from "vitest";
import { voucherForOrder, vouchersEnabled } from "./store-model";

describe("vouchersEnabled — mã giảm giá chỉ có ở quán trả trước", () => {
  it("quán trả trước đã tải xong: bật", () => {
    expect(vouchersEnabled({ storeId: "s1", paymentTiming: "prepay" })).toBe(true);
  });

  it("quán trả sau: tắt hẳn", () => {
    expect(vouchersEnabled({ storeId: "s1", paymentTiming: "postpay" })).toBe(false);
  });

  it("chưa tải xong quán (store còn mặc định prepay): chưa bật để không gọi RPC nhầm", () => {
    expect(vouchersEnabled({ storeId: "", paymentTiming: "prepay" })).toBe(false);
    expect(vouchersEnabled({ storeId: null, paymentTiming: "prepay" })).toBe(false);
  });
});

describe("voucherForOrder — mã đi kèm đơn", () => {
  const voucher = { code: "SHIP-X7K2M9" };

  it("quán dùng mã: giữ nguyên mã khách chọn", () => {
    expect(voucherForOrder(true, voucher)).toBe(voucher);
    expect(voucherForOrder(true, null)).toBeNull();
  });

  it("quán không dùng mã: không bao giờ gửi mã, kể cả khi state còn sót", () => {
    expect(voucherForOrder(false, voucher)).toBeNull();
  });
});
