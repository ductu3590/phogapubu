export type ReservationAccess = {
  storeId: string;
  reservationId: string;
  token: string;
};

export type BookingDraft = {
  requestId: string;
  token: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  arrivalAt: string;
  note: string;
};

export type ReservationProfile = {
  customerName: string;
  customerPhone: string;
};

export type CustomerReservation = {
  reservationId: string;
  storeId: string;
  status: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  arrivalAt: string;
  note: string | null;
  requestedArrivalAt: string | null;
  requestedPartySize: number | null;
  createdAt: string;
  updatedAt: string;
  serverNow: string;
  preorderEditDeadline: string;
  canRequestChange: boolean;
  canCancel: boolean;
  canPreorder: boolean;
  customerMessage: string;
  hasChangeRequest: boolean;
};

export type ReservationConfig = {
  storeId: string;
  reservationsEnabled: boolean;
  preorderEnabled: boolean;
  minimumAdvanceMinutes: number;
  bookingHorizonDays: number;
  slotIntervalMinutes: number;
  preorderEditCutoffMinutes: number;
  serverNow: string;
  timezone: "Asia/Ho_Chi_Minh";
  localToday: string;
  minimumDate: string;
  maximumDate: string;
};

export type ReservationSlot = { arrivalAt: string; localTime: string };
