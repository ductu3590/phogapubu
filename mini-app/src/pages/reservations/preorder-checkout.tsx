import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBookingAccess } from "@/services/reservation/reservation-storage";
import { submitPreorder } from "@/services/reservation/preorder.api";
import { useAppStore } from "@/stores/app.store";
import { usePreorderCartStore } from "@/stores/preorder-cart.store";
import { formatCurrency } from "@/utils/format";

export default function ReservationPreorderCheckoutPage() {
  const { reservationId = "" } = useParams(); const navigate = useNavigate(); const { storeId } = useAppStore(); const access = getBookingAccess(storeId, reservationId);
  const drafts = usePreorderCartStore((s) => s.drafts); const requestId = usePreorderCartStore((s) => s.requestId); const clear = usePreorderCartStore((s) => s.clear); const items = drafts[`${storeId}:${reservationId}`]?.items ?? [];
  const [sending, setSending] = useState(false); const [error, setError] = useState("");
  const total = items.reduce((sum, item) => sum + (item.basePrice + item.selectedVariants.reduce((s, v) => s + v.extraPrice * (v.quantity ?? 1), 0)) * item.quantity, 0);
  const send = async () => { if (!access || items.length === 0) return; setSending(true); setError(""); try { const batch = await submitPreorder(access, requestId(storeId, reservationId), items.map((x) => ({ productId: x.productId, quantity: x.quantity, note: x.note ?? null, variantId: x.variant?.id ?? null, toppingIds: x.selectedVariants.map((v) => v.optionId) })), null); clear(storeId, reservationId); window.alert(batch.customerMessage || "Đã gửi món đặt trước. Món đã chốt, vui lòng gọi thêm tại quán nếu cần."); navigate(`/reservations/${reservationId}`, { replace: true }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể gửi món, vui lòng thử lại"); } finally { setSending(false); } };
  if (!access) return <div className="p-4 text-small text-text-secondary">Không tìm thấy quyền đặt món trước.</div>;
  return <div className="min-h-full bg-[#F7F8FA] p-4"><div className="rounded-xl bg-white p-4"><h2 className="text-large-m font-bold">Xác nhận món đặt trước</h2><p className="mt-2 text-small text-text-secondary">Sau khi gửi, món đã chốt và chỉ có thể gọi thêm khi đến quán.</p>{items.map((item) => <div key={item.id} className="mt-3 flex justify-between text-small"><span>{item.productName} × {item.quantity}</span><b>{formatCurrency(item.basePrice * item.quantity)}đ</b></div>)}<div className="mt-4 flex justify-between border-t pt-3 font-bold"><span>Tổng tạm tính</span><span className="text-primary">{formatCurrency(total)}đ</span></div></div>{error && <p className="mt-3 rounded-xl bg-[#FDEDE9] p-3 text-small text-[#C0341A]">{error}</p>}<button disabled={sending || items.length === 0} onClick={send} className="mt-4 w-full rounded-xl bg-primary py-3 font-bold text-white disabled:opacity-50">{sending ? "Đang gửi…" : "Xác nhận đặt trước món"}</button></div>;
}
