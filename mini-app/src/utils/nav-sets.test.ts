import { describe, expect, it } from "vitest";
import { tabsFor, toolbarModeFor } from "./nav-sets";

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe("tabsFor", () => {
  it("quét QR bàn → Thực đơn · Đơn gọi", () => {
    expect(keys(tabsFor({ entryKind: "table", readOnlyMenu: false, showReservations: true }))).toEqual(["menu", "session"]);
  });
  it("mở thường, quán chỉ xem menu + có đặt bàn (Bảo Lương) → Trang chủ · Đặt bàn", () => {
    expect(keys(tabsFor({ entryKind: "root", readOnlyMenu: true, showReservations: true }))).toEqual(["home", "reserve"]);
  });
  it("mở thường, quán mang về không đặt bàn (Pubu) → Trang chủ · Đơn của tôi", () => {
    expect(keys(tabsFor({ entryKind: "root", readOnlyMenu: false, showReservations: false }))).toEqual(["home", "my-orders"]);
  });
  it("nhãn đúng chữ Stitch", () => {
    expect(tabsFor({ entryKind: "root", readOnlyMenu: false, showReservations: true }).map((t) => t.label))
      .toEqual(["Trang chủ", "Đặt bàn", "Đơn của tôi"]);
  });
});

describe("toolbarModeFor", () => {
  it("ở bàn gọi được món → đủ Gọi NV, chip bàn, giỏ", () => {
    expect(toolbarModeFor({ entryKind: "table", canOrder: true })).toEqual({ callStaff: true, tableChip: true, cart: true });
  });
  it("ở bàn nhưng bàn bị khoá → vẫn Gọi NV + chip bàn, ẩn giỏ", () => {
    expect(toolbarModeFor({ entryKind: "table", canOrder: false })).toEqual({ callStaff: true, tableChip: true, cart: false });
  });
  it("mở thường chỉ xem menu → không Gọi NV, không chip, không giỏ", () => {
    expect(toolbarModeFor({ entryKind: "root", canOrder: false })).toEqual({ callStaff: false, tableChip: false, cart: false });
  });
});
