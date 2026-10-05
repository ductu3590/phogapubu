import { ReservationForm } from "@/components/reservations/reservation-form";
import { useAfterBooking } from "@/hooks/use-after-booking";

// "Đặt thêm bàn khác" — form riêng; gửi xong quay về tab Đặt bàn (lịch hẹn mới hiện ở đầu trang).
export default function NewReservationPage() {
  const afterBooking = useAfterBooking();
  return (
    <div className="h-full bg-background">
      <ReservationForm mode="create" onSuccess={afterBooking} />
    </div>
  );
}
