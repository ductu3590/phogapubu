import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cancelBooking } from "@/services/reservation/reservation.api";
import { getBookingAccess } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { ReservationStatus } from "@/components/reservations/reservation-status";
import { ReservationForm } from "@/components/reservations/reservation-form";
import { reservationActions } from "@/utils/reservation-display";
import { useAppStore } from "@/stores/app.store";

export default function ReservationDetailPage() {
  const { reservationId = "" } = useParams(); const navigate = useNavigate(); const { storeId, storePhone } = useAppStore();
  const access = getBookingAccess(storeId, reservationId); const query = useCustomerReservation(access, reservationId);
  const [changing, setChanging] = useState(false); const [error, setError] = useState(""); const [cancelling, setCancelling] = useState(false); const [callingLater, setCallingLater] = useState(false);
  if (!access) return <div className="p-4 text-small text-text-secondary">Không tìm thấy quyền xem đặt bàn này trên thiết bị. Vui lòng liên hệ quán.</div>;
  if (query.isLoading) return <div className="p-4 text-small text-text-secondary">Đang tải đặt bàn…</div>;
  if (query.error || !query.data) return <div className="p-4 text-small text-[#C0341A]">Không thể tải đặt bàn khi đang ngoại tuyến. Hãy thử lại khi có mạng.</div>;
  const booking = query.data; const actions = reservationActions(booking);
  const cancel = async () => { if (!window.confirm("Bạn chắc chắn muốn hủy đặt bàn này?")) return; setCancelling(true); setError(""); try { await cancelBooking(access, "Khách hủy từ Mini App"); await query.refetch(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hủy đặt bàn"); } finally { setCancelling(false); } };
  return <div className="min-h-full bg-[#F7F8FA] p-4"><ReservationStatus booking={booking} />{changing ? <ReservationForm mode="change" booking={booking} access={access} onSuccess={() => { setChanging(false); query.refetch(); }} /> : <div className="mt-4 space-y-3">{actions.canRequestChange && <button onClick={() => setChanging(true)} className="w-full rounded-xl border border-primary py-3 text-small-m font-bold text-primary">Đổi giờ đến / số khách</button>}{actions.canCancel && <button onClick={cancel} disabled={cancelling} className="w-full rounded-xl border border-rose-200 py-3 text-small-m font-bold text-rose-600 disabled:opacity-50">{cancelling ? "Đang hủy…" : "Hủy đặt bàn"}</button>}{booking.status === "confirmed" && booking.canPreorder && <div className="rounded-xl bg-[#FFF3EC] p-3 text-small text-[#9A4634]"><p>Quán đã xác nhận. Bạn có thể chọn món trước để quán chuẩn bị chu đáo hơn.</p><button type="button" onClick={() => setCallingLater(true)} className="mt-2 font-semibold text-primary">Gọi sau tại quán</button>{callingLater && <p className="mt-2 text-xxsmall">Đã ghi nhận lựa chọn của bạn. Bạn vẫn có thể gọi món khi đến quán.</p>}</div>}{error && <p className="rounded-xl bg-[#FDEDE9] p-3 text-small text-[#C0341A]">{error}</p>}{storePhone ? <a href={`tel:${storePhone}`} className="block text-center text-small font-semibold text-primary">Gọi quán: {storePhone}</a> : <p className="text-center text-small text-text-secondary">Cần hỗ trợ? Vui lòng hỏi nhân viên tại quán.</p>}<button onClick={() => navigate("/reservations")} className="w-full py-2 text-small text-text-secondary">Quay lại danh sách</button></div>}</div>;
}
