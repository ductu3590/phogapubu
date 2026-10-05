import { describe, expect, it } from "vitest";
import { splitBookings } from "./booking-groups";

const b = (id: string, status: string, arrivalAt: string) => ({ reservationId: id, status, arrivalAt });

describe("splitBookings — tab Đặt bàn: lịch hẹn đang có vs lịch sử", () => {
  it("chờ xác nhận / đã xác nhận là lịch hẹn ĐANG có, sớm nhất lên trước", () => {
    const r = splitBookings([b("late", "confirmed", "2026-10-06T12:00:00Z"), b("soon", "pending", "2026-10-05T11:00:00Z")]);
    expect(r.active.map((x) => x.reservationId)).toEqual(["soon", "late"]);
    expect(r.history).toEqual([]);
  });
  it("đã đến / huỷ / không đến / hoàn tất / quán từ chối là lịch sử, mới nhất lên trước", () => {
    const r = splitBookings([
      b("a", "arrived", "2026-10-01T10:00:00Z"),
      b("c", "cancelled_by_customer", "2026-10-03T10:00:00Z"),
      b("n", "no_show", "2026-10-02T10:00:00Z"),
      b("r", "rejected", "2026-09-30T10:00:00Z"),
      b("d", "completed", "2026-09-29T10:00:00Z"),
      b("s", "cancelled_by_store", "2026-09-28T10:00:00Z"),
    ]);
    expect(r.active).toEqual([]);
    expect(r.history.map((x) => x.reservationId)).toEqual(["c", "n", "a", "r", "d", "s"]);
  });
  it("rỗng", () => expect(splitBookings([])).toEqual({ active: [], history: [] }));
});
