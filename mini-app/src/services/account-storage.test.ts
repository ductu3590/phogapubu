import { beforeEach, describe, expect, it } from "vitest";
import { clearPersonalData } from "./account-storage";

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

describe("clearPersonalData", () => {
  it("xoá hồ sơ, nháp đặt bàn, form mang về; GIỮ quyền xem lịch hẹn, device id, giỏ hàng, dữ liệu quán khác", () => {
    const keep = [
      "mevo_reservation_access:store-a:r1",
      "mevo_reservation_accesses:store-a",
      "mevo_device_id",
      "mevo_cart",
      "mevo_reservation_profile:store-b",
    ];
    const gone = [
      "mevo_reservation_profile:store-a",
      "mevo_reservation_draft:store-a",
      "mevo_takeaway_form",
    ];
    for (const k of [...keep, ...gone]) storage.set(k, "{}");

    clearPersonalData("store-a");

    for (const k of gone) expect(storage.has(k), k).toBe(false);
    for (const k of keep) expect(storage.has(k), k).toBe(true);
  });

  it("localStorage ném lỗi: không văng ra ngoài", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { removeItem: () => { throw new Error("blocked"); } },
    });
    expect(() => clearPersonalData("store-a")).not.toThrow();
  });
});
