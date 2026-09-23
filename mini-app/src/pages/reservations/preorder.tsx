import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStoreMenu } from "@/services/category/category.queries";
import { getBookingAccess } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { useAppStore } from "@/stores/app.store";
import { usePreorderCartStore } from "@/stores/preorder-cart.store";
import OptionSheet from "@/components/menu/option-sheet";
import type { Product, Variant } from "@/types/product.types";
import type { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";

export default function ReservationPreorderPage() {
  const { reservationId = "" } = useParams(); const navigate = useNavigate(); const { storeId } = useAppStore();
  const access = getBookingAccess(storeId, reservationId); const booking = useCustomerReservation(access, reservationId); const { data: menu } = useStoreMenu(storeId);
  const drafts = usePreorderCartStore((s) => s.drafts); const add = usePreorderCartStore((s) => s.add); const items = drafts[`${storeId}:${reservationId}`]?.items ?? [];
  const [option, setOption] = useState<Product | null>(null);
  if (!access) return <Message text="Không tìm thấy quyền xem đặt bàn này trên thiết bị. Vui lòng liên hệ quán." />;
  if (booking.isLoading || !menu) return <Message text="Đang tải menu đặt trước…" />;
  if (!booking.data || booking.data.status !== "confirmed" || !booking.data.canPreorder) return <Message text="Đặt bàn này chưa thể chọn món trước. Vui lòng gọi món khi đến quán." />;
  const addProduct = (product: Product) => {
    if (!product.isAvailable) return;
    if (product.variants.length || product.toppings.length) return setOption(product);
    add(storeId, reservationId, { productId: product.id, productName: product.name, productImage: product.image ?? "", basePrice: product.price, selectedVariants: [], quantity: 1 });
  };
  const confirmOption = (variant: Variant | null, toppings: SelectedVariant[]) => {
    if (!option) return; add(storeId, reservationId, { productId: option.id, productName: option.name, productImage: option.image ?? "", basePrice: variant?.price ?? option.price, variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined, selectedVariants: toppings, quantity: 1 }); setOption(null);
  };
  const total = items.reduce((sum, item) => sum + (item.basePrice + item.selectedVariants.reduce((s, v) => s + v.extraPrice * (v.quantity ?? 1), 0)) * item.quantity, 0);
  return <div className="min-h-full bg-[#F7F8FA] pb-24">
    <div className="bg-[#FFF3EC] px-4 py-3 text-small text-[#9A4634]">Chọn món để quán chuẩn bị trước. Sau khi gửi, món sẽ không thể sửa hoặc hủy.</div>
    {menu.map((category) => <section key={category.id} className="mt-3 bg-white"><h2 className="border-b border-neutral100 px-4 py-3 text-large-m font-semibold">{category.name}</h2>{category.products.map((p) => <button key={p.id} disabled={!p.isAvailable} onClick={() => addProduct(p)} className="flex w-full items-center justify-between border-b border-neutral100 px-4 py-3 text-left disabled:opacity-50"><span><span className="block text-normal-sb">{p.name}</span><span className="text-small text-primary">{formatCurrency(p.price)}đ</span></span><span className="rounded-full bg-primary px-3 py-1 text-small font-bold text-white">Thêm</span></button>)}</section>)}
    <OptionSheet product={option} visible={option !== null} onClose={() => setOption(null)} onConfirm={confirmOption} />
    {items.length > 0 && <button onClick={() => navigate(`/reservations/${reservationId}/preorder/checkout`)} className="fixed bottom-4 left-4 right-4 z-20 flex justify-between rounded-xl bg-primary px-4 py-3 text-white"><span>{items.reduce((n, x) => n + x.quantity, 0)} món đã chọn</span><b>{formatCurrency(total)}đ · Gửi món trước</b></button>}
  </div>;
}
function Message({ text }: { text: string }) { return <div className="p-4 text-small text-text-secondary">{text}</div>; }
