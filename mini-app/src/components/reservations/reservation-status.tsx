import type { CustomerReservation } from "@/types/reservation.types";
import { formatReservationTime, reservationActions } from "@/utils/reservation-display";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Chờ quán xác nhận", className: "bg-warning-bg text-warning" },
  confirmed: { label: "Đã xác nhận", className: "bg-success-bg text-success" },
  rejected: { label: "Quán chưa nhận", className: "bg-critical-bg text-critical" },
  cancelled_by_customer: { label: "Đã hủy", className: "bg-neutral100 text-text-secondary" },
  cancelled_by_store: { label: "Quán đã hủy", className: "bg-critical-bg text-critical" },
  arrived: { label: "Bạn đã đến quán", className: "bg-info-bg text-info" },
  no_show: { label: "Không đến", className: "bg-neutral100 text-text-secondary" },
  completed: { label: "Đã hoàn tất", className: "bg-neutral100 text-text-secondary" },
};

export function ReservationStatus({ booking, compact = false }: { booking: CustomerReservation; compact?: boolean }) {
  const status = STATUS[booking.status] ?? { label: booking.status, className: "bg-neutral100 text-text-secondary" };
  const actions = reservationActions(booking);
  return (
    <div className={compact ? "" : "rounded-2xl bg-surface p-4 shadow-sm"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">{formatReservationTime(booking.arrivalAt)}</p>
          <p className="mt-1 text-small text-text-secondary">{booking.partySize} khách · {booking.customerName}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xxsmall font-semibold ${status.className}`}>{status.label}</span>
      </div>
      {!compact && <p className="mt-3 text-small text-text-secondary">{actions.message}</p>}
      {booking.hasChangeRequest && (
        <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xxsmall text-warning">Yêu cầu đổi lịch đang chờ quán xác nhận. Lịch cũ vẫn có hiệu lực.</p>
      )}
      {booking.status === "confirmed" && booking.canPreorder && (
        <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-small text-primary">Bạn có thể chọn món trước để quán chuẩn bị chu đáo hơn.</p>
      )}
    </div>
  );
}
