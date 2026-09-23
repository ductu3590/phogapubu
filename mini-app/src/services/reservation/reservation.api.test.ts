import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../supabase", () => ({ supabase: { rpc } }));

import {
  cancelBooking,
  getBooking,
  getReservationConfig,
  getReservationSlots,
  prepareBooking,
  requestBookingChange,
  prepareAndPersistBooking,
  submitBooking,
  submitPersistedBooking,
} from "./reservation.api";
import * as reservationStorage from "./reservation-storage";

const draft = {
  requestId: "request-1",
  token: "a".repeat(64),
  storeId: "store-1",
  customerName: "Nguyễn Văn A",
  customerPhone: "0900000000",
  partySize: 4,
  arrivalAt: "2026-09-25T12:00:00.000Z",
  note: "Gần cửa sổ",
};

const reservation = {
  reservation_id: "reservation-1",
  store_id: "store-1",
  status: "pending",
  customer_name: "Nguyễn Văn A",
  customer_phone: "0900000000",
  party_size: 4,
  arrival_at: "2026-09-25T12:00:00.000Z",
  note: null,
  requested_arrival_at: null,
  requested_party_size: null,
  created_at: "2026-09-24T00:00:00.000Z",
  updated_at: "2026-09-24T00:00:00.000Z",
  server_now: "2026-09-24T00:00:00.000Z",
  preorder_edit_deadline: "2026-09-25T11:30:00.000Z",
  can_request_change: true,
  can_cancel: true,
  can_preorder: false,
  customer_message: "Quán chưa xác nhận — đặt bàn chưa được bảo đảm",
  has_change_request: false,
};

describe("reservation API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    rpc.mockReset();
  });

  it("prepare chỉ trả token do server cấp và không tự sinh token phía client", async () => {
    rpc.mockResolvedValue({ data: { customer_token: "b".repeat(64), expires_at: "2026-09-25T00:00:00.000Z" }, error: null });

    await expect(prepareBooking("store-1", "request-1")).resolves.toEqual({
      token: "b".repeat(64), expiresAt: "2026-09-25T00:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("prepare_reservation_request", {
      p_store_id: "store-1",
      p_client_request_id: "request-1",
    });
  });

  it("submit retry giữ nguyên request ID, token và payload", async () => {
    rpc.mockResolvedValue({ data: { created: false, reservation }, error: null });

    await expect(submitBooking(draft)).resolves.toEqual({ created: false, reservation: expect.objectContaining({ reservationId: "reservation-1" }) });
    expect(rpc).toHaveBeenCalledWith("create_customer_reservation", {
      p_store_id: draft.storeId,
      p_client_request_id: draft.requestId,
      p_customer_token: draft.token,
      p_customer_name: draft.customerName,
      p_customer_phone: draft.customerPhone,
      p_party_size: draft.partySize,
      p_arrival_at: draft.arrivalAt,
      p_note: draft.note,
      p_zalo_user_id: null,
    });
  });

  it("lưu token + draft trước create, rồi lưu access trước khi xóa draft", async () => {
    const saveDraft = vi.spyOn(reservationStorage, "saveBookingDraft").mockReturnValue(true);
    const saveAccess = vi.spyOn(reservationStorage, "saveBookingAccess").mockReturnValue(true);
    const clearDraft = vi.spyOn(reservationStorage, "clearBookingDraft").mockImplementation(() => undefined);
    const saveProfile = vi.spyOn(reservationStorage, "saveReservationProfile").mockReturnValue(true);
    rpc.mockResolvedValueOnce({ data: { customer_token: "b".repeat(64), expires_at: "2026-09-25T00:00:00.000Z" }, error: null })
      .mockResolvedValueOnce({ data: { created: true, reservation }, error: null });

    const persisted = await prepareAndPersistBooking({ ...draft, token: "" });
    await expect(submitPersistedBooking(persisted)).resolves.toEqual(expect.objectContaining({ created: true }));

    expect(saveDraft).toHaveBeenCalledBefore(saveAccess);
    expect(saveAccess).toHaveBeenCalledBefore(clearDraft);
    expect(saveProfile).toHaveBeenCalledWith(draft.storeId, { customerName: draft.customerName, customerPhone: draft.customerPhone });
  });

  it("không gửi create nếu không lưu được draft; response create mất thì giữ draft để retry", async () => {
    vi.spyOn(reservationStorage, "saveBookingDraft").mockReturnValue(false);
    rpc.mockResolvedValue({ data: { customer_token: "b".repeat(64), expires_at: "2026-09-25T00:00:00.000Z" }, error: null });
    await expect(prepareAndPersistBooking({ ...draft, token: "" })).rejects.toThrow("Không thể lưu an toàn yêu cầu đặt bàn");
    expect(rpc).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const saveDraft = vi.spyOn(reservationStorage, "saveBookingDraft").mockReturnValue(true);
    rpc.mockResolvedValue({ data: null, error: new Error("mất mạng") });
    await expect(submitPersistedBooking(draft)).rejects.toThrow("mất mạng");
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("đọc/đổi/hủy chỉ gọi RPC capability, không đọc bảng reservation", async () => {
    rpc.mockResolvedValue({ data: reservation, error: null });
    const access = { storeId: "store-1", reservationId: "reservation-1", token: "a".repeat(64) };

    await getBooking(access);
    await requestBookingChange(access, "2026-09-26T12:00:00.000Z", 5, "Đổi giờ");
    await cancelBooking(access, "Không đi được");

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "get_customer_reservation",
      "request_reservation_change",
      "cancel_customer_reservation",
    ]);
    expect(rpc).toHaveBeenNthCalledWith(2, "request_reservation_change", {
      p_reservation_id: access.reservationId,
      p_customer_token: access.token,
      p_requested_arrival_at: "2026-09-26T12:00:00.000Z",
      p_requested_party_size: 5,
      p_change_note: "Đổi giờ",
    });
  });

  it("không dùng access của quán khác và không trả fallback khi server lỗi", async () => {
    await expect(getBooking({ storeId: "", reservationId: "reservation-1", token: "a".repeat(64) })).rejects.toThrow("Thiếu thông tin đặt bàn");
    expect(rpc).not.toHaveBeenCalled();
    const error = new Error("Không có quyền xem đặt bàn này");
    rpc.mockResolvedValue({ data: null, error });
    await expect(getBooking({ storeId: "store-1", reservationId: "reservation-1", token: "a".repeat(64) })).rejects.toBe(error);
  });

  it("cấu hình và slots dùng đúng instant server trả về", async () => {
    rpc.mockResolvedValueOnce({ data: { timezone: "Asia/Ho_Chi_Minh", server_now: "2026-09-24T00:00:00.000Z", reservations_enabled: true, preorder_enabled: true, minimum_advance_minutes: 30, booking_horizon_days: 7, slot_interval_minutes: 15, preorder_edit_cutoff_minutes: 30, local_today: "2026-09-24", minimum_date: "2026-09-24", maximum_date: "2026-09-30" }, error: null })
      .mockResolvedValueOnce({ data: [{ arrival_at: "2026-09-25T12:00:00.000Z", local_time: "19:00" }], error: null });
    await expect(getReservationConfig("store-1")).resolves.toMatchObject({ timezone: "Asia/Ho_Chi_Minh" });
    await expect(getReservationSlots("store-1", "2026-09-25")).resolves.toEqual([{ arrivalAt: "2026-09-25T12:00:00.000Z", localTime: "19:00" }]);
  });
});
