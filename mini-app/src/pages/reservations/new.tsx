import { useNavigate } from "react-router-dom";
import { ReservationForm } from "@/components/reservations/reservation-form";

// Tab "Đặt bàn" (Stitch m02) — tiêu đề nằm trên thanh công cụ, form tự có thanh nút dính đáy.
export default function NewReservationPage() {
  const navigate = useNavigate();
  return (
    <div className="h-full bg-background">
      <ReservationForm mode="create" onSuccess={(booking) => navigate(`/reservations/${booking.reservationId}`, { replace: true })} />
    </div>
  );
}
