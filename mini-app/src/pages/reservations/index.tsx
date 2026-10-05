import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/app.store";
import { getBookingAccesses } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { formatReservationTime, reservationTone } from "@/utils/reservation-display";
import StatusPill from "@/components/ui/status-pill";
import { CalendarDaysIcon, UsersIcon } from "@/components/common/icons";

function BookingRow({ storeId, reservationId }: { storeId: string; reservationId: string }) {
  const access = getBookingAccesses(storeId).find((item) => item.reservationId === reservationId) ?? null;
  const query = useCustomerReservation(access, reservationId);
  if (!access || query.isError) return null;
  if (query.isLoading || !query.data) return <div className="h-20 animate-pulse rounded-2xl bg-surface" />;
  const booking = query.data;
  const status = reservationTone(booking.status);
  return (
    <Link
      to={`/reservations/${reservationId}`}
      className="flex items-start justify-between gap-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] active:opacity-90"
    >
      <div className="min-w-0">
        <p className="text-normal-sb font-bold text-text-primary">{formatReservationTime(booking.arrivalAt)}</p>
        <p className="mt-1 flex items-center gap-1.5 text-small text-text-secondary">
          <UsersIcon className="size-4" />
          {booking.partySize} khách · {booking.customerName}
        </p>
        {booking.hasChangeRequest && <p className="mt-1 text-xxsmall text-warning">Đang chờ quán duyệt yêu cầu đổi lịch</p>}
      </div>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
    </Link>
  );
}

// Tab "Đơn của tôi" ở lối vào thường của quán đặt bàn (Stitch m03) — các lượt đặt bàn trên máy này.
export default function ReservationsPage() {
  const navigate = useNavigate();
  const { storeId, workflow } = useAppStore();
  const accesses = getBookingAccesses(storeId);
  const canCreate = workflow?.reservationsEnabled === true;

  if (accesses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><CalendarDaysIcon className="size-8" /></span>
        <p className="text-normal-sb font-bold text-text-primary">Chưa có đặt bàn nào</p>
        <p className="text-small text-text-secondary">Các lượt đặt bàn bạn gửi từ máy này sẽ hiện ở đây.</p>
        {canCreate && (
          <button type="button" onClick={() => navigate("/reservations/new")} className="mt-1 rounded-full bg-primary px-5 py-2.5 text-small-m font-bold text-white">
            Đặt bàn trước
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <p className="px-1 text-xxsmall text-text-secondary">Theo dõi các lượt đặt bàn trên thiết bị này.</p>
      {accesses.map((access) => <BookingRow key={access.reservationId} storeId={storeId} reservationId={access.reservationId} />)}
    </div>
  );
}
