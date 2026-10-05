export interface PublicWorkflow {
  tableOrderingEnabled: boolean;
  takeawayEnabled: boolean;
  shippingEnabled: boolean;
  reservationsEnabled: boolean;
  /** pos_confirmation = thu ngân duyệt rồi in phiếu bếp, không có màn bếp (mô hình Bảo Lương). */
  kitchenReleasePolicy: "automatic" | "pos_confirmation";
}

export type RootCapabilities = {
  readOnlyMenu: boolean;
  pickup: boolean;
  delivery: boolean;
  reservation: boolean;
};

export type EntryContext =
  | { kind: "root" }
  | { kind: "table"; tableId: string; tableNumber: string };
