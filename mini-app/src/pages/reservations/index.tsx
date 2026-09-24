import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/app.store";
import { getBookingAccesses } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { ReservationStatus } from "@/components/reservations/reservation-status";

function BookingRow({ storeId, reservationId }: { storeId: string; reservationId: string }) {
  const access = getBookingAccesses(storeId).find((item) => item.reservationId === reservationId) ?? null;
  const query = useCustomerReservation(access, reservationId);
  if (!access || query.isError) return null;
  if (query.isLoading || !query.data) return <div className="rounded-2xl bg-white p-4 text-small text-text-secondary">Đang tải đặt bàn…</div>;
  return <Link to={`/reservations/${reservationId}`} className="block"><ReservationStatus booking={query.data} compact /></Link>;
}

export default function ReservationsPage() {
  const navigate = useNavigate();
  const { storeId, workflow } = useAppStore();
  const accesses = getBookingAccesses(storeId);
  const canCreate = workflow?.reservationsEnabled === true;
  return <div className="min-h-full bg-[#F7F8FA] p-4"><div className="mb-4 flex items-center justify-between"><div><h1 className="text-large font-bold">Đặt bàn của tôi</h1><p className="mt-1 text-small text-text-secondary">Theo dõi các đặt bàn trên thiết bị này.</p></div>{canCreate && <button onClick={() => navigate("/reservations/new")} className="rounded-xl bg-primary px-3 py-2 text-small font-bold text-white">Đặt bàn</button>}</div><div className="space-y-3">{accesses.map((access) => <BookingRow key={access.reservationId} storeId={storeId} reservationId={access.reservationId} />)}{accesses.length === 0 && <div className="rounded-2xl bg-white p-5 text-center"><p className="font-medium">Chưa có đặt bàn nào trên thiết bị này</p>{canCreate && <button onClick={() => navigate("/reservations/new")} className="mt-3 text-small font-semibold text-primary">Đặt bàn trước</button>}</div>}</div></div>;
}
