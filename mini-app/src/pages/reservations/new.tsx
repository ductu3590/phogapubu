import { useNavigate } from "react-router-dom";
import { ReservationForm } from "@/components/reservations/reservation-form";

export default function NewReservationPage() {
  const navigate = useNavigate();
  return <div className="min-h-full bg-[#F7F8FA]"><div className="px-4 pt-4"><h1 className="text-large font-bold">Đặt bàn trước</h1><p className="mt-1 text-small text-text-secondary">Quán sẽ xác nhận và sắp xếp bàn cho bạn.</p></div><ReservationForm mode="create" onSuccess={(booking) => navigate(`/reservations/${booking.reservationId}`, { replace: true })} /></div>;
}
