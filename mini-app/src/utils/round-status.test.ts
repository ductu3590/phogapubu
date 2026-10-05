import { describe, expect, it } from "vitest";
import { hasPendingRound, lineLabel, orderSteps, reconcileRounds, roundDiscount, roundSourceLabel, roundStatus, stepIndex } from "./round-status";

const BL = { paymentTiming: "postpay", kitchenPolicy: "pos_confirmation" } as const;
const PUBU = { paymentTiming: "prepay", kitchenPolicy: "automatic" } as const;

describe("roundStatus — quán thu ngân duyệt + in phiếu (Bảo Lương)", () => {
  it("chờ thu ngân → Chờ xác nhận (vàng)", () => expect(roundStatus("pending", BL)).toEqual({ label: "Chờ xác nhận", tone: "warning" }));
  it("đã xác nhận / đang nấu / xong đều là Đã vào bếp — không bao giờ hiện bước bếp giả", () => {
    for (const s of ["confirmed", "cooking", "ready"] as const) expect(roundStatus(s, BL)).toEqual({ label: "Đã vào bếp", tone: "info" });
  });
  it("đã thu tiền → Đã thanh toán; huỷ → Bị từ chối", () => {
    expect(roundStatus("paid", BL)).toEqual({ label: "Đã thanh toán", tone: "success" });
    expect(roundStatus("cancelled", BL)).toEqual({ label: "Bị từ chối", tone: "critical" });
  });
});

describe("roundStatus — quán trả trước có màn bếp (Pubu)", () => {
  it("pending là chờ thanh toán, đủ các bước bếp", () => {
    expect(roundStatus("pending", PUBU).label).toBe("Chờ thanh toán");
    expect(roundStatus("cooking", PUBU).label).toBe("Đang làm");
    expect(roundStatus("ready", PUBU)).toEqual({ label: "Món xong", tone: "success" });
    expect(roundStatus("paid", PUBU).label).toBe("Hoàn tất");
  });
});

describe("phụ trợ", () => {
  it("nhãn nguồn lượt gọi", () => {
    expect(roundSourceLabel("staff")).toBe("Nhân viên gọi hộ");
    expect(roundSourceLabel("pos")).toBe("Quán thêm");
    expect(roundSourceLabel("reservation_preorder")).toBe("Món đặt trước");
    expect(roundSourceLabel("customer_zalo")).toBeNull();
  });
  it("món tặng → 0đ", () => {
    expect(lineLabel({ quantity: 2, price: 50000, void_type: "gift" })).toEqual({ gift: true, amount: 0 });
    expect(lineLabel({ quantity: 2, price: 50000, void_type: null })).toEqual({ gift: false, amount: 100000 });
  });
  it("còn lượt chờ xác nhận", () => {
    expect(hasPendingRound([{ status: "confirmed" }, { status: "pending" }], BL)).toBe(true);
    expect(hasPendingRound([{ status: "confirmed" }], BL)).toBe(false);
    expect(hasPendingRound([], BL)).toBe(false);
  });
});

describe("reconcileRounds — khối Đối soát tạm tính", () => {
  it("tách tổng đã vào bếp và đang chờ xác nhận", () => {
    expect(reconcileRounds([
      { status: "pending", total_amount: 670000 },
      { status: "confirmed", total_amount: 100000 },
      { status: "ready", total_amount: 710000 },
    ], BL)).toEqual({ inKitchen: 810000, pending: 670000, total: 1480000 });
  });
  it("trả trước: không có khái niệm chờ thu ngân → pending (chờ thanh toán) vẫn tách riêng", () => {
    expect(reconcileRounds([{ status: "pending", total_amount: 50000 }], PUBU)).toEqual({ inKitchen: 0, pending: 50000, total: 50000 });
  });
  it("rỗng", () => expect(reconcileRounds([], BL)).toEqual({ inKitchen: 0, pending: 0, total: 0 }));
});

describe("orderSteps / stepIndex — thanh tiến trình trang Trạng thái đơn", () => {
  it("quán thu ngân duyệt: 3 bước, không có bước bếp", () => {
    expect(orderSteps("pos_confirmation")).toEqual(["pending", "confirmed", "paid"]);
  });
  it("quán có màn bếp: 4 bước như cũ", () => {
    expect(orderSteps("automatic")).toEqual(["pending", "confirmed", "cooking", "ready"]);
  });
  it("đang nấu / xong ở quán thu ngân duyệt vẫn đứng ở bước Đã vào bếp", () => {
    const steps = orderSteps("pos_confirmation");
    expect(stepIndex("cooking", steps)).toBe(1);
    expect(stepIndex("ready", steps)).toBe(1);
    expect(stepIndex("paid", steps)).toBe(2);
  });
  it("trạng thái không có trong thanh → -1", () => {
    expect(stepIndex("cancelled", orderSteps("automatic"))).toBe(-1);
  });
});

describe("đơn không bao giờ được xác nhận (khớp admin-web isReviewableOrder)", () => {
  it("món thu ngân thêm tay ở POS (pending mãi) → không phải Chờ xác nhận", () => {
    expect(roundStatus("pending", BL, "pos")).toEqual({ label: "Đã ghi vào bill", tone: "neutral" });
  });
  it("món đặt trước chưa phát hành → không phải Chờ xác nhận", () => {
    expect(roundStatus("pending", BL, "reservation_preorder")).toEqual({ label: "Đã đặt trước", tone: "neutral" });
  });
  it("lượt khách / nhân viên gọi vẫn chờ xác nhận như thường", () => {
    expect(roundStatus("pending", BL, "customer_zalo").label).toBe("Chờ xác nhận");
    expect(roundStatus("pending", BL, "staff").label).toBe("Chờ xác nhận");
  });
  it("chấm đỏ + đối soát không tính lượt POS / đặt trước là đang chờ", () => {
    expect(hasPendingRound([{ status: "pending", source: "pos" }, { status: "confirmed", source: "customer_zalo" }], BL)).toBe(false);
    expect(reconcileRounds([{ status: "pending", total_amount: 200000, source: "pos" }], BL)).toEqual({ inKitchen: 200000, pending: 0, total: 200000 });
  });
});

describe("roundDiscount — lượt có mã giảm giá", () => {
  it("tổng dòng lớn hơn tiểu kế server → phần chênh là giảm giá", () => {
    expect(roundDiscount(250000, 225000)).toBe(25000);
  });
  it("khớp hoặc nhỏ hơn → 0", () => {
    expect(roundDiscount(250000, 250000)).toBe(0);
    expect(roundDiscount(200000, 250000)).toBe(0);
  });
});
