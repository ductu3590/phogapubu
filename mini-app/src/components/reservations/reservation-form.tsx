import { useEffect, useMemo, useRef, useState } from "react";
import type { BookingDraft, CustomerReservation, ReservationAccess } from "@/types/reservation.types";
import { getReservationConfig, getReservationSlots, prepareAndPersistBooking, requestBookingChange, resubmitDraftWithEdits, submitPersistedBooking } from "@/services/reservation/reservation.api";
import { getBookingDraft, getReservationProfile } from "@/services/reservation/reservation-storage";
import { errorMessage, normalizeVnPhone } from "@/utils/booking-validation";
import { useReservationConfig, useReservationSlots } from "@/services/reservation/reservation.queries";
import { formatReservationDate } from "@/utils/reservation-display";
import { useAppStore } from "@/stores/app.store";
import { dateChips } from "@/utils/date-chips";
import { cn } from "@/utils/cn";
import SectionCard from "@/components/ui/section-card";
import StickyActionBar from "@/components/ui/sticky-action-bar";
import { CalendarDaysIcon, ClockIcon, FileTextIcon, MinusIcon, PlusIcon, UserIcon, UsersIcon } from "@/components/common/icons";

type Props = {
  mode: "create" | "change";
  booking?: CustomerReservation;
  access?: ReservationAccess;
  onSuccess: (booking: CustomerReservation) => void;
  /** Khối hiện ở đầu form (vd lối vào "Lịch sử đặt bàn" của tab Đặt bàn). */
  header?: React.ReactNode;
};

function makeRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 0x3) | 0x8).toString(16);
  });
}

