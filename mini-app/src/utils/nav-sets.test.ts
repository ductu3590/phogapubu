import { describe, expect, it } from "vitest";
import { activeTabKey, tabsFor, toolbarModeFor } from "./nav-sets";

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe("tabsFor", () => {
  it("quét QR bàn → Thực đơn · Đơn gọi", () => {
    expect(keys(tabsFor({ entryKind: "table", readOnlyMenu: false, reservationsEnabled: true, hasBookings: false }))).toEqual(["menu", "session"]);
  });
  it("mở thường, chỉ xem menu + có đặt bàn (Bảo Lương) → Trang chủ · Đặt bàn (một tab gộp lịch hẹn + đặt mới)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: true, reservationsEnabled: true, hasBookings: false });
    expect(keys(tabs)).toEqual(["home", "reserve"]);
    expect(tabs.map((t) => t.path)).toEqual(["/", "/reservations"]);
  });
  it("mở thường, mang về không đặt bàn (Pubu) → Trang chủ · Đơn của tôi (đơn mang về)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: false, reservationsEnabled: false, hasBookings: false });
    expect(keys(tabs)).toEqual(["home", "my-orders"]);
    expect(tabs[1].path).toBe("/session-orders");
  });
  it("vừa mang về vừa đặt bàn → Trang chủ · Đặt bàn · Đơn của tôi (mang về)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: false, reservationsEnabled: true, hasBookings: false });
    expect(tabs.map((t) => t.path)).toEqual(["/", "/reservations", "/session-orders"]);
  });
  it("tab Đặt bàn sáng cho form đặt mới lẫn chi tiết đặt bàn", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: true, reservationsEnabled: true, hasBookings: false });
    expect(activeTabKey(tabs, "/reservations/new")).toBe("reserve");
    expect(activeTabKey(tabs, "/reservations/abc")).toBe("reserve");
    expect(activeTabKey(tabs, "/")).toBe("home");
  });
  it("nhãn", () => {
    expect(tabsFor({ entryKind: "root", readOnlyMenu: true, reservationsEnabled: true, hasBookings: false }).map((t) => t.label)).toEqual(["Trang chủ", "Đặt bàn"]);
  });
});

describe("tabsFor — quán TẮT đặt bàn nhưng máy còn lượt đặt cũ", () => {
  it("vẫn có tab Đặt bàn để xem lượt cũ (trang tự ẩn form khi quán tắt)", () => {
    const tabs = tabsFor({ entryKind: "root", readOnlyMenu: true, reservationsEnabled: false, hasBookings: true });
    expect(tabs.map((t) => t.path)).toEqual(["/", "/reservations"]);
  });
  it("tắt đặt bàn, không có lượt nào → chỉ Trang chủ", () => {
    expect(keys(tabsFor({ entryKind: "root", readOnlyMenu: true, reservationsEnabled: false, hasBookings: false }))).toEqual(["home"]);
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

