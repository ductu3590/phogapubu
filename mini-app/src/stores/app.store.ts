import { create } from "zustand";
import type { ServingShift } from "@/utils/store-hours";
import type { TableSessionState } from "@/types/order.types";
import type { EntryContext, PublicWorkflow } from "@/types/workflow.types";
import { parseEntryContext } from "@/utils/entry-context";

export type { TableSessionState };

export type PaymentMethod = "zalo_checkout" | "cash";
export type OrderMode = "dine_in" | "takeaway";

// Trục "KHI NÀO thu tiền" của quán (mig 039). Khác hẳn PaymentMethod = "thu BẰNG GÌ".
export type PaymentTiming = "prepay" | "postpay";


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
  paymentTiming: PaymentTiming;
  takeawayBannerUrl: string;
  aboutText: string;
  wifiName: string;
  wifiPassword: string;
  isAcceptingOrders: boolean;
  servingHours: ServingShift[];
  deliveryAreaNote: string;
  termsOfUse: string;
  tableId: string;
  tableNumber: string;
  zaloUserId: string;
  deviceId: string;
  orderMode: OrderMode;
  entryContext: EntryContext;
  workflow: PublicWorkflow | null;
  workflowError: string | null;
  sessionState: TableSessionState | null;

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
    paymentTiming: PaymentTiming;
    takeawayBannerUrl: string;
    aboutText: string;
    wifiName: string;
    wifiPassword: string;
    isAcceptingOrders: boolean;
    servingHours: ServingShift[];
    deliveryAreaNote: string;
    termsOfUse: string;
  }) => void;
  setTableInfo: (info: { tableId: string; tableNumber: string }) => void;
  setZaloUserId: (zaloUserId: string) => void;
  setDeviceId: (deviceId: string) => void;
  setSessionState: (sessionState: TableSessionState | null) => void;
  setOrderMode: (mode: OrderMode) => void;
  setEntryContext: (entryContext: EntryContext) => void;
  setWorkflow: (workflow: PublicWorkflow) => void;
  setWorkflowError: (message: string) => void;
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
  paymentMethods: ["zalo_checkout", "cash"],
  paymentTiming: "prepay",
  takeawayBannerUrl: "",
  aboutText: "",
  wifiName: "",
  wifiPassword: "",
  isAcceptingOrders: true,
  servingHours: [],
  deliveryAreaNote: "",
  termsOfUse: "",
  tableId: "",
  tableNumber: "",
  zaloUserId: "",
  deviceId: "",
  orderMode: "dine_in",
  entryContext: { kind: "root" },
  workflow: null,
  workflowError: null,
  sessionState: null,

  setStoreInfo: (info) => set(info),
  setTableInfo: (info) => set(info),
  setZaloUserId: (zaloUserId) => set({ zaloUserId }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setSessionState: (sessionState) => set({ sessionState }),
  setOrderMode: (orderMode) => set({ orderMode }),
  setEntryContext: (entryContext) => set({ entryContext }),
  setWorkflow: (workflow) => set({ workflow, workflowError: null }),
  setWorkflowError: (workflowError) => set({ workflow: null, workflowError }),
}));

export function parseQRParams(): {
  storeSlug: string;
  entryContext: EntryContext;
} {
  const params = new URLSearchParams(window.location.search);
  const storeSlug =
    params.get("store") ||
    (import.meta.env.VITE_DEFAULT_STORE_SLUG as string) ||
    "";
  return { storeSlug, entryContext: parseEntryContext(params) };
}