export function ReservationForm({ mode, booking, access, onSuccess, header }: Props) {
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
  // Lỗi từng ô — hiện ngay dưới ô sai thay vì một câu chung ở cuối form.
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; time?: string; size?: string }>({});
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
    // Đổi lịch chỉ đổi giờ / số khách / ghi chú — tên + SĐT không gửi lên nên không kiểm lại.
    const phone = mode === "create" ? normalizeVnPhone(customerPhone) : ({ ok: true, value: customerPhone.trim() } as const);
    const errors = {
      name: mode === "create" && !customerName.trim() ? "Vui lòng nhập họ tên người đặt." : undefined,
      phone: phone.ok ? undefined : phone.error,
      size: !Number.isInteger(size) || size < 1 || size > 100 ? "Số khách từ 1 đến 100." : undefined,
      time: !arrivalAt ? "Vui lòng chọn giờ đến." : undefined,
    };
    setFieldErrors(errors);
    if (errors.name || errors.phone || errors.size || errors.time || !phone.ok) {
      setError("Vui lòng kiểm tra lại các ô được đánh dấu đỏ.");
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
      // Làm mới config/slot trước gửi: giờ mở hiện tại không ảnh hưởng booking, server là chốt cuối.
      const freshConfig = await getReservationConfig(storeId);
      if (!freshConfig.reservationsEnabled) throw new Error("Quán hiện chưa nhận đặt bàn trước.");
      const freshSlots = await getReservationSlots(storeId, localDate);
      if (!freshSlots.some((slot) => slot.arrivalAt === arrivalAt)) {
        setArrivalAt("");
        setFieldErrors((prev) => ({ ...prev, time: "Khung giờ này vừa hết chỗ hoặc đã qua. Vui lòng chọn giờ khác." }));
        throw new Error("Khung giờ này vừa hết chỗ hoặc không còn hợp lệ. Vui lòng chọn lại.");
      }
      const edits = { customerName: customerName.trim(), customerPhone: phone.value, partySize: size, arrivalAt, note: note.trim() };
      // Đọc lại bản nháp LÚC BẤM GỬI (lần gửi trước trong cùng phiên có thể vừa tạo nháp rồi lỗi).
      // Có nháp → gửi lại với thông tin MỚI, giữ mã yêu cầu cũ để server không tạo trùng.
      const pending = getBookingDraft(storeId);
      if (pending) {
        const result = await resubmitDraftWithEdits(pending, edits, makeRequestId);
        onSuccess(result.reservation);
        return;
      }
      const draft: BookingDraft = await prepareAndPersistBooking({ requestId: makeRequestId(), storeId, ...edits });
      const result = await submitPersistedBooking(draft);
      onSuccess(result.reservation);
    } catch (cause) {
      setError(errorMessage(cause, "Không thể gửi yêu cầu đặt bàn. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  };

  if (configQuery.isLoading) return <p className="p-4 text-small text-text-secondary">Đang tải thời gian đặt bàn…</p>;
  if (configQuery.error) return <p className="p-4 text-small text-primary">Không tải được cấu hình đặt bàn. Vui lòng thử lại.</p>;
  if (mode === "create" && !canCreate) return <p className="m-4 rounded-xl bg-primary/10 p-3 text-small text-primary">Quán hiện chưa nhận đặt bàn trước.</p>;

  const config = configQuery.data;
  const chips = config ? dateChips(config.minimumDate, config.maximumDate, config.localToday, localDate) : [];
  const size = Number(partySize) || 0;
  const setSize = (n: number) => setPartySize(String(Math.min(100, Math.max(1, n))));
  const submitLabel = submitting ? "Đang gửi…" : mode === "change" ? "Gửi yêu cầu đổi lịch" : existingDraft ? "Gửi lại yêu cầu đặt bàn" : "Xác nhận đặt bàn";
  const submitButton = (
    <button
      type="button"
      onClick={submit}
      disabled={submitting || slotsQuery.isLoading}
      className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-normal-sb font-bold text-white shadow active:opacity-90 disabled:opacity-50"
    >
      {submitLabel}
    </button>
  );

  const body = (
    <div className="pb-4">
      {header}
      {existingDraft && <p className="mx-3 mt-3 rounded-xl bg-warning-bg p-3 text-small text-warning">Lần gửi trước chưa thành công. Kiểm tra lại thông tin bên dưới rồi bấm gửi lại — quán sẽ không nhận trùng.</p>}

      {/* 1. Người đặt */}
      <SectionCard title="Thông tin người đặt" subtitle="Quán dùng để liên hệ xác nhận chỗ" icon={<UserIcon />}>
        <div className="space-y-3">
          <Field label="Họ và tên" required error={fieldErrors.name}>
            <input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setFieldErrors((p) => ({ ...p, name: undefined })); }} maxLength={100} placeholder="Tên người đặt" className={cn(INPUT, fieldErrors.name && "border-critical")} />
          </Field>
          <Field label="Số điện thoại" required error={fieldErrors.phone}>
            <input
              value={customerPhone}
              onChange={(e) => { setCustomerPhone(e.target.value); setFieldErrors((p) => ({ ...p, phone: undefined })); }}
              onBlur={() => { if (customerPhone.trim() && mode === "create") { const r = normalizeVnPhone(customerPhone); setFieldErrors((p) => ({ ...p, phone: r.ok ? undefined : r.error })); } }}
              inputMode="tel"
              maxLength={20}
              placeholder="Ví dụ 0962 345 678"
              className={cn(INPUT, fieldErrors.phone && "border-critical")}
            />
          </Field>
        </div>
      </SectionCard>

      {/* 2. Thời gian */}
      <SectionCard
        title="Thời gian đến quán"
        subtitle={config ? `Đặt trước tối thiểu ${config.minimumAdvanceMinutes} phút, trong ${config.bookingHorizonDays} ngày tới` : undefined}
        icon={<CalendarDaysIcon />}
      >
        <p className="text-xxsmall font-semibold text-text-secondary">Chọn ngày</p>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {chips.map((c) => {
            const active = c.value === localDate;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setLocalDate(c.value)}
                className={cn(
                  "flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-2 py-2",
                  active ? "border-primary bg-primary text-white shadow-sm" : "border-neutral200 bg-surface text-text-primary",
                )}
              >
                <span className={cn("whitespace-nowrap text-xxxsmall font-bold", active ? "text-white/90" : c.top === "CN" ? "text-critical" : "text-text-secondary")}>{c.top}</span>
                <span className="text-large-m font-bold leading-tight">{c.day}</span>
                <span className={cn("text-xxxsmall", active ? "text-white/80" : "text-text-secondary")}>{c.month}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xxsmall font-semibold text-text-secondary">Khung giờ</p>
          {config && <p className="flex items-center gap-1 text-xxsmall text-text-secondary"><ClockIcon className="size-3.5" />Mỗi {config.slotIntervalMinutes} phút</p>}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {slotsQuery.data?.map((slot) => (
            <button
              type="button"
              key={slot.arrivalAt}
              onClick={() => { setArrivalAt(slot.arrivalAt); setFieldErrors((p) => ({ ...p, time: undefined })); }}
              className={cn(
                "rounded-lg border py-2 text-small font-semibold tabular-nums",
                arrivalAt === slot.arrivalAt ? "border-primary bg-primary text-white" : "border-neutral200 bg-neutral50 text-text-primary",
              )}
            >
              {slot.localTime}
            </button>
          ))}
        </div>
        {fieldErrors.time && <p className="mt-2 text-xxsmall font-medium text-critical">{fieldErrors.time}</p>}
        {slotsQuery.isLoading && <p className="mt-2 text-small text-text-secondary">Đang tải giờ trống…</p>}
        {!slotsQuery.isLoading && localDate && slotsQuery.data?.length === 0 && (
          <p className="mt-2 text-small text-text-secondary">Ngày này không còn giờ phù hợp — chọn ngày khác nhé.</p>
        )}
      </SectionCard>

      {/* 3. Số khách */}
      <SectionCard title="Số lượng khách" icon={<UsersIcon />}>
        <div className="flex items-center justify-between">
          <span className="text-small text-text-secondary">Số người</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral100 p-1">
            <button type="button" aria-label="Bớt 1 khách" onClick={() => setSize(size - 1)} className="grid size-9 place-items-center rounded-full bg-surface text-text-primary active:scale-95"><MinusIcon className="size-4" /></button>
            <input
              value={partySize}
              onChange={(e) => setPartySize(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              aria-label="Số khách"
              className="w-12 bg-transparent text-center text-large-m font-bold text-text-primary outline-none"
            />
            <button type="button" aria-label="Thêm 1 khách" onClick={() => setSize(size + 1)} className="grid size-9 place-items-center rounded-full bg-primary text-white active:scale-95"><PlusIcon className="size-4" /></button>
          </span>
        </div>
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {[2, 4, 6, 10, 15, 20].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSize(n)}
              className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-small", size === n ? "border-primary bg-primary/10 font-bold text-primary" : "border-neutral200 text-text-secondary")}
            >
              {n} người
            </button>
          ))}
        </div>
      </SectionCard>

      {/* 4. Ghi chú */}
      <SectionCard title="Ghi chú cho quán" subtitle="Không bắt buộc" icon={<FileTextIcon />}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 1000))}
          maxLength={1000}
          placeholder="Ví dụ: có trẻ nhỏ, cần ghế em bé, tổ chức sinh nhật…"
          className="min-h-24 w-full rounded-xl border border-neutral200 bg-neutral50 px-3 py-2.5 text-small outline-none focus:border-primary"
        />
      </SectionCard>

      {error && <p className="mx-3 mt-3 rounded-xl bg-critical-bg p-3 text-small text-critical">{error}</p>}
      {mode === "change" && <div className="mx-3 mt-3">{submitButton}</div>}
    </div>
  );

  // Đặt bàn mới: trang riêng có thanh nút dính đáy. Đổi lịch: nằm trong trang chi tiết, nút ngay dưới form.
  if (mode === "change") return body;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      <StickyActionBar variant="primary" aboveTabBar>{submitButton}</StickyActionBar>
    </div>
  );
}

const INPUT = "w-full rounded-xl border border-neutral200 bg-neutral50 px-3 py-3 text-small outline-none focus:border-primary";

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xxsmall font-semibold text-text-secondary">
        {label}
        {required && <span className="font-medium text-critical">Bắt buộc</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xxsmall font-medium text-critical">{error}</span>}
    </label>
  );
}
