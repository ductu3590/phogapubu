import { useEffect, useMemo, useRef, useState } from "react";
import type { BookingDraft, CustomerReservation, ReservationAccess } from "@/types/reservation.types";
import { getReservationConfig, getReservationSlots, prepareAndPersistBooking, requestBookingChange, submitPersistedBooking } from "@/services/reservation/reservation.api";
import { getBookingDraft, getReservationProfile } from "@/services/reservation/reservation-storage";
import { useReservationConfig, useReservationSlots } from "@/services/reservation/reservation.queries";
import { formatReservationDate } from "@/utils/reservation-display";
import { useAppStore } from "@/stores/app.store";

type Props = {
  mode: "create" | "change";
  booking?: CustomerReservation;
  access?: ReservationAccess;
  onSuccess: (booking: CustomerReservation) => void;
};

function makeRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 0x3) | 0x8).toString(16);
  });
}

export function ReservationForm({ mode, booking, access, onSuccess }: Props) {
  const { storeId } = useAppStore();
  const configQuery = useReservationConfig(storeId);
  const savedDraft = mode === "create" ? getBookingDraft(storeId) : null;
  const profile = useMemo(() => getReservationProfile(storeId), [storeId]);
  const [customerName, setCustomerName] = useState(booking?.customerName ?? savedDraft?.customerName ?? profile?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(booking?.customerPhone ?? savedDraft?.customerPhone ?? profile?.customerPhone ?? "");
  const [partySize, setPartySize] = useState(String(booking?.partySize ?? savedDraft?.partySize ?? 2));
  const [localDate, setLocalDate] = useState(booking ? formatReservationDate(booking.arrivalAt) : savedDraft ? formatReservationDate(savedDraft.arrivalAt) : "");
  const [arrivalAt, setArrivalAt] = useState(booking?.arrivalAt ?? savedDraft?.arrivalAt ?? "");
  const [note, setNote] = useState(booking?.note ?? savedDraft?.note ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const slotsQuery = useReservationSlots(storeId, localDate, !!localDate && (mode === "change" || configQuery.data?.reservationsEnabled === true));

  useEffect(() => {
    if (!localDate && configQuery.data?.minimumDate) setLocalDate(configQuery.data.minimumDate);
  }, [configQuery.data?.minimumDate, localDate]);

  const previousDate = useRef(localDate);
  useEffect(() => {
    if (previousDate.current !== localDate) {
      previousDate.current = localDate;
      setArrivalAt("");
    }
  }, [localDate]);

  const existingDraft = savedDraft;
  const canCreate = configQuery.data?.reservationsEnabled === true;

  const submit = async () => {
    setError("");
    const size = Number(partySize);
    if (!customerName.trim() || !customerPhone.trim() || !Number.isInteger(size) || size < 1 || size > 100 || !arrivalAt) {
      setError("Vui lòng điền đủ họ tên, số điện thoại, số khách và giờ đến.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "change") {
        if (!access) throw new Error("Không tìm thấy quyền đổi đặt bàn trên thiết bị này.");
        const changed = await requestBookingChange(access, arrivalAt, size, note);
        onSuccess(changed);
        return;
      }
      if (existingDraft) {
        const result = await submitPersistedBooking(existingDraft);
        onSuccess(result.reservation);
        return;
      }
      // Làm mới config/slot trước gửi: giờ mở hiện tại không ảnh hưởng booking, server là chốt cuối.
      const freshConfig = await getReservationConfig(storeId);
      if (!freshConfig.reservationsEnabled) throw new Error("Quán hiện chưa nhận đặt bàn trước.");
      const freshSlots = await getReservationSlots(storeId, localDate);
      if (!freshSlots.some((slot) => slot.arrivalAt === arrivalAt)) {
        setArrivalAt("");
        throw new Error("Khung giờ này vừa hết chỗ hoặc không còn hợp lệ. Vui lòng chọn lại.");
      }
      const draft: BookingDraft = await prepareAndPersistBooking({
        requestId: makeRequestId(), storeId, customerName: customerName.trim(), customerPhone: customerPhone.trim(),
        partySize: size, arrivalAt, note: note.trim(),
      });
      const result = await submitPersistedBooking(draft);
      onSuccess(result.reservation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi yêu cầu đặt bàn. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  if (configQuery.isLoading) return <p className="p-4 text-small text-text-secondary">Đang tải thời gian đặt bàn…</p>;
  if (configQuery.error) return <p className="p-4 text-small text-[#C0341A]">Không tải được cấu hình đặt bàn. Vui lòng thử lại.</p>;
  if (mode === "create" && !canCreate) return <p className="m-4 rounded-xl bg-[#FDEDE9] p-3 text-small text-[#9A4634]">Quán hiện chưa nhận đặt bàn trước.</p>;

  return (
    <div className="space-y-4 p-4 pb-8">
      {existingDraft && <p className="rounded-xl bg-amber-50 p-3 text-small text-amber-800">Có một yêu cầu đang gửi dở. Bấm gửi lại để tránh tạo trùng đặt bàn.</p>}
      <label className="block text-small font-medium">Họ và tên<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={100} className="mt-1.5 w-full rounded-xl border border-neutral200 px-3 py-2.5" placeholder="Tên người đặt" /></label>
      <label className="block text-small font-medium">Số điện thoại<input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" maxLength={20} className="mt-1.5 w-full rounded-xl border border-neutral200 px-3 py-2.5" placeholder="Số để quán liên hệ" /></label>
      <label className="block text-small font-medium">Số khách<input value={partySize} onChange={(e) => setPartySize(e.target.value)} inputMode="numeric" type="number" min={1} max={100} className="mt-1.5 w-full rounded-xl border border-neutral200 px-3 py-2.5" /></label>
      <label className="block text-small font-medium">Ngày đến<input type="date" value={localDate} min={configQuery.data?.minimumDate} max={configQuery.data?.maximumDate} onChange={(e) => setLocalDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-neutral200 px-3 py-2.5" /></label>
      <div><p className="text-small font-medium">Giờ đến</p><div className="mt-2 flex flex-wrap gap-2">{slotsQuery.isLoading && <span className="text-small text-text-secondary">Đang tải giờ trống…</span>}{slotsQuery.data?.map((slot) => <button type="button" key={slot.arrivalAt} onClick={() => setArrivalAt(slot.arrivalAt)} className={`rounded-lg border px-3 py-2 text-small ${arrivalAt === slot.arrivalAt ? "border-primary bg-primary text-white" : "border-neutral200 bg-white"}`}>{slot.localTime}</button>)}{!slotsQuery.isLoading && localDate && slotsQuery.data?.length === 0 && <span className="text-small text-text-secondary">Không còn giờ phù hợp trong ngày này.</span>}</div></div>
      <label className="block text-small font-medium">Ghi chú cho quán (không bắt buộc)<textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} maxLength={1000} className="mt-1.5 min-h-20 w-full rounded-xl border border-neutral200 px-3 py-2.5" placeholder="Ví dụ: có trẻ nhỏ, cần ghế em bé" /></label>
      {error && <p className="rounded-xl bg-[#FDEDE9] p-3 text-small text-[#C0341A]">{error}</p>}
      <button type="button" onClick={submit} disabled={submitting || slotsQuery.isLoading} className="w-full rounded-xl bg-primary py-3 text-small-m font-bold text-white disabled:opacity-50">{submitting ? "Đang gửi…" : mode === "change" ? "Gửi yêu cầu đổi lịch" : existingDraft ? "Gửi lại yêu cầu đặt bàn" : "Gửi yêu cầu đặt bàn"}</button>
    </div>
  );
}
