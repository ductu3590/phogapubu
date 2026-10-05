import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cancelBooking } from "@/services/reservation/reservation.api";
import { getBookingAccess } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { getPreorders } from "@/services/reservation/preorder.api";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { formatReservationTime, reservationActions, reservationTone } from "@/utils/reservation-display";
import { directionsUrl } from "@/utils/directions";
import { formatCurrency } from "@/utils/format";
import { useAppStore } from "@/stores/app.store";
import { cn } from "@/utils/cn";
import SectionCard from "@/components/ui/section-card";
import StatusPill from "@/components/ui/status-pill";
import ConfirmSheet from "@/components/ui/confirm-sheet";
import DirectionsButton from "@/components/ui/directions-button";
import { CalendarDaysIcon, MapPinIcon, PhoneIcon, UtensilsIcon } from "@/components/common/icons";

const TONE_BG = {
  success: "border-success-border bg-success-bg",
  info: "border-info-border bg-info-bg",
  warning: "border-warning-border bg-warning-bg",
  critical: "border-critical-border bg-critical-bg",
  neutral: "border-neutral200 bg-surface",
} as const;

// Chi tiết đặt bàn (Stitch m03). Bỏ khối "Vị trí bố trí" (khách không nhận được bàn đã xếp),
// mã QR check-in, "Khách quen Hạng Vàng". Logic đổi lịch / huỷ / đặt món trước giữ nguyên.
export default function ReservationDetailPage() {
  const { reservationId = "" } = useParams();
  const navigate = useNavigate();
  const { storeId, storeName, storePhone, storeAddress, googleMapsUrl } = useAppStore();
  const access = getBookingAccess(storeId, reservationId);
  const query = useCustomerReservation(access, reservationId);
  const preorders = useQuery({
    queryKey: ["reservation-preorders", storeId, reservationId],
    queryFn: () => getPreorders(access!),
    enabled: !!access && query.data?.status === "confirmed",
  });
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [callingLater, setCallingLater] = useState(false);

  if (!access) return <p className="p-4 text-small text-text-secondary">Không tìm thấy quyền xem đặt bàn này trên thiết bị. Vui lòng liên hệ quán.</p>;
  if (query.isLoading) return <div className="space-y-3 p-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />)}</div>;
  if (query.error || !query.data) return <p className="p-4 text-small text-critical">Không thể tải đặt bàn khi đang ngoại tuyến. Hãy thử lại khi có mạng.</p>;

  const booking = query.data;
  const actions = reservationActions(booking);
  const status = reservationTone(booking.status);
  const directions = directionsUrl(googleMapsUrl, storeAddress);

  const cancel = async () => {
    setCancelling(true);
    setError("");
    try {
      await cancelBooking(access, "Khách hủy từ Mini App");
      setConfirmCancel(false);
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể hủy đặt bàn");
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  };

  if (changing) {
    return (
      <div className="pb-6">
        <p className="mx-3 mt-3 rounded-xl bg-info-bg p-3 text-small text-info">Gửi yêu cầu đổi giờ / số khách. Lịch cũ vẫn giữ cho tới khi quán duyệt.</p>
        <ReservationForm mode="change" booking={booking} access={access} onSuccess={() => { setChanging(false); void query.refetch(); }} />
        <button type="button" onClick={() => setChanging(false)} className="mx-3 mt-2 w-[calc(100%-1.5rem)] py-2 text-small text-text-secondary">Thôi, giữ lịch cũ</button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Thẻ trạng thái */}
      <section className={cn("mx-3 mt-3 rounded-2xl border p-4", TONE_BG[status.tone])}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-normal-sb font-bold text-text-primary">{formatReservationTime(booking.arrivalAt)}</p>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
        <p className="mt-1.5 text-small text-text-secondary">{actions.message}</p>
        {booking.hasChangeRequest && (
          <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xxsmall text-warning">Yêu cầu đổi lịch đang chờ quán xác nhận. Lịch cũ vẫn có hiệu lực.</p>
        )}
      </section>

      {/* Đặt món trước khi đến / Món đã đặt trước */}
      {preorders.data && preorders.data.length > 0 ? (
        <SectionCard title="Món đã đặt trước" subtitle="Món đã chốt, quán sẽ chuẩn bị theo giờ hẹn" icon={<UtensilsIcon />}>
          {preorders.data.map((batch) => (
            <ul key={batch.orderId} className="space-y-1.5">
              {batch.items.map((item) => (
                <li key={`${item.menuItemId}-${item.variantId ?? ""}`} className="flex items-baseline justify-between gap-3 text-xsmall">
                  <span className="line-clamp-2 min-w-0 flex-1 text-text-primary">{item.name}</span>
                  <span className="shrink-0 whitespace-nowrap"><span className="text-text-secondary">×{item.quantity}</span> · <b className="font-semibold">{formatCurrency(item.price * item.quantity)}đ</b></span>
                </li>
              ))}
            </ul>
          ))}
        </SectionCard>
      ) : booking.status === "confirmed" && booking.canPreorder ? (
        <SectionCard title="Đặt món trước khi đến" subtitle="Quán chuẩn bị sẵn món theo giờ hẹn, đến là có ngay" icon={<UtensilsIcon />}>
          <button
            type="button"
            onClick={() => navigate(`/reservations/${reservationId}/preorder`)}
            className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-normal-sb font-bold text-white shadow active:opacity-90"
          >
            Chọn món đặt trước
          </button>
          {!callingLater ? (
            <button type="button" onClick={() => setCallingLater(true)} className="mt-2 w-full py-2 text-small text-text-secondary">Để gọi món khi đến quán</button>
          ) : (
            <p className="mt-2 text-center text-xxsmall text-text-secondary">Đã ghi nhận — bạn vẫn có thể gọi món khi đến quán.</p>
          )}
        </SectionCard>
      ) : null}

      {/* Chi tiết lịch hẹn */}
      <SectionCard title="Chi tiết lịch hẹn" icon={<CalendarDaysIcon />}>
        <dl className="divide-y divide-neutral100 text-small">
          <Row label="Người đặt" value={booking.customerName} />
          <Row label="Số điện thoại" value={booking.customerPhone} />
          <Row label="Số khách" value={`${booking.partySize} người`} />
          <Row label="Thời gian đến" value={formatReservationTime(booking.arrivalAt)} strong />
        </dl>
        {booking.note && (
          <div className="mt-3 rounded-xl bg-warning-bg/60 px-3 py-2">
            <p className="text-xxsmall font-semibold text-warning">Ghi chú của bạn</p>
            <p className="mt-0.5 text-small italic text-text-primary">“{booking.note}”</p>
          </div>
        )}
      </SectionCard>

      {/* Thông tin quán */}
      <SectionCard title={storeName || "Thông tin quán"} icon={<MapPinIcon />}>
        {storeAddress && (
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-small text-text-primary">{storeAddress}</p>
            {directions && <DirectionsButton url={directions} />}
          </div>
        )}
        {storePhone ? (
          <a href={`tel:${storePhone}`} className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-neutral50 px-3 py-2.5">
            <span className="flex items-center gap-2 text-small font-semibold text-text-primary"><PhoneIcon className="size-4 text-text-secondary" />{storePhone}</span>
            <span className="rounded-full bg-primary px-3 py-1.5 text-xxsmall font-bold text-white">Gọi ngay</span>
          </a>
        ) : (
          <p className="mt-2 text-small text-text-secondary">Cần hỗ trợ? Vui lòng hỏi nhân viên tại quán.</p>
        )}
      </SectionCard>

      {error && <p className="mx-3 mt-3 rounded-xl bg-critical-bg p-3 text-small text-critical">{error}</p>}

      {(actions.canRequestChange || actions.canCancel) && (
        <div className="mx-3 mt-4 flex gap-2">
          {actions.canRequestChange && (
            <button type="button" onClick={() => setChanging(true)} className="h-12 flex-1 rounded-2xl border border-primary text-small-m font-bold text-primary">
              Sửa đặt bàn
            </button>
          )}
          {actions.canCancel && (
            <button type="button" onClick={() => setConfirmCancel(true)} className="h-12 flex-1 rounded-2xl border border-critical-border bg-critical-bg text-small-m font-bold text-critical">
              Huỷ bàn
            </button>
          )}
        </div>
      )}

      <ConfirmSheet
        open={confirmCancel}
        title="Huỷ đặt bàn này?"
        description={`${formatReservationTime(booking.arrivalAt)} · ${booking.partySize} khách. Huỷ xong không khôi phục được.`}
        confirmLabel="Huỷ đặt bàn"
        cancelLabel="Giữ lại"
        danger
        busy={cancelling}
        onConfirm={() => void cancel()}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={cn("text-right", strong ? "font-bold text-primary" : "font-medium text-text-primary")}>{value}</dd>
    </div>
  );
}
