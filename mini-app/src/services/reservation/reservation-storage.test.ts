import { beforeEach, describe, expect, it } from "vitest";

import {
  clearBookingDraft,
  getBookingAccess,
  getBookingAccesses,
  getBookingDraft,
  getReservationProfile,
  saveBookingAccess,
  saveBookingDraft,
  saveReservationProfile,
} from "./reservation-storage";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
});

describe("reservation storage", () => {
  it("lưu access/draft theo quán riêng và xóa draft sau khi thành công", () => {
    expect(saveBookingDraft({ requestId: "request-1", token: "a".repeat(64), storeId: "store-a", customerName: "A", customerPhone: "0900", partySize: 2, arrivalAt: "2026-09-25T12:00:00.000Z", note: "" })).toBe(true);
    expect(saveBookingAccess({ storeId: "store-a", reservationId: "reservation-1", token: "a".repeat(64) })).toBe(true);
    expect(getBookingDraft("store-a")?.requestId).toBe("request-1");
    expect(getBookingDraft("store-b")).toBeNull();
    expect(getBookingAccess("store-a")?.reservationId).toBe("reservation-1");
    clearBookingDraft("store-a");
    expect(getBookingDraft("store-a")).toBeNull();
  });

  it("giữ danh sách booking riêng của cùng một quán, không thay token booking trước", () => {
    saveBookingAccess({ storeId: "store-a", reservationId: "reservation-1", token: "a".repeat(64) });
    saveBookingAccess({ storeId: "store-a", reservationId: "reservation-2", token: "b".repeat(64) });
    expect(getBookingAccesses("store-a").map((access) => access.reservationId)).toEqual(["reservation-1", "reservation-2"]);
    expect(getBookingAccess("store-a", "reservation-1")?.token).toBe("a".repeat(64));
  });

  it("storage hỏng, thiếu token hoặc bị chặn không làm app crash", () => {
    storage.set("mevo_reservation_access:store-a", "{");
    expect(getBookingAccess("store-a")).toBeNull();
    storage.set("mevo_reservation_access:store-a", JSON.stringify({ storeId: "store-a", reservationId: "r", token: "" }));
    expect(getBookingAccess("store-a")).toBeNull();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } } });
    expect(saveBookingAccess({ storeId: "store-a", reservationId: "r", token: "a".repeat(64) })).toBe(false);
    expect(getBookingAccess("store-a")).toBeNull();
  });

  it("profile tên/điện thoại tách khỏi token và draft", () => {
    expect(saveReservationProfile("store-a", { customerName: "Nguyễn A", customerPhone: "0900000000" })).toBe(true);
    expect(getReservationProfile("store-a")).toEqual({ customerName: "Nguyễn A", customerPhone: "0900000000" });
    expect(JSON.stringify([...storage.entries()])).not.toContain("a".repeat(64));
  });
});
