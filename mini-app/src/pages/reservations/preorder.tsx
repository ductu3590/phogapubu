import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStoreMenu } from "@/services/category/category.queries";
import { getBookingAccess } from "@/services/reservation/reservation-storage";
import { useCustomerReservation } from "@/services/reservation/reservation.queries";
import { useAppStore } from "@/stores/app.store";
import { usePreorderCartStore } from "@/stores/preorder-cart.store";
import OptionSheet from "@/components/menu/option-sheet";
import ProductCard from "@/components/ui/product-card";
import CategoryChips from "@/components/ui/category-chips";
import SectionHeading from "@/components/ui/section-heading";
import StickyActionBar from "@/components/ui/sticky-action-bar";
import { ArrowRightIcon, CalendarDaysIcon, SearchIcon, UsersIcon, UtensilsIcon } from "@/components/common/icons";
import type { Product, Variant } from "@/types/product.types";
import type { SelectedVariant } from "@/types/cart.types";
import { formatCurrency } from "@/utils/format";
import { formatReservationTime } from "@/utils/reservation-display";
import { matchesQuery } from "@/utils/search-fold";
import { pickProductLayout } from "@/utils/product-layout";
import { activeCategoryAt } from "@/utils/active-category";
import { preorderTotals } from "@/utils/preorder-totals";

