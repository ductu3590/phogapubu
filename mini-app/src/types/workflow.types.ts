export interface PublicWorkflow {
  tableOrderingEnabled: boolean;
  takeawayEnabled: boolean;
  shippingEnabled: boolean;
  reservationsEnabled: boolean;
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
