import { describe, expect, it } from "vitest";
import type { CustomerReservation } from "@/types/reservation.types";
import { formatReservationTime, reservationActions } from "./reservation-display";

const base: CustomerReservation = {
  reservationId: "r-1", storeId: "store-1", status: "pending", customerName: "Anh Tú",
  customerPhone: "0900000000", partySize: 4, arrivalAt: "2026-09-24T12:00:00.000Z", note: null,
  requestedArrivalAt: null, requestedPartySize: null, createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z", serverNow: "2026-09-24T13:00:00.000Z",
  preorderEditDeadline: "2026-09-24T11:30:00.000Z", canRequestChange: false, canCancel: false,
  canPreorder: false, customerMessage: "", hasChangeRequest: false,
};

describe("reservation display", () => {
  it("luôn hiển thị thời điểm theo giờ Hồ Chí Minh", () => {
    expect(formatReservationTime("2026-09-24T12:00:00Z")).toContain("19:00");
  });

  it("không nói pending quá giờ là đã giữ bàn", () => {
    expect(reservationActions(base, new Date("2026-09-24T13:00:00.000Z")).message)
      .toBe("Quán chưa xác nhận — đặt bàn chưa được bảo đảm");
  });

  it("booking đã có vẫn cho server quyết định đổi hoặc hủy dù quán tắt nhận mới", () => {
    const actions = reservationActions({ ...base, status: "confirmed", canRequestChange: true, canCancel: true }, new Date());
    expect(actions.canRequestChange).toBe(true);
    expect(actions.canCancel).toBe(true);
  });
});
