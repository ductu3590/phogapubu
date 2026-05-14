import { create } from "zustand";

interface AppStore {
  // Thông tin quán từ QR params
  storeSlug: string;
  storeId: string;
  storeName: string;
  tableId: string;
  tableNumber: string;

  setStoreInfo: (info: {
    storeSlug: string;
    storeId: string;
    storeName: string;
  }) => void;
  setTableInfo: (info: { tableId: string; tableNumber: string }) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  storeSlug: "",
  storeId: "",
  storeName: "",
  tableId: "",
  tableNumber: "",

  setStoreInfo: (info) => set(info),
  setTableInfo: (info) => set(info),
}));

// Đọc store + table từ URL query params (Zalo truyền qua QR)
export function parseQRParams(): { storeSlug: string; tableId: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    storeSlug: params.get("store") || "",
    tableId: params.get("table") || "",
  };
}
