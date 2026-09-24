import type { BookingDraft, ReservationAccess, ReservationProfile } from "@/types/reservation.types";

const ACCESS_PREFIX = "mevo_reservation_access:";
const ACCESS_INDEX_PREFIX = "mevo_reservation_accesses:";
const DRAFT_PREFIX = "mevo_reservation_draft:";
const PROFILE_PREFIX = "mevo_reservation_profile:";

function key(prefix: string, storeId: string) {
  return `${prefix}${storeId}`;
}

function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function read<T>(storageKey: string, valid: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : null;
  } catch {
    return null;
  }
}

function write(storageKey: string, value: unknown): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function validAccess(value: unknown): value is ReservationAccess {
  const v = value as Partial<ReservationAccess> | null;
  return !!v && typeof v.storeId === "string" && !!v.storeId
    && typeof v.reservationId === "string" && !!v.reservationId && isToken(v.token);
}

function validDraft(value: unknown): value is BookingDraft {
  const v = value as Partial<BookingDraft> | null;
  return !!v && typeof v.requestId === "string" && !!v.requestId && isToken(v.token)
    && typeof v.storeId === "string" && !!v.storeId
    && typeof v.customerName === "string" && typeof v.customerPhone === "string"
    && typeof v.partySize === "number" && typeof v.arrivalAt === "string" && typeof v.note === "string";
}

function validProfile(value: unknown): value is ReservationProfile {
  const v = value as Partial<ReservationProfile> | null;
  return !!v && typeof v.customerName === "string" && typeof v.customerPhone === "string";
}

function accessKey(storeId: string, reservationId: string) {
  return `${ACCESS_PREFIX}${storeId}:${reservationId}`;
}

export function getBookingAccesses(storeId: string): ReservationAccess[] {
  const ids = read(key(ACCESS_INDEX_PREFIX, storeId), (value): value is string[] =>
    Array.isArray(value) && value.every((id) => typeof id === "string" && !!id),
  ) ?? [];
  return ids.map((reservationId) => read(accessKey(storeId, reservationId), validAccess))
    .filter((access): access is ReservationAccess => !!access && access.storeId === storeId);
}

export function getBookingAccess(storeId: string, reservationId?: string): ReservationAccess | null {
  const accesses = getBookingAccesses(storeId);
  const access = reservationId
    ? read(accessKey(storeId, reservationId), validAccess)
    : accesses.length > 0 ? accesses[accesses.length - 1] : null;
  return access?.storeId === storeId ? access : null;
}

export function saveBookingAccess(access: ReservationAccess): boolean {
  if (!validAccess(access) || !write(accessKey(access.storeId, access.reservationId), access)) return false;
  const ids = getBookingAccesses(access.storeId).map((item) => item.reservationId);
  if (!ids.includes(access.reservationId)) ids.push(access.reservationId);
  return write(key(ACCESS_INDEX_PREFIX, access.storeId), ids);
}

export function getBookingDraft(storeId: string): BookingDraft | null {
  const draft = read(key(DRAFT_PREFIX, storeId), validDraft);
  return draft?.storeId === storeId ? draft : null;
}

export function saveBookingDraft(draft: BookingDraft): boolean {
  return validDraft(draft) && write(key(DRAFT_PREFIX, draft.storeId), draft);
}

export function clearBookingDraft(storeId: string): void {
  try { localStorage.removeItem(key(DRAFT_PREFIX, storeId)); } catch { /* storage không khả dụng */ }
}

export function getReservationProfile(storeId: string): ReservationProfile | null {
  return read(key(PROFILE_PREFIX, storeId), validProfile);
}

export function saveReservationProfile(storeId: string, profile: ReservationProfile): boolean {
  return validProfile(profile) && write(key(PROFILE_PREFIX, storeId), profile);
}
