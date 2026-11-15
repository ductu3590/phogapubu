// Đọc kết quả get_mini_app_bootstrap (mig 135). Hàm thuần: nhận JSON thô, trả dữ liệu đã kiểm
// hình dạng hoặc null. Sai hình dạng thì coi như không có (trả null): app.tsx chỉ setBootDone(), app dừng ở màn chờ,
// KHÔNG gọi đường đọc cũ. Chỉ khi RPC lỗi / ném mới chạy loadLegacy.

/** Đúng các cột mini-app đọc từ bảng stores (cùng danh sách ở app.tsx và trong hàm SQL). */
export interface StoreBootRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  google_maps_url?: string | null;
  phone: string | null;
  zalo_oa_id: string | null;
  zalo_oa_url: string | null;
  payment_methods: string[] | null;
  payment_timing: string | null;
  takeaway_banner_url: string | null;
  about_text: string | null;
  wifi_name: string | null;
  wifi_password: string | null;
  primary_color: string | null;
  mini_app_theme?: string | null;
  is_accepting_orders: boolean | null;
  serving_hours: unknown;
  delivery_area_note: string | null;
  terms_of_use: string | null;
}

export interface BootstrapPayload {
  store: StoreBootRow;
  table: { id: string; table_number: string } | null;
  /** Payload thô của get_public_store_workflow; null = quán chưa có cấu hình. */
  workflow: Record<string, unknown> | null;
  /** Payload thô của get_active_menu_discounts. */
  discounts: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export function parseBootstrap(data: unknown): BootstrapPayload | null {
  if (!isObj(data) || !isObj(data.store)) return null;
  const s = data.store;
  if (typeof s.id !== "string" || !s.id || typeof s.slug !== "string" || typeof s.name !== "string") return null;
  const t = data.table;
  const table = isObj(t) && typeof t.id === "string" && typeof t.table_number === "string"
    ? { id: t.id, table_number: t.table_number }
    : null;
  return {
    store: s as unknown as StoreBootRow,
    table,
    workflow: isObj(data.workflow) ? data.workflow : null,
    discounts: data.discounts ?? null,
  };
}

/**
 * Đường đọc dự phòng (loadLegacy): chỉ nhận bàn thuộc ĐÚNG quán của slug — khớp mig 140
 * (`t.store_id = s.id`). Bàn quán khác (hoặc thiếu store_id) → null, app vào như lối thường.
 */
export function pickTableForStore<T extends { store_id: string | null }>(
  table: T | null | undefined,
  storeId: string | null | undefined,
): T | null {
  if (!table || !storeId || table.store_id !== storeId) return null;
  return table;
}
