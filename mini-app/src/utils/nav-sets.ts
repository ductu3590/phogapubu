// Hai bộ tab theo lối vào (spec Q2): mở thường = Trang chủ · Đặt bàn · Đơn của tôi;
// quét QR bàn = Thực đơn · Đơn gọi. Đường dẫn giữ route hiện có — MA-3 sẽ tách
// "Đơn của tôi" cho quán vừa mang về vừa đặt bàn.
export type TabKey = "home" | "reserve" | "my-orders" | "menu" | "session";
export type TabDef = { key: TabKey; path: string; matchPaths: string[]; label: string };

export function tabsFor(input: {
  entryKind: "root" | "table";
  readOnlyMenu: boolean;
  /** Quán đang nhận đặt bàn → có tab "Đặt bàn" (form). */
  reservationsEnabled: boolean;
  /** Máy này có lượt đặt bàn cũ → vẫn xem được dù quán đã tắt đặt bàn. */
  hasBookings: boolean;
}): TabDef[] {
  if (input.entryKind === "table") {
    return [
      { key: "menu", path: "/", matchPaths: ["/", "/menu"], label: "Thực đơn" },
      { key: "session", path: "/session-orders", matchPaths: ["/session-orders"], label: "Đơn gọi" },
    ];
  }
  const tabs: TabDef[] = [{ key: "home", path: "/", matchPaths: ["/", "/menu"], label: "Trang chủ" }];
  // MỘT tab "Đặt bàn" (quyết định 2026-10-05): trang /reservations tự hiện lịch hẹn đang có + nút
  // "Đặt thêm bàn khác", chưa có thì hiện form ngay; lượt đã xong vào "Lịch sử đặt bàn". Bỏ tab
  // "Đơn của tôi" riêng cho đặt bàn (trước đây trùng chức năng, khách đặt lặp / tưởng chưa đặt được).
  if (input.reservationsEnabled || input.hasBookings) {
    tabs.push({ key: "reserve", path: "/reservations", matchPaths: ["/reservations"], label: "Đặt bàn" });
  }
  // Quán có mang về: "Đơn của tôi" là đơn mang về.
  if (!input.readOnlyMenu) {
    tabs.push({ key: "my-orders", path: "/session-orders", matchPaths: ["/session-orders"], label: "Đơn của tôi" });
  }
  return tabs;
}

/** Tab đang sáng: so khớp đúng hoặc theo tiền tố, ưu tiên đường dẫn DÀI nhất
 *  (/reservations/new → Đặt bàn, /reservations/<id> → Đơn của tôi). */
export function activeTabKey(tabs: TabDef[], pathname: string): TabKey | null {
  let best: { key: TabKey; len: number } | null = null;
  for (const tab of tabs) {
    for (const m of tab.matchPaths) {
      const hit = pathname === m || (m !== "/" && pathname.startsWith(`${m}/`));
      if (hit && (!best || m.length > best.len)) best = { key: tab.key, len: m.length };
    }
  }
  return best?.key ?? null;
}

export type ToolbarMode = { callStaff: boolean; tableChip: boolean; cart: boolean };

export function toolbarModeFor(input: { entryKind: "root" | "table"; canOrder: boolean }): ToolbarMode {
  const atTable = input.entryKind === "table";
  return { callStaff: atTable, tableChip: atTable, cart: input.canOrder };
}
