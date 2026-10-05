// Hai bộ tab theo lối vào (spec Q2): mở thường = Trang chủ · Đặt bàn · Đơn của tôi;
// quét QR bàn = Thực đơn · Đơn gọi. Đường dẫn giữ route hiện có — MA-3 sẽ tách
// "Đơn của tôi" cho quán vừa mang về vừa đặt bàn.
export type TabKey = "home" | "reserve" | "my-orders" | "menu" | "session";
export type TabDef = { key: TabKey; path: string; matchPaths: string[]; label: string };

export function tabsFor(input: { entryKind: "root" | "table"; readOnlyMenu: boolean; showReservations: boolean }): TabDef[] {
  if (input.entryKind === "table") {
    return [
      { key: "menu", path: "/", matchPaths: ["/", "/menu"], label: "Thực đơn" },
      { key: "session", path: "/session-orders", matchPaths: ["/session-orders"], label: "Đơn gọi" },
    ];
  }
  const tabs: TabDef[] = [{ key: "home", path: "/", matchPaths: ["/", "/menu"], label: "Trang chủ" }];
  if (input.showReservations) tabs.push({ key: "reserve", path: "/reservations", matchPaths: ["/reservations"], label: "Đặt bàn" });
  if (!input.readOnlyMenu) tabs.push({ key: "my-orders", path: "/session-orders", matchPaths: ["/session-orders"], label: "Đơn của tôi" });
  return tabs;
}

export type ToolbarMode = { callStaff: boolean; tableChip: boolean; cart: boolean };

export function toolbarModeFor(input: { entryKind: "root" | "table"; canOrder: boolean }): ToolbarMode {
  const atTable = input.entryKind === "table";
  return { callStaff: atTable, tableChip: atTable, cart: input.canOrder };
}
