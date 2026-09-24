import { supabase } from "@/services/supabase";
import type {
  BookingDraft,
  CustomerReservation,
  ReservationAccess,
  ReservationConfig,
  ReservationSlot,
} from "@/types/reservation.types";
import {
  clearBookingDraft,
  saveBookingAccess,
  saveBookingDraft,
  saveReservationProfile,
} from "./reservation-storage";

type ReservationRow = Record<string, unknown>;

function required(value: string, message = "Thiếu thông tin đặt bàn") {
  if (!value) throw new Error(message);
}

function mapReservation(row: ReservationRow): CustomerReservation {
  return {
    reservationId: String(row.reservation_id), storeId: String(row.store_id), status: String(row.status),
    customerName: String(row.customer_name), customerPhone: String(row.customer_phone),
    partySize: Number(row.party_size), arrivalAt: String(row.arrival_at),
    note: typeof row.note === "string" ? row.note : null,
    requestedArrivalAt: typeof row.requested_arrival_at === "string" ? row.requested_arrival_at : null,
    requestedPartySize: typeof row.requested_party_size === "number" ? row.requested_party_size : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), serverNow: String(row.server_now),
    preorderEditDeadline: String(row.preorder_edit_deadline), canRequestChange: Boolean(row.can_request_change),
    canCancel: Boolean(row.can_cancel), canPreorder: Boolean(row.can_preorder),
    customerMessage: String(row.customer_message), hasChangeRequest: Boolean(row.has_change_request),
  };
}

export async function prepareBooking(storeId: string, requestId: string) {
  required(storeId); required(requestId);
  const { data, error } = await supabase.rpc("prepare_reservation_request", {
    p_store_id: storeId, p_client_request_id: requestId,
  });
  if (error) throw error;
  const row = data as ReservationRow | null;
  if (!row || typeof row.customer_token !== "string" || typeof row.expires_at !== "string") {
    throw new Error("Không thể chuẩn bị yêu cầu đặt bàn");
  }
  return { token: row.customer_token, expiresAt: row.expires_at };
}

export async function submitBooking(draft: BookingDraft): Promise<{ created: boolean; reservation: CustomerReservation }> {
  required(draft.storeId); required(draft.requestId); required(draft.token);
  const { data, error } = await supabase.rpc("create_customer_reservation", {
    p_store_id: draft.storeId, p_client_request_id: draft.requestId, p_customer_token: draft.token,
    p_customer_name: draft.customerName, p_customer_phone: draft.customerPhone,
    p_party_size: draft.partySize, p_arrival_at: draft.arrivalAt, p_note: draft.note || null,
    p_zalo_user_id: null,
  });
  if (error) throw error;
  const row = data as { created?: unknown; reservation?: ReservationRow } | null;
  if (!row?.reservation) throw new Error("Không thể tạo đặt bàn");
  return { created: row.created === true, reservation: mapReservation(row.reservation) };
}

// Draft (gồm capability token) phải được ghi xuống thiết bị TRƯỚC create. Nếu response create
// bị rớt, Task 3 chỉ cần gọi submitPersistedBooking cùng draft này, tuyệt đối không prepare lại.
export async function prepareAndPersistBooking(
  draft: Omit<BookingDraft, "token"> & { token?: string },
): Promise<BookingDraft> {
  const prepared = await prepareBooking(draft.storeId, draft.requestId);
  const persisted: BookingDraft = { ...draft, token: prepared.token };
  if (!saveBookingDraft(persisted)) {
    throw new Error("Không thể lưu an toàn yêu cầu đặt bàn. Vui lòng gọi quán để được hỗ trợ.");
  }
  return persisted;
}

export async function submitPersistedBooking(draft: BookingDraft) {
  const result = await submitBooking(draft);
  const access: ReservationAccess = {
    storeId: draft.storeId,
    reservationId: result.reservation.reservationId,
    token: draft.token,
  };
  // Không xóa draft trước khi access đã lưu; nếu storage đầy, retry vẫn còn nguyên capability.
  if (!saveBookingAccess(access)) {
    throw new Error("Đặt bàn đã được gửi nhưng không thể lưu để theo dõi. Vui lòng gọi quán.");
  }
  saveReservationProfile(draft.storeId, {
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
  });
  clearBookingDraft(draft.storeId);
  return result;
}

export async function getBooking(access: ReservationAccess): Promise<CustomerReservation> {
  required(access.storeId); required(access.reservationId); required(access.token);
  const { data, error } = await supabase.rpc("get_customer_reservation", {
    p_reservation_id: access.reservationId, p_customer_token: access.token,
  });
  if (error) throw error;
  const reservation = mapReservation(data as ReservationRow);
  if (reservation.storeId !== access.storeId) throw new Error("Không có quyền xem đặt bàn này");
  return reservation;
}

export async function requestBookingChange(access: ReservationAccess, arrivalAt: string, partySize: number, note: string) {
  required(access.storeId); required(access.reservationId); required(access.token); required(arrivalAt);
  const { data, error } = await supabase.rpc("request_reservation_change", {
    p_reservation_id: access.reservationId, p_customer_token: access.token,
    p_requested_arrival_at: arrivalAt, p_requested_party_size: partySize, p_change_note: note || null,
  });
  if (error) throw error;
  const reservation = mapReservation(data as ReservationRow);
  if (reservation.storeId !== access.storeId) throw new Error("Không có quyền đổi đặt bàn này");
  return reservation;
}

export async function cancelBooking(access: ReservationAccess, reason: string) {
  required(access.storeId); required(access.reservationId); required(access.token);
  const { data, error } = await supabase.rpc("cancel_customer_reservation", {
    p_reservation_id: access.reservationId, p_customer_token: access.token, p_reason: reason || null,
  });
  if (error) throw error;
  const reservation = mapReservation(data as ReservationRow);
  if (reservation.storeId !== access.storeId) throw new Error("Không có quyền hủy đặt bàn này");
  return reservation;
}

export async function getReservationConfig(storeId: string): Promise<ReservationConfig> {
  required(storeId);
  const { data, error } = await supabase.rpc("get_public_reservation_config", { p_store_id: storeId });
  if (error) throw error;
  const row = data as ReservationRow | null;
  if (!row) throw new Error("Không tải được cấu hình đặt bàn");
  return {
    storeId: String(row.store_id), reservationsEnabled: Boolean(row.reservations_enabled), preorderEnabled: Boolean(row.preorder_enabled),
    minimumAdvanceMinutes: Number(row.minimum_advance_minutes), bookingHorizonDays: Number(row.booking_horizon_days),
    slotIntervalMinutes: Number(row.slot_interval_minutes), preorderEditCutoffMinutes: Number(row.preorder_edit_cutoff_minutes),
    serverNow: String(row.server_now), timezone: "Asia/Ho_Chi_Minh", localToday: String(row.local_today),
    minimumDate: String(row.minimum_date), maximumDate: String(row.maximum_date),
  };
}

export async function getReservationSlots(storeId: string, localDate: string): Promise<ReservationSlot[]> {
  required(storeId); required(localDate);
  const { data, error } = await supabase.rpc("get_reservation_slots", { p_store_id: storeId, p_local_date: localDate });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return (data as ReservationRow[]).map((slot) => ({
    arrivalAt: String(slot.arrival_at), localTime: String(slot.local_time),
  }));
}
