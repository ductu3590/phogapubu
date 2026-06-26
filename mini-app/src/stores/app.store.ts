import { create } from "zustand";

export type PaymentMethod = "zalopay" | "cash";

interface AppStore {
  storeSlug: string;
  storeId: string;
  storeName: string;
  storeLogoUrl: string;
  storeAddress: string;
  storePhone: string;
  zaloOaId: string;
  zaloOaUrl: string;
  paymentMethods: PaymentMethod[];
  tableId: string;
  tableNumber: string;
  zaloUserId: string;

  setStoreInfo: (info: {
    storeSlug: string;
    storeId: string;
    storeName: string;
    storeLogoUrl: string;
    storeAddress: string;
    storePhone: string;
    zaloOaId: string;
    zaloOaUrl: string;
    paymentMethods: PaymentMethod[];
  }) => void;
  setTableInfo: (info: { tableId: string; tableNumber: string }) => void;
  setZaloUserId: (zaloUserId: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  storeSlug: "",
  storeId: "",
  storeName: "",
  storeLogoUrl: "",
  storeAddress: "",
  storePhone: "",
  zaloOaId: "",
  zaloOaUrl: "",
  paymentMethods: ["zalopay", "cash"],
  tableId: "",
  tableNumber: "",
  zaloUserId: "",

  setStoreInfo: (info) => set(info),
  setTableInfo: (info) => set(info),
  setZaloUserId: (zaloUserId) => set({ zaloUserId }),
}));

export function parseQRParams(): { storeSlug: string; tableId: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    storeSlug: params.get("store") || "",
    tableId: params.get("table") || "",
  };
}
