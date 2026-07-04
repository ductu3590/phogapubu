import { create } from "zustand";

export type PaymentMethod = "zalopay" | "cash";
export type OrderMode = "dine_in" | "takeaway";

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
  takeawayBannerUrl: string;
  aboutText: string;
  wifiName: string;
  wifiPassword: string;
  tableId: string;
  tableNumber: string;
  zaloUserId: string;
  orderMode: OrderMode;

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
    takeawayBannerUrl: string;
    aboutText: string;
    wifiName: string;
    wifiPassword: string;
  }) => void;
  setTableInfo: (info: { tableId: string; tableNumber: string }) => void;
  setZaloUserId: (zaloUserId: string) => void;
  setOrderMode: (mode: OrderMode) => void;
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
  takeawayBannerUrl: "",
  aboutText: "",
  wifiName: "",
  wifiPassword: "",
  tableId: "",
  tableNumber: "",
  zaloUserId: "",
  orderMode: "dine_in",

  setStoreInfo: (info) => set(info),
  setTableInfo: (info) => set(info),
  setZaloUserId: (zaloUserId) => set({ zaloUserId }),
  setOrderMode: (orderMode) => set({ orderMode }),
}));

export function parseQRParams(): {
  storeSlug: string;
  tableId: string;
  orderMode: OrderMode;
} {
  const params = new URLSearchParams(window.location.search);
  const storeSlug =
    params.get("store") ||
    (import.meta.env.VITE_DEFAULT_STORE_SLUG as string) ||
    "";
  const tableId = params.get("table") || "";
  const orderMode: OrderMode =
    storeSlug && !tableId ? "takeaway" : "dine_in";
  return { storeSlug, tableId, orderMode };
}
