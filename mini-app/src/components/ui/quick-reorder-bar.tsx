import { BeerIcon, MinusIcon, PlusIcon } from "@/components/common/icons";
import { useCartStore } from "@/stores/cart.store";
import { buildCartItemId } from "@/utils/cart-key";
import { formatCurrency } from "@/utils/format";
import type { QuickReorderPick } from "@/utils/quick-reorder";

// Nút gọi thêm nhanh (mig 136): một hàng dính ngay trên thanh giỏ, gợi ý đúng món + đúng cỡ bàn
// đã gọi gần nhất (bia, rượu). Bấm là thêm 1 vào giỏ, không mở bảng chọn; khách vẫn gửi đơn như
// mọi lượt khác. Layout quyết định có hiện hay không — component này chỉ vẽ và sửa giỏ.
// ordered: bàn đã gọi bao nhiêu phần đúng món + cỡ này (orderedQuantity) — theme garden ghi "bàn đã gọi N".
export default function QuickReorderBar({ pick, ordered = 0 }: { pick: QuickReorderPick; ordered?: number }) {
  const { product, variant } = pick;
  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  // Cùng khoá dòng giỏ với món thêm từ menu (không topping) → cộng dồn chung một dòng.
  const lineId = buildCartItemId({
    productId: product.id,
    selectedVariants: [],
    variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
  });
  const inCart = items.find((i) => i.id === lineId)?.quantity ?? 0;
  const price = variant ? variant.price : product.price;

  const add = () => {
    if (inCart > 0) {
      updateQuantity(lineId, inCart + 1);
      return;
    }
    addToCart({
      productId: product.id,
      productName: product.name,
      productImage: product.image ?? "",
      basePrice: price,
      variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : undefined,
      selectedVariants: [],
      quantity: 1,
    });
  };

  return (
    <div className="shrink-0 px-3 pt-2 garden:pt-2.5">
      <div className="flex h-[52px] items-center gap-2.5 rounded-2xl border border-neutral100 bg-surface pl-2.5 pr-2 shadow-card garden:h-14 garden:gap-3 garden:rounded-[18px] garden:border-0 garden:pl-3">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primary/10 text-primary garden:size-10 garden:rounded-xl garden:bg-primary/15">
          <BeerIcon className="size-[18px] garden:hidden" />
          {/* Garden: cốc bia đơn giản như bản vẽ (BeerIcon lucide có bọt nhìn giống thùng rác ở cỡ nhỏ) */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="hidden size-[22px] garden:block">
            <path d="M5 7h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M5 7c0-2 1.5-3 3-3 1 0 1.5.5 2 1 .5-.7 1.2-1 2-1 1.7 0 3 1.2 3 3" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          {/* Garden (bản vẽ): "Bia hơi Hà Nội · Ca 1 lít" / "Bàn đã gọi 2 · 60.000đ". */}
          <p className="truncate text-small-m font-bold leading-tight text-text-primary garden:text-large garden:font-semibold">
            {product.name}
            {variant && <span className="hidden garden:inline"> · {variant.name}</span>}
          </p>
          <p className="tabular truncate text-xxsmall leading-tight text-text-secondary garden:text-xsmall">
            {ordered > 0 && <span className="hidden garden:inline">Bàn đã gọi {ordered} · </span>}
            {variant && <span className="garden:hidden">{variant.name} · </span>}
            {formatCurrency(price)}đ
          </p>
        </div>
        {inCart > 0 ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-1 text-white garden:h-11">
            <button type="button" aria-label={`Bớt một ${product.name}`} onClick={() => updateQuantity(lineId, inCart - 1)} className="grid size-7 place-items-center rounded-full bg-white/15 active:scale-90 garden:size-9"><MinusIcon className="size-3.5" /></button>
            <span className="tabular min-w-4 text-center text-small-m font-bold">{inCart}</span>
            <button type="button" aria-label={`Thêm một ${product.name}`} onClick={add} className="grid size-7 place-items-center rounded-full bg-white/15 active:scale-90 garden:size-9"><PlusIcon className="size-3.5" /></button>
          </span>
        ) : (
          <button type="button" onClick={add} aria-label={`Gọi thêm 1 ${product.name}${variant ? ` ${variant.name}` : ""}`} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-primary pl-2.5 pr-3.5 text-small-m font-bold text-white active:opacity-80 garden:h-11 garden:bg-primary/15 garden:pl-3 garden:pr-4 garden:text-[15px] garden:font-semibold garden:text-primary">
            <PlusIcon className="size-4 garden:size-[18px]" />
            Thêm 1
          </button>
        )}
      </div>
    </div>
  );
}