// Chọn món đặt trước khi đến (Stitch m04). Bỏ "Gợi ý cho đoàn N người", gợi ý riêng từng món và
// "hoàn tiền 100%" (không có dữ liệu thật). Giỏ món đặt trước + bảng chọn loại/topping giữ nguyên.
export default function ReservationPreorderPage() {
  const { reservationId = "" } = useParams();
  const navigate = useNavigate();
  const { storeId } = useAppStore();
  const access = getBookingAccess(storeId, reservationId);
  const booking = useCustomerReservation(access, reservationId);
  const { data: menu } = useStoreMenu(storeId);
  const drafts = usePreorderCartStore((s) => s.drafts);
  const add = usePreorderCartStore((s) => s.add);
  const updateQuantity = usePreorderCartStore((s) => s.updateQuantity);
  const items = drafts[`${storeId}:${reservationId}`]?.items ?? [];
  const [option, setOption] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  const back = () => navigate(`/reservations/${reservationId}`, { replace: true });
  if (!access) return <Notice text="Không tìm thấy quyền xem đặt bàn này trên thiết bị. Vui lòng liên hệ quán." onBack={back} />;
  if (booking.isError) return <Notice text="Không tải được thông tin đặt bàn. Kiểm tra mạng rồi mở lại trang." onBack={back} />;
  if (booking.isLoading || !menu) return <div className="space-y-3 p-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />)}</div>;
  if (!booking.data || booking.data.status !== "confirmed" || !booking.data.canPreorder) {
    return <Notice text="Đặt bàn này chưa thể chọn món trước (quán chưa xác nhận hoặc đã quá hạn chọn món). Bạn vẫn gọi món khi đến quán." onBack={back} />;
  }
  const b = booking.data;

  const visibleMenu = query.trim()
    ? menu.map((c) => ({ ...c, products: c.products.filter((p) => matchesQuery(p.name, query)) })).filter((c) => c.products.length > 0)
    : menu;
  const currentId = activeId || visibleMenu[0]?.id || "";
  const totals = preorderTotals(items);
  const countOf = (productId: string) => items.filter((x) => x.productId === productId).reduce((n, x) => n + x.quantity, 0);
  // Dòng giỏ "trơn" (không loại, không topping) của món — để nút −/+ trên thẻ chỉnh đúng dòng đó.
  const plainLine = (productId: string) => items.find((x) => x.productId === productId && !x.variant && x.selectedVariants.length === 0);

  const addProduct = (product: Product) => {
    if (!product.isAvailable) return;
    // Món có nhóm loại mà tắt bán hết loại → không được thêm ở giá cũ (bẫy mig 042).
    if (product.hasVariantGroup && product.variants.length === 0) return;
    if (product.variants.length || product.toppings.length) return setOption(product);
    const line = plainLine(product.id);
    if (line) return updateQuantity(storeId, reservationId, line.id, line.quantity + 1);
    add(storeId, reservationId, { productId: product.id, productName: product.name, productImage: product.image ?? "", basePrice: product.price, selectedVariants: [], quantity: 1 });
  };
  const decrease = (product: Product) => {
    const line = plainLine(product.id);
    if (line) updateQuantity(storeId, reservationId, line.id, line.quantity - 1);
  };
  const confirmOption = (variant: Variant | null, toppings: SelectedVariant[]) => {
    if (!option) return;
    add(storeId, reservationId, {
      productId: option.id, productName: option.name, productImage: option.image ?? "",
      basePrice: variant?.price ?? option.price,
      variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
      selectedVariants: toppings, quantity: 1,
    });
    setOption(null);
  };
  const scrollToCategory = (id: string) => {
    const box = listRef.current;
    const el = document.getElementById(`pre-${id}`);
    if (!box || !el) return;
    const headingInBox = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: Math.max(0, headingInBox - (stickyRef.current?.offsetHeight ?? 0)), behavior: "smooth" });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div
        ref={listRef}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
        onScroll={() => {
          const headings: Array<{ id: string; top: number }> = [];
          for (const c of visibleMenu) {
            const el = document.getElementById(`pre-${c.id}`);
            if (el) headings.push({ id: c.id, top: el.getBoundingClientRect().top });
          }
          const ref = stickyRef.current?.getBoundingClientRect().bottom ?? 0;
          const next = activeCategoryAt(headings, ref);
          if (next) setActiveId(next);
        }}
      >
        {/* Thẻ lịch hẹn (m04) */}
        <section className="mx-3 mt-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-xxsmall font-semibold uppercase tracking-wide text-primary">Đặt món trước cho lịch hẹn</p>
          <p className="mt-1 text-normal-sb font-bold text-text-primary">{b.customerName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-text-secondary">
            <span className="inline-flex items-center gap-1"><CalendarDaysIcon className="size-4" />{formatReservationTime(b.arrivalAt)}</span>
            <span className="inline-flex items-center gap-1"><UsersIcon className="size-4" />{b.partySize} khách</span>
          </div>
          <p className="mt-2 text-xxsmall text-text-secondary">Quán chuẩn bị sẵn theo giờ hẹn. Gửi xong món sẽ được chốt, muốn thêm thì gọi khi đến quán.</p>
        </section>

        <div ref={stickyRef} className="sticky top-0 z-10 bg-background/95 pb-0.5 backdrop-blur">
          <label className="mx-3 mt-2.5 flex h-10 items-center gap-2 rounded-full border border-neutral200 bg-surface px-3.5">
            <SearchIcon className="size-4 shrink-0 text-text-secondary" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm món…" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-small outline-none" />
          </label>
          <CategoryChips items={visibleMenu.map((c) => ({ id: c.id, name: c.name }))} activeId={currentId} onSelect={(id) => { setActiveId(id); scrollToCategory(id); }} />
        </div>

        {visibleMenu.length === 0 ? (
          <p className="px-6 py-10 text-center text-small text-text-secondary">Không tìm thấy món phù hợp.</p>
        ) : (
          visibleMenu.map((c) => {
            const layout = pickProductLayout(c.products);
            const card = (p: Product) => {
              const hasOptions = p.variants.length > 0 || p.toppings.length > 0;
              return (
                <ProductCard
                  key={p.id}
                  product={p}
                  layout={layout}
                  canOrder
                  count={hasOptions ? countOf(p.id) : plainLine(p.id)?.quantity ?? 0}
                  onAdd={() => addProduct(p)}
                  onDecrease={() => decrease(p)}
                />
              );
            };
            return (
              <section key={c.id}>
                <SectionHeading id={`pre-${c.id}`} title={c.name} count={c.products.length} />
                {layout === "grid" ? (
                  <div className="grid grid-cols-2 gap-3 px-3">{c.products.map(card)}</div>
                ) : (
                  <div className="mx-3 divide-y divide-neutral100 overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.06)]">{c.products.map(card)}</div>
                )}
              </section>
            );
          })
        )}
        <div className="h-6" />
      </div>

      {totals.count > 0 && (
        <StickyActionBar variant="dark" aboveTabBar={false}>
          <button
            type="button"
            onClick={() => navigate(`/reservations/${reservationId}/preorder/checkout`)}
            className="flex w-full items-center gap-3 rounded-2xl bg-neutral900 px-3 py-2.5 text-left text-white shadow-lg active:opacity-90"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10"><UtensilsIcon className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-small-m font-semibold">{totals.count} món đặt trước</span>
              <span className="block text-normal-sb font-bold">{formatCurrency(totals.total)}đ</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3.5 py-2 text-small-m font-bold">Xem món<ArrowRightIcon className="size-4" /></span>
          </button>
        </StickyActionBar>
      )}

      <OptionSheet product={option} visible={option !== null} onClose={() => setOption(null)} onConfirm={confirmOption} />
    </div>
  );
}

function Notice({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><UtensilsIcon className="size-8" /></span>
      <p className="text-small text-text-secondary">{text}</p>
      <button type="button" onClick={onBack} className="rounded-full bg-primary px-5 py-2.5 text-small-m font-bold text-white">Về chi tiết đặt bàn</button>
    </div>
  );
}
