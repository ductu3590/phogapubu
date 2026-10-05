import { describe, expect, it } from "vitest";
import { activeTabKey, tabsFor, toolbarModeFor } from "./nav-sets";

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe("tabsFor", () => {
  it("quét QR bàn → Thực đơn · Đơn gọi", () => {
    expect(keys(tabsFor({ entryKind: "table", readOnlyMenu: false, showReservations: true }))).toEqual(["menu", "session"]);
  });
  it("mở thường, chỉ xem menu + có đặt bàn (Bảo Lương) → Trang chủ · Đặt bàn (form) · Đơn của tôi (danh sách đặt bàn)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: true, showReservations: true });
    expect(keys(tabs)).toEqual(["home", "reserve", "my-orders"]);
    expect(tabs.map((t) => t.path)).toEqual(["/", "/reservations/new", "/reservations"]);
  });
  it("mở thường, mang về không đặt bàn (Pubu) → Trang chủ · Đơn của tôi (đơn mang về)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: false, showReservations: false });
    expect(keys(tabs)).toEqual(["home", "my-orders"]);
    expect(tabs[1].path).toBe("/session-orders");
  });
  it("vừa mang về vừa đặt bàn → Đơn của tôi là đơn mang về (trang đó có lối sang đặt bàn)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: false, showReservations: true });
    expect(tabs.map((t) => t.path)).toEqual(["/", "/reservations/new", "/session-orders"]);
  });
  it("chi tiết đặt bàn vẫn sáng tab Đơn của tôi", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: true, showReservations: true });
    expect(tabs[2].matchPaths).toContain("/reservations");
  });
  it("nhãn đúng chữ Stitch", () => {
    expect(tabsFor({ entryKind: "root", readOnlyMenu: true, showReservations: true }).map((t) => t.label))
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

describe("activeTabKey — tab nào đang sáng", () => {
  const tabs = tabsFor({ entryKind: "root", readOnlyMenu: true, showReservations: true });
  it("khớp dài nhất: form đặt bàn sáng Đặt bàn, chi tiết đặt bàn sáng Đơn của tôi", () => {
    expect(activeTabKey(tabs, "/reservations/new")).toBe("reserve");
    expect(activeTabKey(tabs, "/reservations/abc-123")).toBe("my-orders");
    expect(activeTabKey(tabs, "/reservations")).toBe("my-orders");
    expect(activeTabKey(tabs, "/")).toBe("home");
  });
  it("trang ngoài tab (giỏ, tài khoản) → không tab nào sáng", () => {
    expect(activeTabKey(tabs, "/account")).toBeNull();
  });
});
