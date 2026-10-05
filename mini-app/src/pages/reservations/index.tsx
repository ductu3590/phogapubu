import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/app.store";
import { getBookingAccesses } from "@/services/reservation/reservation-storage";
import { useCustomerReservations } from "@/services/reservation/reservation.queries";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { useAfterBooking } from "@/hooks/use-after-booking";
import StatusPill from "@/components/ui/status-pill";
import DirectionsButton from "@/components/ui/directions-button";
import { CalendarDaysIcon, UsersIcon, UtensilsIcon } from "@/components/common/icons";
import type { CustomerReservation } from "@/types/reservation.types";
import { formatReservationTime, reservationActions, reservationTone } from "@/utils/reservation-display";
import { splitBookings } from "@/utils/booking-groups";
import { isPreorderPostponed, postponePreorder } from "@/utils/preorder-later";
import { directionsUrl } from "@/utils/directions";
import { cn } from "@/utils/cn";

// Tab "Đặt bàn" GỘP (quyết định 2026-10-05, thay hai tab Đặt bàn + Đơn của tôi):
// - đang có lịch hẹn (chờ xác nhận / đã xác nhận) → thẻ lịch hẹn ở đầu + nút phụ "Đặt thêm bàn khác";
// - chưa có → form đặt bàn ngay;
// - lượt đã xong → "Lịch sử đặt bàn" thu gọn.
// Mục tiêu: khách đã đặt không gặp form trống (đặt trùng / tưởng lần trước chưa đặt được).
export default function ReservationsPage() {
  const navigate = useNavigate();
  const afterBooking = useAfterBooking();
  const { storeId, workflow, storeAddress, googleMapsUrl } = useAppStore();
  const accesses = getBookingAccesses(storeId);
  const queries = useCustomerReservations(accesses);
  const canCreate = workflow?.reservationsEnabled === true;
  const loading = queries.some((q) => q.isLoading);
  const bookings: CustomerReservation[] = [];
  for (const q of queries) if (q.data) bookings.push(q.data); // không dùng flatMap: nhắm Android 5
  const { active, history } = splitBookings(bookings);
  const directions = directionsUrl(googleMapsUrl, storeAddress);

  if (loading && bookings.length === 0) {
    return <div className="space-y-3 p-3">{[1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />)}</div>;
  }

  const historyBlock = history.length > 0 ? <HistorySection bookings={history} /> : null;

  // Chưa có lịch hẹn nào đang chờ → form ngay (lối vào lịch sử nằm ở đầu form).
  if (active.length === 0 && canCreate) {
    return (
      <div className="h-full bg-background">
        <ReservationForm
          mode="create"
          header={historyBlock && <div className="pt-3">{historyBlock}</div>}
          onSuccess={afterBooking}
        />
      </div>
    );
  }

  return (
    <div className="pb-6">
      {active.length > 0 && (
        <>
          <p className="px-4 pb-1 pt-4 text-xxsmall font-bold uppercase tracking-wide text-text-secondary">
            Lịch hẹn của bạn
          </p>
          <div className="space-y-3">
            {active.map((b) => <ActiveBookingCard key={b.reservationId} booking={b} directions={directions} />)}
          </div>
        </>
      )}

      {canCreate ? (
        <button
          type="button"
          onClick={() => navigate("/reservations/new")}
          className="mx-3 mt-4 flex h-12 w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-2xl border border-primary bg-surface text-small-m font-bold text-primary"
        >
          <CalendarDaysIcon className="size-5" />
          Đặt thêm bàn khác
        </button>
      ) : (
        <p className="mx-3 mt-4 rounded-xl bg-neutral100 px-3 py-2.5 text-center text-small text-text-secondary">Quán tạm ngừng nhận đặt bàn trước.</p>
      )}

      {historyBlock && <div className="mt-4">{historyBlock}</div>}
    </div>
  );
}

function ActiveBookingCard({ booking, directions }: { booking: CustomerReservation; directions: string | null }) {
  const navigate = useNavigate();
  // "Để sau" → ẩn hàng nút chọn món của lượt này (nhớ trên máy); vẫn chọn được trong Chi tiết.
  const [postponed, setPostponed] = useState(() => isPreorderPostponed(booking.storeId, booking.reservationId));
  const status = reservationTone(booking.status);
  const actions = reservationActions(booking);
  return (
    <section className="mx-3 rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-large-m font-bold text-text-primary">{formatReservationTime(booking.arrivalAt)}</p>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-small text-text-secondary">
        <UsersIcon className="size-4" />
        {booking.partySize} khách · {booking.customerName}
      </p>
      <p className="mt-2 text-small text-text-secondary">{actions.message}</p>
      {booking.hasChangeRequest && (
        <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xxsmall text-warning">Yêu cầu đổi lịch đang chờ quán xác nhận.</p>
      )}

      {booking.status === "confirmed" && booking.canPreorder && !postponed && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/reservations/${booking.reservationId}/preorder`)}
            className="flex h-11 flex-[1.7] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-2 text-small-m font-bold text-white active:opacity-90"
          >
            <UtensilsIcon className="size-4" />
            Chọn món đặt trước
          </button>
          <button
            type="button"
            onClick={() => { postponePreorder(booking.storeId, booking.reservationId); setPostponed(true); }}
            className="flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-primary/10 px-2 text-small-m font-semibold text-primary active:opacity-80"
          >
            Để sau
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Link
          to={`/reservations/${booking.reservationId}`}
          className="flex h-9 flex-1 items-center justify-center rounded-full border border-neutral200 text-xxsmall font-bold text-text-primary"
        >
          Xem chi tiết · Sửa / Huỷ
        </Link>
        {directions && <DirectionsButton url={directions} />}
      </div>
    </section>
  );
}

function HistorySection({ bookings }: { bookings: CustomerReservation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-3 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-small-m font-semibold text-text-primary">Lịch sử đặt bàn ({bookings.length})</span>
        <span className={cn("text-text-secondary transition-transform", open && "rotate-90")} aria-hidden>›</span>
      </button>
      {open && (
        <ul className="divide-y divide-neutral100 border-t border-neutral100">
          {bookings.map((b) => {
            const status = reservationTone(b.status);
            return (
              <li key={b.reservationId}>
                <Link to={`/reservations/${b.reservationId}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-small font-semibold text-text-primary">{formatReservationTime(b.arrivalAt)}</span>
                    <span className="block text-xxsmall text-text-secondary">{b.partySize} khách · {b.customerName}</span>
                  </span>
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
