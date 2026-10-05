import type { CustomerReservation } from "@/types/reservation.types";
import { formatReservationTime, reservationActions, reservationTone } from "@/utils/reservation-display";
import StatusPill from "@/components/ui/status-pill";

export function ReservationStatus({ booking, compact = false }: { booking: CustomerReservation; compact?: boolean }) {
  const status = reservationTone(booking.status);
  const actions = reservationActions(booking);
  return (
    <div className={compact ? "" : "rounded-2xl bg-surface p-4 shadow-sm"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">{formatReservationTime(booking.arrivalAt)}</p>
          <p className="mt-1 text-small text-text-secondary">{booking.partySize} khách · {booking.customerName}</p>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
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
