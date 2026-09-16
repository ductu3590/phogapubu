import type { EntryContext, PublicWorkflow, RootCapabilities } from "@/types/workflow.types";

/**
 * URL chỉ nói ứng dụng được mở ở root hay từ QR tại bàn. Không suy lối vào root
 * thành mang về: hành vi root phải đọc từ workflow của quán.
 */
export function parseEntryContext(searchParams: URLSearchParams): EntryContext {
  const tableId = searchParams.get("table");
  const tableNumber = searchParams.get("tableNumber");

  // QR bàn đã in trước BL-0 chỉ có table id. Tên bàn là dữ liệu hiển thị, sẽ được
  // xác thực/lấy lại từ DB; không được biến QR cũ thành lối vào root.
  if (tableId) {
    return { kind: "table", tableId, tableNumber: tableNumber ?? "" };
  }

  return { kind: "root" };
}

export function rootCapabilities(
  workflow: Pick<PublicWorkflow, "takeawayEnabled" | "shippingEnabled" | "reservationsEnabled">,
): RootCapabilities {
  const pickup = workflow.takeawayEnabled;
  const delivery = workflow.shippingEnabled;

  return {
    readOnlyMenu: !pickup && !delivery,
    pickup,
    delivery,
    reservation: workflow.reservationsEnabled,
  };
}

/** Quyền gọi món không suy từ slug hay URL root; luôn dựa trên workflow của quán. */
export function canOrderInEntry(workflow: PublicWorkflow, entry: EntryContext): boolean {
  if (entry.kind === "table") return workflow.tableOrderingEnabled;
  return !rootCapabilities(workflow).readOnlyMenu;
}
